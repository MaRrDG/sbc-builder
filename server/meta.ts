// Static game metadata: names, formations, chemistry rules, card rarity art.
// Comes from the public content CDN, cached on disk (refreshed with the 24h sync).
import { content, type ChemProfilesResponse } from './ea.js';
import { readCache, writeCache, isStale, DAY_MS, type Cached } from './store.js';
import teamLinks from './data/teamLinks.json' with { type: 'json' };

export const LEGENDS_CLUB_ID = 112658;
export const LEGENDS_LEAGUE_ID = 2118;
export const HERO_CLUB_ID = 114605;
export const HALL_OF_FUT_CLUB_ID = 132794;
export const STAR_RATING_THRESHOLDS = [0, 59, 62, 64, 66, 68, 70, 74, 78, 82, 99];

export const POSITION_IDS: Record<string, number> = {
  GK: 0, SW: 1, RWB: 2, RB: 3, RCB: 4, CB: 5, LCB: 6, LB: 7, LWB: 8, RDM: 9, CDM: 10, LDM: 11,
  RM: 12, RCM: 13, CM: 14, LCM: 15, LM: 16, RAM: 17, CAM: 18, LAM: 19, RF: 20, CF: 21, LF: 22,
  RW: 23, RS: 24, ST: 25, LS: 26, LW: 27,
};

export type ParamId = 1 | 2 | 3; // nation, league, club
export const NATION = 1 as const;
export const LEAGUE = 2 as const;
export const CLUB = 3 as const;

export interface ChemRule {
  value: number;
  universal: boolean;
}

export interface ChemProfile {
  id: number;
  maxChem: boolean;
  rules: Record<ParamId, ChemRule>;
}

export interface Threshold {
  requirement: number;
  points: number;
}

export interface Meta {
  names: {
    nation: Record<string, string>;
    league: Record<string, string>;
    club: Record<string, string>;
    rarity: Record<string, string>;
    group: Record<string, string>;
    loc: Record<string, string>;
  };
  players: Record<string, { name: string; full: string }>;
  formations: Record<string, { uniqueId: number; name: string; typeId: number }[]>;
  thresholds: Record<ParamId, Threshold[]>;
  baseProfiles: Record<number, ChemProfile>; // 1 base, 2 hero, 3 icon
  rarityProfiles: Record<string, ChemProfile>; // rareflag -> profile (live promos)
  rarities: Record<string, { guid: string; levels: boolean; colors: number[]; lgColorIndices: number[] }>;
  teamLinks: Record<string, number>;
  contentBase: string;
}

// Parsed once: the static file is ~2 MB. Built metas are kept per account (chemistry profiles differ).
let staticData: Cached<Awaited<ReturnType<typeof fetchStatic>>> | null = null;
const metas = new Map<string, Meta>();

interface SquadData {
  chemistry: {
    params: { id: number; thresholdId: number }[];
    thresholds: { id: number; data: { points: number; value: number }[] }[];
    profiles: { id: number; maxChem: boolean; rules: { parameterId: number; value: number; type: number }[] }[];
  };
  formationData: { name: string; uniquePositionSlots: number[] }[];
  positionData: { uniqueId: number; typeId: number; uniqueName: string }[];
}

async function fetchStatic() {
  const [players, loc, squad, rarity] = await Promise.all([
    content.get<{ Players: P[]; LegendsPlayers: P[] }>('items/web/players.json'),
    content.webAppLoc<Record<string, string>>(),
    content.get<SquadData>('config/companion/squadData.json'),
    content.get<{ rarities: { id: number; guid: string; levels: boolean; colors: number[]; lgColorIndices: number[] }[] }>(
      'items/images/backgrounds/itemBGs/futcompitemraritytunables.json',
    ),
  ]);
  return { players, loc, squad, rarity };
}

interface P {
  id: number;
  f: string;
  l: string;
  c?: string;
  r: number;
}

function pickLoc(loc: Record<string, string>, re: RegExp) {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(loc)) {
    const m = k.match(re);
    if (m) out[m[1]] = v;
  }
  return out;
}

function toProfile(p: SquadData['chemistry']['profiles'][number]): ChemProfile {
  const rules = {} as Record<ParamId, ChemRule>;
  for (const r of p.rules) rules[r.parameterId as ParamId] = { value: r.value, universal: r.type === 2 };
  return { id: p.id, maxChem: p.maxChem, rules };
}

function remoteProfiles(resp: ChemProfilesResponse | null): Record<string, ChemProfile> {
  if (!resp) return {};
  const ids: Record<string, ParamId> = { NATION, LEAGUE, CLUB };
  const byId = new Map(
    resp.profiles.map((p) => {
      const rules = {} as Record<ParamId, ChemRule>;
      for (const r of p.rules)
        rules[ids[r.parameterType]] = { value: r.value, universal: r.calculationType !== 'NORMAL' };
      return [p.id, { id: p.id, maxChem: !!p.fullChemistryOnPreferredPosition, rules }] as const;
    }),
  );
  const out: Record<string, ChemProfile> = {};
  for (const m of resp.mappings) {
    const prof = byId.get(m.profileId);
    if (prof) for (const r of m.rarityIds) out[r] = prof;
  }
  return out;
}

function build(raw: Awaited<ReturnType<typeof fetchStatic>>, chem: ChemProfilesResponse | null): Meta {
  const { players, loc, squad, rarity } = raw;
  const playerNames: Meta['players'] = {};
  for (const p of [...players.Players, ...players.LegendsPlayers]) {
    playerNames[p.id] = { name: p.c || p.l || p.f, full: `${p.f} ${p.l}`.trim() };
  }

  const posById = new Map(squad.positionData.map((p) => [p.uniqueId, p]));
  const formations: Meta['formations'] = {};
  for (const f of squad.formationData) {
    formations[f.name] = f.uniquePositionSlots.map((u) => {
      const p = posById.get(u)!;
      return { uniqueId: u, name: p.uniqueName, typeId: p.typeId };
    });
  }

  const thresholds = {} as Meta['thresholds'];
  for (const param of squad.chemistry.params) {
    const t = squad.chemistry.thresholds.find((x) => x.id === param.thresholdId)!;
    thresholds[param.id as ParamId] = t.data.map((d) => ({ requirement: d.value, points: d.points }));
  }

  const rarities: Meta['rarities'] = {};
  for (const r of rarity.rarities)
    rarities[r.id] = { guid: r.guid, levels: r.levels, colors: r.colors, lgColorIndices: r.lgColorIndices };

  const sbcLoc = Object.fromEntries(
    Object.entries(loc).filter(([k]) => k.startsWith('sbc.requirements.') || k.startsWith('search.cardLevels.')),
  );

  return {
    names: {
      nation: pickLoc(loc, /^search\.nationName\.nation(\d+)$/),
      league: pickLoc(loc, /^global\.leagueFull\.2027\.league(\d+)$/),
      club: pickLoc(loc, /^global\.teamabbr15\.2027\.team(\d+)$/),
      rarity: pickLoc(loc, /^item\.raretype(\d+)$/),
      group: pickLoc(loc, /^Player_Group_(\d+)$/),
      loc: sbcLoc,
    },
    players: playerNames,
    formations,
    thresholds,
    baseProfiles: Object.fromEntries(squad.chemistry.profiles.map((p) => [p.id, toProfile(p)])),
    rarityProfiles: remoteProfiles(chem),
    rarities,
    teamLinks,
    contentBase: content.base,
  };
}

/** Meta for one account (chemistry promo profiles come from that account's sync). */
export async function loadMeta(chemKey?: string, force = false): Promise<Meta> {
  const id = chemKey ?? '';
  const hit = metas.get(id);
  if (hit && !force && !isStale(staticData, 7 * DAY_MS)) return hit;
  staticData ??= await readCache<Awaited<ReturnType<typeof fetchStatic>>>('static');
  if (force || isStale(staticData, 7 * DAY_MS)) {
    try {
      staticData = await writeCache('static', await fetchStatic());
      metas.clear();
    } catch (e) {
      if (!staticData) throw e;
      console.warn('static content refresh failed, using cache:', (e as Error).message);
    }
  }
  const chem = chemKey ? await readCache<ChemProfilesResponse>(chemKey) : null;
  const built = build(staticData!.data, chem?.data ?? null);
  metas.set(id, built);
  return built;
}

/** Drop a built meta, e.g. after that account's chemistry profiles were re-synced. */
export function invalidateMeta(chemKey?: string) {
  if (chemKey === undefined) metas.clear();
  else metas.delete(chemKey);
}
