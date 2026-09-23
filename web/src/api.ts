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
  reasons?: (Reason | string)[]; // strings only in squads saved by older versions
  status?: string;
  ms: number;
  cost?: number;
  missingPlaced?: number[];
  placed?: { kept: number; total: number };
  eval: { rating: number; chemistry: number; results: { text: string; met: boolean; actual: number | string }[]; allMet: boolean };
  slots: SlotResult[];
}

/** A server error; `code` + `params` let the UI say it in the user's language. */
export class ApiError extends Error {
  constructor(message: string, public code: string | null, public params: Record<string, string | number>) {
    super(message);
  }
}

/** Why the solver found no squad: a code the UI translates, plus the values to fill in. */
export interface Reason {
  code: 'pool' | 'count' | 'sameGroup' | 'distinct' | 'rating' | 'combo';
  req?: string; // the requirement text, as EA words it
  have?: number;
  need?: number;
  hidden?: number; // players the user's settings hide
  all?: number; // rating without the settings
}

// The Clerk session identifies the user; X-Persona says which of their EA accounts the call is about.
let tokenFn: ((fresh: boolean) => Promise<string | null>) | null = null;
let signedOut: () => void = () => {};
let persona: number | null = null;

/** Root calls this on every render with Clerk's getToken (null while signed out). */
export function configureAuth(getToken: typeof tokenFn, onSignedOut: () => void) {
  tokenFn = getToken;
  signedOut = onSignedOut;
}
export const setPersona = (id: number | null) => (persona = id);

async function send(path: string, init: { method?: string; body?: unknown }, fresh: boolean) {
  const token = tokenFn ? await tokenFn(fresh) : null;
  return fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(persona ? { 'X-Persona': String(persona) } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function req<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res = await send(path, init, false);
  if (res.status === 401 && tokenFn) res = await send(path, init, true); // token just expired: once more with a fresh one
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; code?: string; params?: Record<string, string | number> };
    if (d.code === 'signIn') signedOut();
    throw new ApiError(d.error ?? `HTTP ${res.status}`, d.code ?? null, d.params ?? {});
  }
  return data as T;
}

export const api = {
  me: () => req<{ user: { id: string; email: string }; personas: Account[] }>('/api/me'),
  legacyKeys: (keys: string[]) => req<{ map: Record<string, number> }>('/api/me/legacy-keys', { method: 'POST', body: { keys } }),
  linkToken: () => req<{ token: string; expiresIn: number }>('/api/link-token', { method: 'POST' }),
  unlinkPersona: (personaId: number) => req<{ ok: true }>(`/api/personas/${personaId}`, { method: 'DELETE' }),
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
