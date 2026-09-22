// Thin client for the FC27 web app backend (UTAS) + public content CDN.
// All UTAS calls go through one throttled queue so we never burst EA.

const UTAS = 'https://utas.mob.v1.prd.futc-ext.gcp.ea.com/ut/game/fc27';
const WEB_APP = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app';
const DEFAULT_CONTENT_GUID = '27A3C9F1-6B2E-4D7A-8C1F-2E9B5A4D6C7E';
const MIN_GAP_MS = 1500;
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

export interface ClubItem {
  id: number;
  assetId: number;
  resourceId: number;
  rating: number;
  rareflag: number;
  preferredPosition: string;
  possiblePositions: string[];
  teamid: number;
  leagueId: number;
  nation: number;
  untradeable: boolean;
  itemState: string;
  loansInfo?: { loanType: string; loanValue: number } | null;
  groups?: number[];
  guidAssetId?: string;
  marketDataMinPrice?: number;
  marketAverage?: number;
  owners?: number;
  pile?: number;
  attributeArray?: number[];
  skillmoves?: number;
  weakfootabilitytypecode?: number;
  preferredfoot?: number;
}

export interface EligibilityReq {
  type: string;
  eligibilitySlot: number;
  eligibilityKey: number;
  eligibilityValue: number;
}

export interface Challenge {
  challengeId: number;
  setId: number;
  name: string;
  description: string;
  status: string;
  formation: string;
  repeatable: boolean;
  timesCompleted: number;
  elgReq: EligibilityReq[];
  elgOperation: 'AND' | 'OR';
  awards: unknown[];
  endTime: number;
}

export interface SbcSet {
  setId: number;
  name: string;
  description: string;
  categoryId: number;
  challengesCount: number;
  challengesCompletedCount: number;
  hidden: boolean;
  repeatable: boolean;
  /** NON_REPEATABLE, UNLIMITED, or REFRESH (`repeats` times per `repeatRefreshInterval` seconds). */
  repeatabilityMode?: 'NON_REPEATABLE' | 'UNLIMITED' | 'REFRESH';
  repeats?: number;
  repeatRefreshInterval?: number;
  timesCompleted: number;
  timesCompletedInInterval?: number;
  lastCompletedTime?: number; // unix seconds
  releaseTime?: number; // unix seconds; REFRESH windows start from here
  endTime: number;
  setImageId: string;
  awards: unknown[];
}

export class SessionError extends Error {
  constructor(msg: string, public status: number) {
    super(msg);
  }
}

/** Public content CDN (same for every account). */
class Content {
  guid = DEFAULT_CONTENT_GUID;

  get base() {
    return `${WEB_APP}/content/${this.guid}/2027/fut`;
  }

  async get<T>(path: string, base = this.base): Promise<T> {
    const res = await fetch(`${base}/${path}`, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`content ${path} -> HTTP ${res.status}`);
    const text = await res.text();
    return JSON.parse(text.replace(/^\uFEFF/, '')) as T;
  }

  webAppLoc<T>(): Promise<T> {
    return this.get<T>('loc/en-US.json', WEB_APP);
  }
}

export const content = new Content();

/** One UTAS client per EA account; its calls are serialized with a minimum gap. */
export class Utas {
  private chain: Promise<unknown> = Promise.resolve();
  private lastCallAt = 0;
  onExpired: (() => void) | null = null;

  constructor(public sid: string) {}

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = async () => {
      const wait = this.lastCallAt + MIN_GAP_MS - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await fn();
      } finally {
        this.lastCallAt = Date.now();
      }
    };
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => undefined);
    return p;
  }

  private call<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    return this.enqueue(async () => {
      const res = await fetch(UTAS + path, {
        method: init.method ?? 'GET',
        headers: {
          Accept: '*/*',
          'Content-Type': 'application/json',
          Origin: 'https://www.ea.com',
          Referer: 'https://www.ea.com/',
          'User-Agent': UA,
          'X-UT-SID': this.sid,
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      if (res.status === 401 || res.status === 403) {
        this.onExpired?.();
        throw new SessionError('EA session expired. Reopen the web app to refresh it.', 401);
      }
      if (res.status === 429 || res.status === 458 || res.status === 512 || res.status === 521) {
        throw new SessionError(`EA is rate limiting / blocking requests (HTTP ${res.status}). Try again later.`, 429);
      }
      if (!res.ok) throw new Error(`EA ${path} -> HTTP ${res.status}`);
      return (await res.json()) as T;
    });
  }

  userInfo(): Promise<{ userInfo: { personaId: number; personaName: string; clubName: string } }> {
    return this.call('/usermassinfo');
  }

  async clubPlayerCount(): Promise<number> {
    const r = await this.call<{ stat: { type: string; typeValue: number }[] }>('/club/stats/club');
    return r.stat.find((s) => s.type === 'players')?.typeValue ?? 0;
  }

  async clubPlayers(): Promise<ClubItem[]> {
    const total = await this.clubPlayerCount();
    const pageSize = 91;
    const items: ClubItem[] = [];
    for (let start = 0; start < total; start += pageSize) {
      const page = await this.call<{ itemData: ClubItem[] }>('/club', {
        method: 'POST',
        body: { count: pageSize, searchAltPositions: true, sort: 'desc', sortBy: 'ovr', start, type: 'player' },
      });
      items.push(...page.itemData);
      if (page.itemData.length < pageSize) break;
    }
    return items;
  }

  /** Item ids in the active squad: first 11 are the starting XI, the rest subs/reserves. */
  async activeSquad(): Promise<{ starters: number[]; bench: number[] }> {
    const list = await this.call<{ activeSquadId: number }>('/squad/list');
    const squad = await this.call<{ players: { index: number; itemData: { id: number } }[] }>(`/squad/${list.activeSquadId}`);
    const ids = squad.players
      .filter((p) => p.itemData?.id)
      .sort((a, b) => a.index - b.index)
      .map((p) => ({ index: p.index, id: p.itemData.id }));
    return {
      starters: ids.filter((p) => p.index < 11).map((p) => p.id),
      bench: ids.filter((p) => p.index >= 11).map((p) => p.id),
    };
  }

  sets(): Promise<{ categories: { categoryId: number; name: string; sets: SbcSet[] }[] }> {
    return this.call('/sbs/sets');
  }

  challenges(setId: number): Promise<{ challenges: Challenge[] }> {
    return this.call(`/sbs/setId/${setId}/challenges`);
  }

  chemistryProfiles(): Promise<ChemProfilesResponse> {
    return this.call('/chemistry/profiles');
  }
}

export interface ChemProfilesResponse {
  version: number;
  profiles: {
    id: number;
    baseOverride: boolean;
    iconOverride: boolean;
    heroOverride: boolean;
    fullChemistryOnPreferredPosition?: boolean;
    rules: { parameterType: 'NATION' | 'LEAGUE' | 'CLUB'; calculationType: string; value: number }[];
  }[];
  mappings: { profileId: number; rarityIds: number[] }[];
}

