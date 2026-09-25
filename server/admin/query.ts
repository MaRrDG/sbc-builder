// Pure admin helpers: query-string parsing, account filtering and sorting, paging, day keys.
// Invalid values fall back to defaults instead of failing the request.
export const PAGE_SIZE = 25;
const MAX_PAGE = 10000;

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;

export function parsePage(v: unknown): number {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : typeof v === 'number' && Number.isInteger(v) ? v : 1;
  return Math.min(Math.max(n, 1), MAX_PAGE);
}
export const parseRange = (v: unknown): 7 | 30 => (v === '30' || v === 30 ? 30 : 7);
const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 100) : '');

export const USER_PLANS = ['all', 'free', 'premium', 'expiring'] as const;
export const USER_ACTIVITY = ['all', '24h', '7d', 'inactive30'] as const;
export const USER_EA = ['all', 'with', 'without', 'problem', 'outdated'] as const;
export const USER_SORTS = ['lastSeen', 'createdAt', 'solves7d', 'email'] as const;
export const ACCOUNT_STATES = ['all', 'online', 'problem', 'outdated', 'unlinked', 'trusted'] as const;
export const ACCOUNT_SORTS = ['name', 'clubAt', 'sbcAt', 'eaToday'] as const;
const DIRS = ['asc', 'desc'] as const;

export interface UserQuery {
  q: string;
  plan: (typeof USER_PLANS)[number];
  activity: (typeof USER_ACTIVITY)[number];
  ea: (typeof USER_EA)[number];
  sort: (typeof USER_SORTS)[number];
  dir: 'asc' | 'desc';
  page: number;
}
export interface AccountQuery {
  q: string;
  state: (typeof ACCOUNT_STATES)[number];
  sort: (typeof ACCOUNT_SORTS)[number];
  dir: 'asc' | 'desc';
  page: number;
}

export function parseUserQuery(raw: Record<string, unknown>): UserQuery {
  const sort = pick(raw.sort, USER_SORTS, 'lastSeen');
  return {
    q: text(raw.q),
    plan: pick(raw.plan, USER_PLANS, 'all'),
    activity: pick(raw.activity, USER_ACTIVITY, 'all'),
    ea: pick(raw.ea, USER_EA, 'all'),
    sort,
    dir: pick(raw.dir, DIRS, 'desc'),
    page: parsePage(raw.page),
  };
}

export function parseAccountQuery(raw: Record<string, unknown>): AccountQuery {
  return {
    q: text(raw.q),
    state: pick(raw.state, ACCOUNT_STATES, 'all'),
    sort: pick(raw.sort, ACCOUNT_SORTS, 'name'),
    dir: pick(raw.dir, DIRS, 'asc'),
    page: parsePage(raw.page),
  };
}

/** The account fields the filters look at (a subset of the admin account row). */
export interface AccountLike {
  personaId: number;
  personaName: string;
  clubName: string;
  online: boolean;
  error: string | null;
  clubStale: boolean;
  sbcStale: boolean;
  extVersion: string | null;
  trusted: boolean;
  clubAt: number | null;
  sbcAt: number | null;
  ea: { today: number; limit: number; pausedUntil: number | null };
}

export function versionLess(a: string, b: string): boolean {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d) return d < 0;
  }
  return false;
}
export const isOutdated = (v: string | null, latest: string) => !v || versionLess(v, latest);
export const isProblem = (a: AccountLike) =>
  !!a.error || a.clubStale || a.sbcStale || !!a.ea.pausedUntil || a.ea.today >= a.ea.limit;

type Owned = AccountLike & { ownerEmail: string | null };

export function matchesText(a: Owned, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    String(a.personaId) === q ||
    a.personaName.toLowerCase().includes(s) ||
    a.clubName.toLowerCase().includes(s) ||
    !!a.ownerEmail?.toLowerCase().includes(s)
  );
}

const byState: Record<AccountQuery['state'], (a: Owned, latest: string) => boolean> = {
  all: () => true,
  online: (a) => a.online,
  problem: (a) => isProblem(a),
  outdated: (a, latest) => isOutdated(a.extVersion, latest),
  unlinked: (a) => !a.ownerEmail,
  trusted: (a) => a.trusted,
};

const sortValue: Record<AccountQuery['sort'], (a: Owned) => string | number | null> = {
  name: (a) => a.personaName.toLowerCase(),
  clubAt: (a) => a.clubAt,
  sbcAt: (a) => a.sbcAt,
  eaToday: (a) => a.ea.today,
};

/** Filtered and sorted (nulls last either way, personaId as tie-break); paging is separate. */
export function filterAccounts<T extends Owned>(rows: T[], q: AccountQuery, latest: string): T[] {
  const val = sortValue[q.sort];
  const sign = q.dir === 'asc' ? 1 : -1;
  return rows
    .filter((a) => byState[q.state](a, latest) && matchesText(a, q.q))
    .sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x === null || y === null) return x === y ? a.personaId - b.personaId : x === null ? 1 : -1;
      return (x < y ? -1 : x > y ? 1 : 0) * sign || a.personaId - b.personaId;
    });
}

export const clampPage = (page: number, total: number, size = PAGE_SIZE) => Math.min(page, Math.max(1, Math.ceil(total / size)));

export function paginate<T>(rows: T[], page: number, size = PAGE_SIZE) {
  const p = clampPage(page, rows.length, size);
  return { rows: rows.slice((p - 1) * size, p * size), total: rows.length, page: p, pageSize: size };
}

/** ILIKE pattern for a literal substring. */
export const likePattern = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export const dayKey = (ts: number, tz: string) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(ts));

/** `range` calendar days ending today (in tz), oldest first. Calendar math, so DST never skips a day. */
export function lastDays(range: number, now: number, tz: string): string[] {
  const [y, m, d] = dayKey(now, tz).split('-').map(Number);
  return Array.from({ length: range }, (_, i) => new Date(Date.UTC(y, m - 1, d - (range - 1 - i))).toISOString().slice(0, 10));
}

export function fillDays<T extends { day: string }>(days: string[], rows: T[], pick: (r: T) => number): number[] {
  const by = new Map(rows.map((r) => [r.day, pick(r)]));
  return days.map((d) => by.get(d) ?? 0);
}
