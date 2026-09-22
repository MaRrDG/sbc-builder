// Typed fetch helpers. Every call carries the selected EA account.

export interface Player {
  id: number;
  assetId: number;
  resourceId: number;
  name: string;
  rating: number;
  rareflag: number;
  tier: 1 | 2 | 3;
  preferredPosition: string;
  possiblePositions: string[];
  club: number;
  league: number;
  nation: number;
  untradeable: boolean;
  state: string;
  isLoan: boolean;
  guidAssetId?: string;
  fullName: string;
  rarityName: string;
  attributes: number[];
  skillMoves: number;
  weakFoot: number;
  foot: 'Right' | 'Left';
}

export interface Account {
  personaId: number;
  personaName: string;
  clubName: string;
  sidUpdatedAt: number;
  session: boolean;
  extVersion?: string | null;
}

export interface EaRequests {
  today: number;
  limit: number;
  pausedUntil: number | null;
  byPath: Record<string, number>;
  recent: { at: number; method: string; path: string; status: number | null }[];
}

export interface SyncStatus {
  ea: EaRequests;
  clubSyncs: { used: number; limit: number };
  running: string | null;
  error: string | null;
  clubAt: number | null;
  sbcAt: number | null;
  editedAt: number | null;
  unassigned: number;
}

export interface Meta {
  names: { nation: Record<string, string>; league: Record<string, string>; club: Record<string, string>; rarity: Record<string, string> };
  formations: Record<string, { uniqueId: number; name: string; typeId: number }[]>;
  rarities: Record<string, { guid: string; levels: boolean; colors: number[]; lgColorIndices: number[] }>;
  contentBase: string;
}

export interface SbcSet {
  setId: number;
  name: string;
  description: string;
  categoryId: number;
  challengesCount: number;
  challengesCompletedCount: number;
  repeatable: boolean;
  repeatabilityMode?: 'NON_REPEATABLE' | 'UNLIMITED' | 'REFRESH';
  repeats?: number;
  repeatRefreshInterval?: number; // seconds
  timesCompleted: number;
  timesCompletedInInterval?: number;
  lastCompletedTime?: number; // unix seconds
  releaseTime?: number; // unix seconds
  endTime: number;
}

export interface Requirement {
  slot: number;
  scope: number;
  count: number;
  combined: boolean;
  text: string;
}

export interface Challenge {
  challengeId: number;
  setId: number;
  name: string;
  description: string;
  status: string;
  formation: string;
  elgOperation: 'AND' | 'OR';
  timesCompleted: number;
  repeatable: boolean;
  type?: string;
  requirements: Requirement[];
  /** what the web app's squad for this challenge holds (null until opened there) */
  layout: ChallengeLayout | null;
  /** EA locks slots here but FC Solver has not seen which yet */
  needsLayout: boolean;
}

export interface BrickInfo {
  custom: boolean;
  nation: number;
  league: number;
  club: number;
}

export interface ChallengeLayout {
  bricks: (BrickInfo & { index: number })[];
  placed: { index: number; itemId: number }[];
  capturedAt: number;
}

export interface SolveOptions {
  excludeIds: number[];
  excludeActiveSquad: boolean;
  excludeSquadReserves: boolean;
  excludeNations: number[];
  excludeLeagues: number[];
  excludeClubs: number[];
  onlyUntradeable: boolean;
  maxRating: number;
  excludeSpecial: boolean;
  keepPlaced: boolean;
}

export interface SlotResult {
  position: { uniqueId: number; name: string; typeId: number };
  player: Player | null;
  chem: number;
  brick?: BrickInfo | null;
  fixed?: boolean;
}

export interface SolveResult {
  found: boolean;
  reasons?: string[];
  status?: string;
  ms: number;
  cost?: number;
  missingPlaced?: number[];
  placed?: { kept: number; total: number };
  eval: { rating: number; chemistry: number; results: { text: string; met: boolean; actual: number | string }[]; allMet: boolean };
  slots: SlotResult[];
}

// Access keys come from the extension (URL fragment #keys=...) and live in this browser only.
const KEYS = 'sbc-account-keys';

export function storedKeys(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS) ?? '[]');
  } catch {
    return [];
  }
}

export function storeKeys(keys: string[]) {
  try {
    localStorage.setItem(KEYS, JSON.stringify([...new Set(keys)]));
  } catch {
    /* private mode: keys stay in memory for this tab */
  }
}

/** Pull keys handed over by the extension and scrub them from the address bar. */
export function absorbKeysFromUrl(): string[] {
  const m = window.location.hash.match(/keys=([\w,-]+)/);
  if (!m) return storedKeys();
  const keys = [...new Set([...m[1].split(',').filter(Boolean), ...storedKeys()])];
  storeKeys(keys);
  history.replaceState(null, '', window.location.pathname + window.location.search);
  return keys;
}

let accountKey: string | null = null;
export const setAccountKey = (key: string | null) => (accountKey = key);

async function req<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(accountKey ? { 'X-Account-Key': accountKey } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

export const api = {
  accounts: (keys: string[]) => req<{ accounts: { key: string; account: Account }[] }>('/api/accounts', { method: 'POST', body: { keys } }),
  status: () =>
    req<{ account: Account | null; sync: SyncStatus | null; extension: { version: string; notes: string[] } | null }>('/api/status'),
  sync: (what: 'club') => req<SyncStatus>('/api/sync', { method: 'POST', body: { what } }),
  meta: () => req<Meta>('/api/meta'),
  club: () => req<{ fetchedAt: number | null; players: Player[]; squad: { starters: number[]; bench: number[] } | null }>('/api/club'),
  sets: () => req<{ fetchedAt: number | null; categories: { categoryId: number; name: string; sets: SbcSet[] }[] }>('/api/sets'),
  challenges: (setId: number, refresh = false) =>
    req<{ fetchedAt: number | null; challenges: Challenge[] }>(`/api/sets/${setId}/challenges${refresh ? '?refresh=1' : ''}`),
  readChallenge: (challengeId: number) => req<SyncStatus>(`/api/challenges/${challengeId}/read`, { method: 'POST' }),
  solve: (setId: number, challengeId: number, options: SolveOptions, deep = false) =>
    req<SolveResult>('/api/solve', { method: 'POST', body: { setId, challengeId, options, deep } }),
};

export function ago(ts: number | null): string {
  if (!ts) return 'never';
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
