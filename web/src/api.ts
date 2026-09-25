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
  inStorage?: boolean; // in SBC storage, not in the club
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
  sbcNextAt: number | null; // a visit refreshes the SBC list from then on (null: legacy account)
  editedAt: number | null;
  unassigned: number;
  /** a club sync waiting for / running in the web app tab; expected = cached club size, a rough total */
  club: { state: 'queued' | 'running'; loaded: number; expected: number | null } | null;
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
  usedStorage?: boolean; // at least one player comes from the SBC storage
  clubOnly?: boolean; // solved without the SBC storage (asked for)
  eval: { rating: number; chemistry: number; results: { text: string; met: boolean; actual: number | string }[]; allMet: boolean };
  slots: SlotResult[];
  quota?: Quota | null;
}

export interface Quota {
  used: number;
  limit: number;
  resetsAt: number | null;
}

export interface PlanInfo {
  tier: 'free' | 'premium';
  premiumUntil: number | null;
  quota: Quota | null;
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
  me: () => req<{ user: { id: string; email: string }; personas: Account[]; admin: boolean; plan: PlanInfo }>('/api/me'),
  legacyKeys: (keys: string[]) => req<{ map: Record<string, number> }>('/api/me/legacy-keys', { method: 'POST', body: { keys } }),
  linkToken: () => req<{ token: string; expiresIn: number }>('/api/link-token', { method: 'POST' }),
  unlinkPersona: (personaId: number) => req<{ ok: true }>(`/api/personas/${personaId}`, { method: 'DELETE' }),
  status: () =>
    req<{ account: Account | null; sync: SyncStatus | null; extension: { version: string; notes: string[] } | null }>('/api/status'),
  sync: (what: 'club') => req<SyncStatus>('/api/sync', { method: 'POST', body: { what } }),
  syncVisit: () => req<SyncStatus>('/api/sync/visit', { method: 'POST' }),
  meta: () => req<Meta>('/api/meta'),
  club: () =>
    req<{ fetchedAt: number | null; players: Player[]; storage: Player[]; storageAt: number | null; squad: { starters: number[]; bench: number[] } | null }>(
      '/api/club',
    ),
  sets: () => req<{ fetchedAt: number | null; categories: { categoryId: number; name: string; sets: SbcSet[] }[] }>('/api/sets'),
  challenges: (setId: number, refresh = false) =>
    req<{ fetchedAt: number | null; challenges: Challenge[] }>(`/api/sets/${setId}/challenges${refresh ? '?refresh=1' : ''}`),
  readChallenge: (challengeId: number) => req<SyncStatus>(`/api/challenges/${challengeId}/read`, { method: 'POST' }),
  solve: (setId: number, challengeId: number, options: SolveOptions, deep = false, useStorage = true) =>
    req<SolveResult>('/api/solve', { method: 'POST', body: { setId, challengeId, options, deep, useStorage } }),
  adminOverview: (range: 7 | 30) => req<AdminOverview>(`/api/admin/overview?range=${range}`),
  adminUsers: (query: string) => req<Paged<AdminUserRow>>(`/api/admin/users${query ? `?${query}` : ''}`),
  adminUser: (id: string) => req<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(id)}`),
  adminUserEvents: (id: string, page: number) => req<Paged<AdminEvent>>(`/api/admin/users/${encodeURIComponent(id)}/events?page=${page}`),
  adminAccounts: (query: string) => req<Paged<AdminAccountRow> & { latestExtension: string }>(`/api/admin/accounts${query ? `?${query}` : ''}`),
  adminSync: (what: 'club' | 'sbc' | 'all', personaIds?: number[]) =>
    req<{ results: AdminSyncResult[] }>('/api/admin/sync', { method: 'POST', body: { what, personaIds } }),
  adminTrust: (personaId: number, trusted: boolean) =>
    req<{ ok: true; personaId: number; trusted: boolean }>('/api/admin/trust', { method: 'POST', body: { personaId, trusted } }),
  adminPlan: (userId: string, tier: 'free' | 'premium', premiumUntil: string | null) =>
    req<{ ok: true }>('/api/admin/plan', { method: 'POST', body: { userId, tier, premiumUntil } }),
  adminQuotaReset: (userId: string) => req<{ ok: true }>('/api/admin/quota-reset', { method: 'POST', body: { userId } }),
};

export interface AdminAccount {
  personaId: number;
  personaName: string;
  clubName: string;
  mode: 'client' | 'legacy';
  extVersion: string | null;
  online: boolean;
  clubAt: number | null;
  sbcAt: number | null;
  clubStale: boolean;
  sbcStale: boolean;
  players: number;
  unassigned: number;
  running: string | null;
  error: string | null;
  ea: { today: number; limit: number; pausedUntil: number | null };
  clubSyncs: { used: number; limit: number };
  /** an admin sync waiting for the account's next web app visit */
  forced: { club: boolean; sbc: boolean } | null;
  /** its locked-slot (brick) layouts win over the vote */
  trusted: boolean;
}

export interface Paged<T> { rows: T[]; total: number; page: number; pageSize: number }

export interface AdminUserRow {
  id: string; email: string; createdAt: number; lastSeenAt: number;
  planSet: 'free' | 'premium'; plan: PlanInfo; admin: boolean;
  accounts: number; online: number; solves7d: number;
}
export type AdminAccountRow = AdminAccount & { ownerId: string | null; ownerEmail: string | null };
export interface AdminUserDetail {
  user: { id: string; email: string; createdAt: number; lastSeenAt: number; admin: boolean };
  planSet: 'free' | 'premium'; plan: PlanInfo;
  accounts: (AdminAccount & { linkedAt: number; previousUserId: string | null })[];
  missing: number[];
  solves: { days: string[]; found: number[]; notFound: number[] };
  latestExtension: string;
}
export interface AdminEvent { id: number; at: number; type: 'solve' | 'sync' | 'ea_error' | 'ea_day'; personaId: number | null; data: Record<string, unknown> }
export type AdminAttention =
  | { kind: 'error' | 'paused' | 'atLimit' | 'outdated'; personaId: number; personaName: string; userId: string | null; detail: string | null }
  | { kind: 'expiring'; userId: string; email: string; until: number };
export interface AdminOverview {
  at: number; lastDrop: number; latestExtension: string; range: 7 | 30;
  kpis: {
    users: { total: number; active24h: number; active7d: number; new7d: number };
    premium: { total: number; expiring7d: number };
    accounts: { total: number; online: number; problem: number; unlinked: number };
    solvesToday: number;
    ea: { today: number; limit: number };
  };
  series: { days: string[]; found: number[]; notFound: number[]; signups: number[]; eaRequests: number[]; syncs: number[]; syncFailed: number[] };
  attention: AdminAttention[];
  versions: { version: string; count: number; latest: boolean }[];
  db: { sets: number; challenges: number; brickReports: number; trusted: number };
}

export type AdminSyncResult =
  | { personaId: number; outcome: 'queued'; clubSkipped: boolean }
  | { personaId: number; outcome: 'deferred' }
  | { personaId: number; outcome: 'skipped'; code: string; params?: Record<string, string | number> };

/** The extension download; the query keeps any cache from handing out a zip from before an update. */
export const extensionZipUrl = () => `/api/extension.zip?t=${Date.now()}`;
