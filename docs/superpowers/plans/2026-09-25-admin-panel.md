# Admin Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-payload admin card list with a real admin panel: dashboard (KPIs + charts), paginated/filterable users table, user detail page, EA accounts table, backed by a new `events` history table.

**Architecture:** Server gets an `events` table written fire-and-forget from solve / sync / meter code, and a `server/admin/` module (pure query parsing + filtering in `query.ts`, SQL in `users.ts`, in-memory account rows in `accounts.ts`, dashboard in `overview.ts`, routes in `routes.ts`). Web gets admin sub-routes with state in the URL query and `web/src/components/admin/*` screens built on a shared `DataTable` and a hand-written SVG `BarChart`.

**Tech Stack:** Fastify 5, Drizzle + Postgres, node:test via tsx, React 19 + Vite 8, plain CSS with OKLCH tokens, Phosphor icons, own i18n (`t()`, en + ro).

**Spec:** `docs/superpowers/specs/2026-09-25-admin-panel-design.md`

## Global Constraints

- Read-only toward EA: admin endpoints read only the DB and the file cache, never call EA. No new job recipe.
- `logEvent` never throws into its caller; a DB failure must not break a solve, sync or EA request.
- Days are bucketed in `process.env.SBC_DROP_TZ ?? 'Europe/Bucharest'`.
- Page size 25. Invalid query values fall back to defaults, never a 400.
- Events older than 180 days are deleted.
- Every UI string through `t()` with keys in `web/src/locales/en.ts` and `ro.ts` (Romanian plurals `_one`/`_few`/`_other`); `npm run i18n:check` passes. EA names (persona, club) shown as sent.
- Look per `DESIGN.md`: dark teal, containers `var(--r-box)` 14px, controls `var(--r-ctl)` 8px, `--go` only for primary action / met / selected, state never by color alone, `prefers-reduced-motion`, WCAG AA. Check 390px width; under 860px the admin tabs scroll horizontally and tables become stacked rows.
- Hand-written SVG charts, no chart library, no CSP change.
- New/changed endpoints documented in `docs/api.md`; `GET /api/admin/stats` removed.
- Work on `dev`; commits `type(scope): subject` with the `Co-Authored-By` trailer; never push.

## Review Focus

1. **Page past the end** (`?page=99` with 3 results, or a filter that shrinks the result while on page 4): expect the last page, not an empty table. Pinned in Task 2 (`paginate` clamps) and Task 4 (SQL page clamp).
2. **DST day buckets** (30-day range across the last Sunday of March / October in Bucharest): expect exactly 30 distinct, consecutive day keys, no skipped or doubled day. Pinned in Task 2 (`lastDays` test).
3. **Stored plan vs effective plan** (admin email with `plan='free'`, Premium with `premiumUntil` in the past): the `premium` filter and badge must match what `/api/me` says; `expiring` only includes stored Premium ending within 7 days. Pinned in Task 2 (`planWhereKind` test) and used by Task 4 SQL.
4. **Search text with SQL wildcards** (`q=%` or `q=_`): must match literally, not everything. Pinned in Task 2 (`likePattern` test).
5. **Duplicated `ea_day` rows** (server restart between logging a rollover and saving the new day): EA chart must not double count. Pinned in Task 4 overview SQL (max per persona+day) and Task 1 note.

---

## File Structure

Server:
- Create `server/db/events.ts` — `logEvent`, `pruneEvents`, `userEvents`.
- Modify `server/db/schema.ts` — `events` table. New migration from `npm run db:generate`.
- Modify `server/index.ts` — solve logging, prune timer, admin routes moved out.
- Modify `server/sync.ts` (`run`), `server/jobs.ts` (`finishJob`), `server/meter.ts`, `server/accounts.ts` — event logging.
- Create `server/admin/query.ts` (+ `query.test.ts`) — pure parsing, filtering, paging, day keys, version compare.
- Create `server/admin/auth.ts` — `isAdmin`, `requireAdmin`, `adminEmails` (moved from `server/admin.ts`).
- Create `server/admin/accounts.ts` — account rows (5 s memo), owners, accounts list.
- Create `server/admin/users.ts` — users list (SQL), user detail.
- Create `server/admin/overview.ts` — KPIs, series, attention, versions.
- Create `server/admin/routes.ts` — all `/api/admin/*` routes.
- Delete `server/admin.ts`.

Web:
- Modify `web/src/route.ts` (+ `route.test.ts`) — admin sub-routes with query.
- Modify `web/src/api.ts` — admin types + helpers.
- Create `web/src/components/admin/`: `AdminLayout.tsx`, `useLoad.ts`, `DataTable.tsx`, `BarChart.tsx`, `KpiCard.tsx`, `Overview.tsx`, `UsersTable.tsx`, `UserDetail.tsx`, `AccountCard.tsx`, `AccountsTable.tsx`, `format.ts`.
- Delete `web/src/components/AdminView.tsx`.
- Modify `web/src/App.tsx`, `web/src/styles.css` (replace the `/* ---------- admin ---------- */` block, lines ~2913–3112), `web/src/locales/en.ts`, `ro.ts`.

Docs: `docs/api.md`, `docs/architecture.md` (events table paragraph), `CLAUDE.md` layout line for `server/admin/` and `components/admin/`.

---

### Task 1: `events` table and logging

**Files:**
- Modify: `server/db/schema.ts` (append after `linkTokens`)
- Create: `server/db/events.ts`
- Create: migration via `npm run db:generate`
- Modify: `server/index.ts` (`/api/solve` ~L465–531; startup after `initDb()`)
- Modify: `server/sync.ts:57-70` (`run`)
- Modify: `server/jobs.ts:122-135` (`finishJob`)
- Modify: `server/meter.ts:23-65`, `server/accounts.ts:28`
- Modify: spec line for `ea_error` (see Step 7)

**Interfaces:**
- Produces: `events` table (`at`, `type`, `userId`, `personaId`, `data`); `logEvent(e: NewEvent): void`; `pruneEvents(): Promise<void>`; `userEvents(userId: string, page: number, pageSize: number): Promise<{ rows: EventRow[]; total: number }>`; `EventType = 'solve' | 'sync' | 'ea_error' | 'ea_day'`; `RequestMeter` constructor `(cacheKey: string, personaId: number)`.

- [ ] **Step 1: Add the table to `server/db/schema.ts`**

```ts
/** Admin history: solves, syncs, EA throttles and per-day EA request counts (server/db/events.ts). */
export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    type: text('type').notNull(), // 'solve' | 'sync' | 'ea_error' | 'ea_day'
    userId: text('user_id'),
    personaId: bigint('persona_id', { mode: 'number' }),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('events_type_at').on(t.type, t.at), index('events_user_at').on(t.userId, t.at)],
);
```

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `server/db/migrations/0003_*.sql` with `CREATE TABLE "events"` and both indexes. Open it and check nothing else changed.

- [ ] **Step 3: Create `server/db/events.ts`**

```ts
// Admin history. Writes are fire-and-forget: a DB hiccup is logged, never breaks the caller.
import { and, count, desc, eq, lt, sql } from 'drizzle-orm';
import { db, softly } from './index.js';
import { events } from './schema.js';

export type EventType = 'solve' | 'sync' | 'ea_error' | 'ea_day';
export interface NewEvent {
  type: EventType;
  userId?: string | null;
  personaId?: number | null;
  data?: Record<string, unknown>;
}
export interface EventRow {
  id: number;
  at: number;
  type: EventType;
  personaId: number | null;
  data: Record<string, unknown>;
}

export const KEEP_DAYS = 180;

export function logEvent(e: NewEvent): void {
  void softly(`log ${e.type}`, () =>
    db.insert(events).values({ type: e.type, userId: e.userId ?? null, personaId: e.personaId ?? null, data: e.data ?? {} }),
  );
}

export async function pruneEvents(): Promise<void> {
  await softly('prune events', () => db.delete(events).where(lt(events.at, sql`now() - make_interval(days => ${KEEP_DAYS})`)));
}

export async function userEvents(userId: string, page: number, pageSize: number): Promise<{ rows: EventRow[]; total: number }> {
  const [{ n }] = await db.select({ n: count() }).from(events).where(eq(events.userId, userId));
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId)))
    .orderBy(desc(events.at), desc(events.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    total: n,
    rows: rows.map((r) => ({ id: r.id, at: r.at.getTime(), type: r.type as EventType, personaId: r.personaId, data: r.data })),
  };
}
```

`userEvents` gets `page` already clamped by the caller (Task 4).

- [ ] **Step 4: Log solves in `server/index.ts` `/api/solve`**

Import `logEvent` from `./db/events.js`. In the `if (!sol) { ... }` branch, before `return`, add:

```ts
      logEvent({ type: 'solve', userId, personaId: acc.id, data: { setId, challengeId, found: false } });
```

Before the final `return { found: sol.eval.allMet, ...`, add:

```ts
    logEvent({ type: 'solve', userId, personaId: acc.id, data: { setId, challengeId, found: sol.eval.allMet } });
```

Also after `await initDb();` (find it near the bottom of `index.ts`) add:

```ts
void pruneEvents();
setInterval(() => void pruneEvents(), 24 * 60 * 60 * 1000).unref();
```

- [ ] **Step 5: Log syncs**

`server/sync.ts` `run()` (legacy mode). Replace its body with:

```ts
async function run<T>(acc: Account, label: string, fn: () => Promise<T>): Promise<T> {
  const busy = running.get(acc.id);
  if (busy) throw new SessionError(`Sync already running (${busy})`, 409, 'syncRunning');
  running.set(acc.id, label);
  errors.set(acc.id, null);
  try {
    const r = await fn();
    logEvent({ type: 'sync', personaId: acc.id, data: { what: label, ok: true, mode: 'legacy' } });
    return r;
  } catch (e) {
    errors.set(acc.id, (e as Error).message);
    logEvent({ type: 'sync', personaId: acc.id, data: { what: label, ok: false, mode: 'legacy', error: (e as Error).message.slice(0, 200) } });
    throw e;
  } finally {
    running.delete(acc.id);
  }
}
```

`server/jobs.ts` `finishJob()`: right after `job.error = ok ? undefined : error ?? 'Sync failed in the web app tab.';` add:

```ts
  if (job.kind === 'club' || job.kind === 'sbc')
    logEvent({ type: 'sync', personaId: acc.id, data: { what: job.kind, ok, mode: 'client', ...(ok ? {} : { error: job.error!.slice(0, 200) }) } });
```

Import `logEvent` from `./db/events.js` in both files.

- [ ] **Step 6: Meter: EA throttles and per-day counts**

`server/accounts.ts:28`: `this.meter = new RequestMeter(\`accounts/${info.personaId}/ea-requests\`, info.personaId);`

`server/meter.ts`: constructor `constructor(private cacheKey: string, private personaId: number) {}`. In `load()`, before starting a new day, log the finished one:

```ts
  private async load(): Promise<MeterData> {
    if (!this.data) this.data = (await readCache<MeterData>(this.cacheKey))?.data ?? null;
    if (!this.data || this.data.day !== today()) {
      // the finished day, for the admin chart; a repeat after a restart is deduped by the query (max per day)
      if (this.data && this.data.count > 0)
        logEvent({ type: 'ea_day', personaId: this.personaId, data: { day: this.data.day, count: this.data.count } });
      this.data = { day: today(), count: 0, byPath: {}, recent: this.data?.recent ?? [] };
    }
    return this.data;
  }
```

`pause()`:

```ts
  pause() {
    this.pausedUntil = Date.now() + COOLDOWN_MS;
    logEvent({ type: 'ea_error', personaId: this.personaId, data: { code: 'throttle' } });
  }
```

Export `today` from `meter.ts` as `meterDay` (used by Task 4): `export const meterDay = today;`.

- [ ] **Step 7: Align the spec**

In the spec's events table, change the `ea_error` row's "written in" to `meter.ts pause() (EA throttling)` and add one sentence under it: "Failed syncs are `sync` rows with `ok: false` and `error`." Keep the rest.

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npm test`
Expected: both pass.
With `npm run dev` running (don't kill it), solve one challenge in the browser, then:
Run: `docker exec -i postgresql psql -U postgres fcsolver -c "select type, persona_id, data, at from events order by id desc limit 5"` (adjust user/container per `.env` `DATABASE_URL`)
Expected: a `solve` row with `setId`, `challengeId`, `found`.

- [ ] **Step 9: Commit**

```bash
git pull --rebase
git add server/db/schema.ts server/db/events.ts server/db/migrations server/index.ts server/sync.ts server/jobs.ts server/meter.ts server/accounts.ts docs/superpowers/specs/2026-09-25-admin-panel-design.md
git commit -m "feat(events): history table for solves, syncs and EA usage"
```

---

### Task 2: Pure admin query logic

**Files:**
- Create: `server/admin/query.ts`
- Test: `server/admin/query.test.ts`

**Interfaces:**
- Produces (all exported from `server/admin/query.ts`):
  - `PAGE_SIZE = 25`
  - `UserQuery = { q: string; plan: 'all'|'free'|'premium'|'expiring'; activity: 'all'|'24h'|'7d'|'inactive30'; ea: 'all'|'with'|'without'|'problem'|'outdated'; sort: 'lastSeen'|'createdAt'|'solves7d'|'email'; dir: 'asc'|'desc'; page: number }`
  - `AccountQuery = { q: string; state: 'all'|'online'|'problem'|'outdated'|'unlinked'|'trusted'; sort: 'name'|'clubAt'|'sbcAt'|'eaToday'; dir: 'asc'|'desc'; page: number }`
  - `parseUserQuery(raw: Record<string, unknown>): UserQuery`, `parseAccountQuery(raw): AccountQuery`, `parseRange(raw: unknown): 7 | 30`, `parsePage(raw: unknown): number`
  - `AccountLike` (see code), `isProblem(a: AccountLike): boolean`, `isOutdated(v: string | null, latest: string): boolean`, `versionLess(a: string, b: string): boolean`
  - `matchesText(a: AccountLike & { ownerEmail: string | null }, q: string): boolean`
  - `filterAccounts<T extends AccountLike & { ownerEmail: string | null }>(rows: T[], q: AccountQuery, latest: string): T[]` (filters + sorts)
  - `clampPage(page: number, total: number, size?: number): number`
  - `paginate<T>(rows: T[], page: number, size?: number): { rows: T[]; total: number; page: number; pageSize: number }`
  - `likePattern(q: string): string`
  - `dayKey(ts: number, tz: string): string` (`YYYY-MM-DD`), `lastDays(range: number, now: number, tz: string): string[]` (oldest first, today last)
  - `fillDays<T>(days: string[], rows: { day: string }[] & T[], pick: (r: T) => number): number[]`

- [ ] **Step 1: Write the failing tests** — `server/admin/query.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampPage, dayKey, fillDays, filterAccounts, isOutdated, lastDays, likePattern, paginate,
  parseAccountQuery, parsePage, parseRange, parseUserQuery, versionLess, type AccountLike,
} from './query.js';

const TZ = 'Europe/Bucharest';

test('parseUserQuery: defaults and garbage fall back', () => {
  assert.deepEqual(parseUserQuery({}), { q: '', plan: 'all', activity: 'all', ea: 'all', sort: 'lastSeen', dir: 'desc', page: 1 });
  assert.deepEqual(
    parseUserQuery({ q: '  Ana ', plan: 'premium', activity: 'inactive30', ea: 'problem', sort: 'email', dir: 'asc', page: '3' }),
    { q: 'Ana', plan: 'premium', activity: 'inactive30', ea: 'problem', sort: 'email', dir: 'asc', page: 3 },
  );
  const bad = parseUserQuery({ plan: 'gold', activity: 1, ea: ['x'], sort: 'drop table', dir: 'up', page: '-2' });
  assert.equal(bad.plan, 'all');
  assert.equal(bad.activity, 'all');
  assert.equal(bad.ea, 'all');
  assert.equal(bad.sort, 'lastSeen');
  assert.equal(bad.dir, 'desc');
  assert.equal(bad.page, 1);
  assert.equal(parseUserQuery({ q: 'x'.repeat(500) }).q.length, 100);
});

test('parsePage / parseRange', () => {
  assert.equal(parsePage('2'), 2);
  assert.equal(parsePage('2.5'), 1);
  assert.equal(parsePage('0'), 1);
  assert.equal(parsePage('99999999'), 10000);
  assert.equal(parseRange('30'), 30);
  assert.equal(parseRange('14'), 7);
  assert.equal(parseRange(undefined), 7);
});

test('parseAccountQuery defaults', () => {
  assert.deepEqual(parseAccountQuery({ state: 'nope' }), { q: '', state: 'all', sort: 'name', dir: 'asc', page: 1 });
});

test('clampPage and paginate: past the end gives the last page', () => {
  assert.equal(clampPage(99, 3), 1);
  assert.equal(clampPage(3, 60), 3);
  assert.equal(clampPage(4, 60), 3);
  assert.equal(clampPage(5, 0), 1);
  const rows = Array.from({ length: 30 }, (_, i) => i);
  assert.deepEqual(paginate(rows, 9), { rows: rows.slice(25), total: 30, page: 2, pageSize: 25 });
  assert.deepEqual(paginate([], 3), { rows: [], total: 0, page: 1, pageSize: 25 });
});

test('versions', () => {
  assert.equal(versionLess('0.8.2', '0.8.10'), true);
  assert.equal(versionLess('0.9', '0.8.10'), false);
  assert.equal(versionLess('0.8.4', '0.8.4'), false);
  assert.equal(isOutdated('0.8.4', '0.8.5'), true);
  assert.equal(isOutdated('0.8.5', '0.8.5'), false);
  assert.equal(isOutdated(null, '0.8.5'), true); // unknown: an old extension
});

const acc = (p: Partial<AccountLike & { ownerEmail: string | null }>) => ({
  personaId: 1, personaName: 'Ana', clubName: 'FC A', ownerEmail: 'a@x.ro', online: false, error: null, clubStale: false,
  sbcStale: false, extVersion: '0.8.5', trusted: false, clubAt: 1, sbcAt: 1, ea: { today: 0, limit: 150, pausedUntil: null }, ...p,
});

test('filterAccounts: state, text and sort', () => {
  const rows = [
    acc({ personaId: 1, personaName: 'Bob', online: true, clubAt: 5 }),
    acc({ personaId: 2, personaName: 'ana', error: 'boom', clubAt: 9 }),
    acc({ personaId: 3, personaName: 'Cid', ownerEmail: null, extVersion: '0.7.0', trusted: true, clubAt: null }),
    acc({ personaId: 4, personaName: 'Dan', ea: { today: 150, limit: 150, pausedUntil: null } }),
  ];
  const q = (x: Record<string, string>) => parseAccountQuery(x);
  assert.deepEqual(filterAccounts(rows, q({}), '0.8.5').map((r) => r.personaName), ['ana', 'Bob', 'Cid', 'Dan']); // case-insensitive name sort
  assert.deepEqual(filterAccounts(rows, q({ state: 'online' }), '0.8.5').map((r) => r.personaId), [1]);
  assert.deepEqual(filterAccounts(rows, q({ state: 'problem' }), '0.8.5').map((r) => r.personaId), [2, 4]);
  assert.deepEqual(filterAccounts(rows, q({ state: 'outdated' }), '0.8.5').map((r) => r.personaId), [3]);
  assert.deepEqual(filterAccounts(rows, q({ state: 'unlinked' }), '0.8.5').map((r) => r.personaId), [3]);
  assert.deepEqual(filterAccounts(rows, q({ state: 'trusted' }), '0.8.5').map((r) => r.personaId), [3]);
  assert.deepEqual(filterAccounts(rows, q({ q: '3' }), '0.8.5').map((r) => r.personaId), [3]); // exact personaId
  assert.deepEqual(filterAccounts(rows, q({ q: 'A@X' }), '0.8.5').length, 3); // owner email, case-insensitive
  // nulls last in both directions
  assert.deepEqual(filterAccounts(rows, q({ sort: 'clubAt', dir: 'desc' }), '0.8.5').map((r) => r.personaId), [2, 1, 4, 3]);
  assert.deepEqual(filterAccounts(rows, q({ sort: 'clubAt', dir: 'asc' }), '0.8.5').map((r) => r.personaId), [4, 1, 2, 3]);
});

test('likePattern escapes wildcards', () => {
  assert.equal(likePattern('a%b_c\\'), '%a\\%b\\_c\\\\%');
});

test('dayKey uses the drop timezone', () => {
  // 2026-09-24 22:30 UTC is already 25 Sept in Bucharest (UTC+3)
  assert.equal(dayKey(Date.UTC(2026, 8, 24, 22, 30), TZ), '2026-09-25');
});

test('lastDays: consecutive days across DST changes', () => {
  for (const now of [Date.UTC(2026, 2, 29, 21, 30) /* 30 Mar 00:30 local, day after spring-forward */, Date.UTC(2026, 9, 25, 22, 30) /* 26 Oct 00:30 local */]) {
    const days = lastDays(30, now, TZ);
    assert.equal(days.length, 30);
    assert.equal(new Set(days).size, 30);
    assert.equal(days[29], dayKey(now, TZ));
    for (let i = 1; i < days.length; i++)
      assert.equal(Date.parse(`${days[i]}T00:00:00Z`) - Date.parse(`${days[i - 1]}T00:00:00Z`), 86400000, days[i]);
  }
});

test('fillDays aligns rows and zero-fills', () => {
  const days = ['2026-09-23', '2026-09-24', '2026-09-25'];
  assert.deepEqual(fillDays(days, [{ day: '2026-09-25', n: 4 }, { day: '2026-01-01', n: 9 }], (r) => r.n), [0, 0, 4]);
});
```

- [ ] **Step 2: Run to see it fail**

Run: `node --import tsx --test server/admin/query.test.ts`
Expected: FAIL, cannot find module `./query.js`.

- [ ] **Step 3: Implement `server/admin/query.ts`**

```ts
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
```

Fix the `fillDays` signature in the Interfaces block accordingly: `fillDays<T extends { day: string }>(days: string[], rows: T[], pick: (r: T) => number): number[]`.

- [ ] **Step 4: Run tests**

Run: `node --import tsx --test server/admin/query.test.ts`
Expected: all PASS. Then `npm test` — all PASS.

- [ ] **Step 5: Commit**

```bash
git add server/admin/query.ts server/admin/query.test.ts
git commit -m "feat(admin): pure query parsing, filters, paging and day keys"
```

---

### Task 3: Admin auth + account rows (split `server/admin.ts`)

**Files:**
- Create: `server/admin/auth.ts`, `server/admin/accounts.ts`
- Delete: `server/admin.ts` (in Task 4, once routes move)

**Interfaces:**
- Consumes: `AccountLike`, `filterAccounts`, `paginate`, `AccountQuery` (Task 2).
- Produces:
  - `auth.ts`: `adminEmails(): string[]`, `isAdmin(userId: string): Promise<boolean>`, `requireAdmin(req: FastifyRequest): Promise<string>`
  - `accounts.ts`: `AdminAccount` (= fields of today's `accountRow` + `trusted`), `accountRows(): Promise<AdminAccount[]>` (memo 5 s), `invalidateAccountRows(): void`, `owners(): Promise<Map<number, { userId: string; email: string; linkedAt: number; previousUserId: string | null }>>`, `listAccountsPage(q: AccountQuery): Promise<{ rows: (AdminAccount & { ownerId: string | null; ownerEmail: string | null })[]; total; page; pageSize; latestExtension: string }>`

- [ ] **Step 1: `server/admin/auth.ts`** — move `adminEmails`, `isAdmin`, `requireAdmin` verbatim from `server/admin.ts:16-33` (export `adminEmails` too). Imports: `FastifyRequest`, `eq`, `SessionError` from `../ea.js`, `siteUser` from `../auth.js`, `db` from `../db/index.js`, `users` from `../db/schema.js`.

- [ ] **Step 2: `server/admin/accounts.ts`**

```ts
// EA accounts as the admin panel sees them: file cache + live meter + DB owner. Never calls EA.
import { eq } from 'drizzle-orm';
import type { ClubItem } from '../ea.js';
import { listAccounts, type Account } from '../accounts.js';
import { db } from '../db/index.js';
import { trustedIds } from '../db/sbcs.js';
import { personas, users } from '../db/schema.js';
import { latestExtension } from '../extension.js';
import { readCache } from '../store.js';
import { forcedSync, getStatus, lastSbcDrop } from '../sync.js';
import { filterAccounts, paginate, type AccountQuery } from './query.js';

async function accountRow(acc: Account, drop: number, trusted: Set<number>) {
  // body moved verbatim from server/admin.ts accountRow (personaId … trusted)
}
export type AdminAccount = Awaited<ReturnType<typeof accountRow>>;

const MEMO_MS = 5000;
let memo: { at: number; rows: Promise<AdminAccount[]> } | null = null;

/** Every account's row; reused for 5 s so a table + filter change doesn't re-read every cache file. */
export function accountRows(): Promise<AdminAccount[]> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.rows;
  const rows = (async () => {
    const drop = lastSbcDrop();
    const trusted = await trustedIds();
    return Promise.all(listAccounts().map((a) => accountRow(a, drop, trusted)));
  })();
  memo = { at: Date.now(), rows };
  rows.catch(() => (memo = null));
  return rows;
}
/** After an admin action (trust, sync) the next read is fresh. */
export const invalidateAccountRows = () => void (memo = null);

export async function owners() {
  const rows = await db
    .select({ personaId: personas.personaId, userId: personas.userId, email: users.email, linkedAt: personas.linkedAt, previousUserId: personas.previousUserId })
    .from(personas)
    .innerJoin(users, eq(users.id, personas.userId));
  return new Map(rows.map((r) => [r.personaId, { userId: r.userId, email: r.email, linkedAt: r.linkedAt.getTime(), previousUserId: r.previousUserId }]));
}

export async function withOwners() {
  const [rows, own] = await Promise.all([accountRows(), owners()]);
  return rows.map((a) => ({ ...a, ownerId: own.get(a.personaId)?.userId ?? null, ownerEmail: own.get(a.personaId)?.email ?? null }));
}

export async function listAccountsPage(q: AccountQuery) {
  const latest = (await latestExtension()).version;
  return { ...paginate(filterAccounts(await withOwners(), q, latest), q.page), latestExtension: latest };
}
```

Copy the `accountRow` body from `server/admin.ts:37-58` into the stub above (no changes).

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS (old `server/admin.ts` still exists and is still used; both compile).

- [ ] **Step 4: Commit**

```bash
git add server/admin/auth.ts server/admin/accounts.ts
git commit -m "refactor(admin): auth and memoized account rows in server/admin"
```

---

### Task 4: Users, overview and routes; remove `/api/admin/stats`

**Files:**
- Create: `server/admin/users.ts`, `server/admin/overview.ts`, `server/admin/routes.ts`
- Modify: `server/index.ts` (remove L240–291 admin block + `adminStats` import; import `isAdmin` from `./admin/auth.js`; call `registerAdminRoutes(app)`)
- Delete: `server/admin.ts`
- Modify: `docs/api.md` (Admin section)

**Interfaces:**
- Consumes: Task 1 `events`, `userEvents`, `meterDay`; Task 2 everything; Task 3 `accountRows`, `withOwners`, `owners`, `invalidateAccountRows`, `requireAdmin`, `adminEmails`, `listAccountsPage`.
- Produces HTTP (all `requireAdmin`):
  - `GET /api/admin/overview?range=7|30` → `Overview` (below)
  - `GET /api/admin/users?...` → `{ rows: UserRow[]; total; page; pageSize }`
  - `GET /api/admin/users/:id` → `UserDetail` | 404 `{ error: 'unknown user' }`
  - `GET /api/admin/users/:id/events?page` → `{ rows: EventRow[]; total; page; pageSize }`
  - `GET /api/admin/accounts?...` → `{ rows; total; page; pageSize; latestExtension }`
  - unchanged `POST /api/admin/sync|trust|plan|quota-reset` (moved), each calling `invalidateAccountRows()` after success.

Types (define in the server files, mirrored in `web/src/api.ts` in Task 6):

```ts
// users.ts
export interface UserRow {
  id: string; email: string; createdAt: number; lastSeenAt: number;
  planSet: 'free' | 'premium'; plan: PlanInfo; admin: boolean;
  accounts: number; online: number; solves7d: number;
}
export interface UserDetail {
  user: { id: string; email: string; createdAt: number; lastSeenAt: number; admin: boolean };
  planSet: 'free' | 'premium'; plan: PlanInfo;
  accounts: (AdminAccount & { linkedAt: number; previousUserId: string | null })[];
  missing: number[]; // owned personaIds with no cached account on this server
  solves: { days: string[]; found: number[]; notFound: number[] };
  latestExtension: string;
}
// overview.ts
export interface Overview {
  at: number; lastDrop: number; latestExtension: string; range: 7 | 30;
  kpis: {
    users: { total: number; active24h: number; active7d: number; new7d: number };
    premium: { total: number; expiring7d: number };
    accounts: { total: number; online: number; problem: number; unlinked: number };
    solvesToday: number;
    ea: { today: number; limit: number };
  };
  series: { days: string[]; found: number[]; notFound: number[]; signups: number[]; eaRequests: number[]; syncs: number[]; syncFailed: number[] };
  attention: AttentionItem[];
  versions: { version: string; count: number; latest: boolean }[];
  db: { sets: number; challenges: number; brickReports: number; trusted: number };
}
export type AttentionItem =
  | { kind: 'error' | 'paused' | 'atLimit' | 'outdated'; personaId: number; personaName: string; userId: string | null; detail: string | null }
  | { kind: 'expiring'; userId: string; email: string; until: number };
```

- [ ] **Step 1: `server/admin/users.ts`**

```ts
// Users for the admin panel: filtered, sorted and paged in SQL; account state comes from the cache.
import { and, asc, count, desc, eq, exists, gt, gte, ilike, inArray, isNotNull, lt, lte, not, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { events, personas, users } from '../db/schema.js';
import { latestExtension } from '../extension.js';
import { planInfo, type PlanInfo } from '../plans.js';
import { adminEmails } from './auth.js';
import { accountRows, owners, type AdminAccount } from './accounts.js';
import { clampPage, dayKey, fillDays, isOutdated, isProblem, lastDays, likePattern, PAGE_SIZE, type UserQuery } from './query.js';

const DAY = 24 * 60 * 60 * 1000;
export const TZ = () => process.env.SBC_DROP_TZ ?? 'Europe/Bucharest';

/** Effective Premium, same rule as plan.ts effectivePlan: admins, or stored premium not yet ended. */
export function premiumSql(now: Date): SQL {
  const admins = adminEmails();
  const stored = and(eq(users.plan, 'premium'), or(sql`${users.premiumUntil} is null`, gt(users.premiumUntil, now)))!;
  return admins.length ? or(stored, inArray(sql`lower(${users.email})`, admins))! : stored;
}
export const expiringSql = (now: Date): SQL =>
  and(eq(users.plan, 'premium'), gt(users.premiumUntil, now), lte(users.premiumUntil, new Date(now.getTime() + 7 * DAY)))!;

const solves7d = sql<number>`(select count(*)::int from ${events} e where e.user_id = ${users.id} and e.type = 'solve' and e.at > now() - interval '7 days')`;
const ownsAny = (ids?: number[]) =>
  exists(
    db.select({ x: sql`1` }).from(personas).where(and(eq(personas.userId, users.id), ids ? inArray(personas.personaId, ids.length ? ids : [-1]) : undefined)),
  );

export async function listUsers(q: UserQuery) {
  const now = new Date();
  const accs = await accountRows();
  const latest = (await latestExtension()).version;
  const where: (SQL | undefined)[] = [];
  if (q.q) {
    const s = q.q.toLowerCase();
    const ids = accs.filter((a) => String(a.personaId) === q.q || a.personaName.toLowerCase().includes(s) || a.clubName.toLowerCase().includes(s)).map((a) => a.personaId);
    where.push(or(ilike(users.email, likePattern(q.q)), ids.length ? ownsAny(ids) : undefined));
  }
  if (q.plan === 'premium') where.push(premiumSql(now));
  if (q.plan === 'free') where.push(not(premiumSql(now)));
  if (q.plan === 'expiring') where.push(expiringSql(now));
  if (q.activity === '24h') where.push(gt(users.lastSeenAt, new Date(now.getTime() - DAY)));
  if (q.activity === '7d') where.push(gt(users.lastSeenAt, new Date(now.getTime() - 7 * DAY)));
  if (q.activity === 'inactive30') where.push(lt(users.lastSeenAt, new Date(now.getTime() - 30 * DAY)));
  if (q.ea === 'with') where.push(ownsAny());
  if (q.ea === 'without') where.push(not(ownsAny()));
  if (q.ea === 'problem') where.push(ownsAny(accs.filter(isProblem).map((a) => a.personaId)));
  if (q.ea === 'outdated') where.push(ownsAny(accs.filter((a) => isOutdated(a.extVersion, latest)).map((a) => a.personaId)));
  const cond = and(...where);

  const [{ n }] = await db.select({ n: count() }).from(users).where(cond);
  const page = clampPage(q.page, n);
  const col = { lastSeen: users.lastSeenAt, createdAt: users.createdAt, solves7d, email: users.email }[q.sort];
  const order = q.dir === 'asc' ? asc(col) : desc(col);
  const rows = await db
    .select({ u: users, solves7d })
    .from(users)
    .where(cond)
    .orderBy(order, asc(users.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const own = rows.length
    ? await db.select({ personaId: personas.personaId, userId: personas.userId }).from(personas).where(inArray(personas.userId, rows.map((r) => r.u.id)))
    : [];
  const online = new Set(accs.filter((a) => a.online).map((a) => a.personaId));
  const admins = adminEmails();
  return {
    total: n,
    page,
    pageSize: PAGE_SIZE,
    rows: rows.map(({ u, solves7d: s7 }) => {
      const mine = own.filter((o) => o.userId === u.id);
      const admin = !!u.email && admins.includes(u.email.toLowerCase());
      return {
        id: u.id,
        email: u.email,
        createdAt: u.createdAt.getTime(),
        lastSeenAt: u.lastSeenAt.getTime(),
        planSet: u.plan === 'premium' ? ('premium' as const) : ('free' as const),
        plan: planInfo(u, admin, now.getTime()),
        admin,
        accounts: mine.length,
        online: mine.filter((o) => online.has(o.personaId)).length,
        solves7d: s7,
      };
    }),
  };
}

/** Solves per day for one user (or everyone when userId is null), found and not found. */
export async function solvesByDay(userId: string | null, days: string[]) {
  const day = sql<string>`to_char(${events.at} at time zone ${TZ()}, 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      day,
      found: sql<number>`count(*) filter (where (${events.data}->>'found')::boolean)::int`,
      notFound: sql<number>`count(*) filter (where not coalesce((${events.data}->>'found')::boolean, false))::int`,
    })
    .from(events)
    .where(and(eq(events.type, 'solve'), gte(events.at, new Date(Date.parse(`${days[0]}T00:00:00Z`) - DAY)), userId ? eq(events.userId, userId) : undefined))
    .groupBy(day);
  return { days, found: fillDays(days, rows, (r) => r.found), notFound: fillDays(days, rows, (r) => r.notFound) };
}

export async function userDetail(id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) return null;
  const now = Date.now();
  const admin = !!u.email && adminEmails().includes(u.email.toLowerCase());
  const [accs, own] = await Promise.all([accountRows(), owners()]);
  const mine = [...own.entries()].filter(([, o]) => o.userId === id);
  const byId = new Map(accs.map((a) => [a.personaId, a]));
  return {
    user: { id: u.id, email: u.email, createdAt: u.createdAt.getTime(), lastSeenAt: u.lastSeenAt.getTime(), admin },
    planSet: u.plan === 'premium' ? ('premium' as const) : ('free' as const),
    plan: planInfo(u, admin, now),
    accounts: mine.flatMap(([pid, o]) => {
      const a = byId.get(pid);
      return a ? [{ ...a, linkedAt: o.linkedAt, previousUserId: o.previousUserId }] : [];
    }),
    missing: mine.filter(([pid]) => !byId.has(pid)).map(([pid]) => pid),
    solves: await solvesByDay(id, lastDays(30, now, TZ())),
    latestExtension: (await latestExtension()).version,
  };
}
```

Remove unused imports (`isNotNull`, `dayKey`, `AdminAccount`) if `tsc`/lint flags them; export `UserRow`/`UserDetail` types as `Awaited<ReturnType<...>>` aliases:

```ts
export type UserRow = Awaited<ReturnType<typeof listUsers>>['rows'][number];
export type UserDetail = NonNullable<Awaited<ReturnType<typeof userDetail>>>;
```

- [ ] **Step 2: `server/admin/overview.ts`**

```ts
// Admin dashboard: KPIs, daily series, what needs attention, extension versions. Reads DB + cache only.
import { and, count, eq, gt, gte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { brickReports, challenges, events, sbcSets, trustedAccounts, users } from '../db/schema.js';
import { latestExtension } from '../extension.js';
import { meterDay } from '../meter.js';
import { lastSbcDrop } from '../sync.js';
import { withOwners } from './accounts.js';
import { dayKey, fillDays, isOutdated, isProblem, lastDays } from './query.js';
import { expiringSql, premiumSql, solvesByDay, TZ } from './users.js';

const DAY = 24 * 60 * 60 * 1000;

export async function overview(range: 7 | 30) {
  const now = Date.now();
  const nowD = new Date(now);
  const tz = TZ();
  const days = lastDays(range, now, tz);
  const since = new Date(Date.parse(`${days[0]}T00:00:00Z`) - DAY); // a day of slack for the tz offset; fillDays drops extras
  const latest = (await latestExtension()).version;
  const accs = await withOwners();

  const dayOf = (col: typeof events.at | typeof users.createdAt) => sql<string>`to_char(${col} at time zone ${tz}, 'YYYY-MM-DD')`;
  const evDay = dayOf(events.at);
  const [userAgg] = await db
    .select({
      total: count(),
      active24h: sql<number>`count(*) filter (where ${users.lastSeenAt} > ${new Date(now - DAY)})::int`,
      active7d: sql<number>`count(*) filter (where ${users.lastSeenAt} > ${new Date(now - 7 * DAY)})::int`,
      new7d: sql<number>`count(*) filter (where ${users.createdAt} > ${new Date(now - 7 * DAY)})::int`,
      premium: sql<number>`count(*) filter (where ${premiumSql(nowD)})::int`,
      expiring: sql<number>`count(*) filter (where ${expiringSql(nowD)})::int`,
    })
    .from(users);
  const signupDay = dayOf(users.createdAt);
  const [signups, syncs, eaDays, solves, expiringUsers, [sets], [chs], [bricks], [trusted]] = await Promise.all([
    db.select({ day: signupDay, n: sql<number>`count(*)::int` }).from(users).where(gte(users.createdAt, since)).groupBy(signupDay),
    db
      .select({ day: evDay, n: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where not (${events.data}->>'ok')::boolean)::int` })
      .from(events)
      .where(and(eq(events.type, 'sync'), gte(events.at, since)))
      .groupBy(evDay),
    // one ea_day row per account and day; a repeat after a restart is collapsed by max()
    db.execute<{ day: string; n: number }>(sql`
      select day, sum(c)::int as n from (
        select ${events.personaId} as p, ${events.data}->>'day' as day, max((${events.data}->>'count')::int) as c
        from ${events} where ${events.type} = 'ea_day' and ${events.at} >= ${since} group by 1, 2
      ) t group by day`),
    solvesByDay(null, days),
    db.select({ id: users.id, email: users.email, until: users.premiumUntil }).from(users).where(expiringSql(nowD)),
    db.select({ n: count() }).from(sbcSets),
    db.select({ n: count() }).from(challenges),
    db.select({ n: count() }).from(brickReports),
    db.select({ n: count() }).from(trustedAccounts),
  ]);

  const eaToday = accs.reduce((n, a) => n + a.ea.today, 0);
  const eaRequests = fillDays(days, [...eaDays].filter((r) => r.day !== meterDay()), (r) => Number(r.n));
  eaRequests[eaRequests.length - 1] = eaToday; // today comes from the live meters

  const attention = [
    ...accs.flatMap((a) => {
      const base = { personaId: a.personaId, personaName: a.personaName, userId: a.ownerId };
      if (a.error) return [{ kind: 'error' as const, ...base, detail: a.error }];
      if (a.ea.pausedUntil) return [{ kind: 'paused' as const, ...base, detail: null }];
      if (a.ea.today >= a.ea.limit) return [{ kind: 'atLimit' as const, ...base, detail: null }];
      if (isOutdated(a.extVersion, latest)) return [{ kind: 'outdated' as const, ...base, detail: a.extVersion }];
      return [];
    }),
    ...expiringUsers.map((u) => ({ kind: 'expiring' as const, userId: u.id, email: u.email, until: u.until!.getTime() })),
  ];

  const versions = new Map<string, number>();
  for (const a of accs) versions.set(a.extVersion ?? '?', (versions.get(a.extVersion ?? '?') ?? 0) + 1);

  return {
    at: now,
    lastDrop: lastSbcDrop(),
    latestExtension: latest,
    range,
    kpis: {
      users: { total: userAgg.total, active24h: userAgg.active24h, active7d: userAgg.active7d, new7d: userAgg.new7d },
      premium: { total: userAgg.premium, expiring7d: userAgg.expiring },
      accounts: { total: accs.length, online: accs.filter((a) => a.online).length, problem: accs.filter(isProblem).length, unlinked: accs.filter((a) => !a.ownerId).length },
      solvesToday: solves.found.at(-1)! + solves.notFound.at(-1)!,
      ea: { today: eaToday, limit: accs.reduce((n, a) => n + a.ea.limit, 0) },
    },
    series: {
      days,
      found: solves.found,
      notFound: solves.notFound,
      signups: fillDays(days, signups, (r) => r.n),
      eaRequests,
      syncs: fillDays(days, syncs, (r) => r.n),
      syncFailed: fillDays(days, syncs, (r) => r.failed),
    },
    attention,
    versions: [...versions].map(([version, n]) => ({ version, count: n, latest: version === latest })).sort((a, b) => b.count - a.count),
    db: { sets: sets.n, challenges: chs.n, brickReports: bricks.n, trusted: trusted.n },
  };
}
export type Overview = Awaited<ReturnType<typeof overview>>;
```

Note: `db.execute` with postgres-js returns the row array directly; if `tsc` says otherwise, use `(await db.execute(...)) as unknown as { day: string; n: number }[]`. `dayKey`, `gt` may end unused — remove them.

- [ ] **Step 3: `server/admin/routes.ts`** — register all admin routes

```ts
// /api/admin/*: admins only (ADMIN_EMAILS). Reads DB + cache; the POSTs are the existing actions.
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { accountById, listAccounts } from '../accounts.js';
import { db } from '../db/index.js';
import { userEventCount, userEvents } from '../db/events.js';
import { setTrusted } from '../db/sbcs.js';
import { resetQuota, setPlan } from '../db/users.js';
import { users } from '../db/schema.js';
import { adminSync } from '../sync.js';
import { requireAdmin } from './auth.js';
import { invalidateAccountRows, listAccountsPage } from './accounts.js';
import { overview } from './overview.js';
import { clampPage, PAGE_SIZE, parseAccountQuery, parsePage, parseRange, parseUserQuery } from './query.js';
import { listUsers, userDetail } from './users.js';

type Q = { Querystring: Record<string, string> };

export function registerAdminRoutes(app: FastifyInstance) {
  app.get<Q>('/api/admin/overview', async (req) => {
    await requireAdmin(req);
    return overview(parseRange(req.query.range));
  });
  app.get<Q>('/api/admin/users', async (req) => {
    await requireAdmin(req);
    return listUsers(parseUserQuery(req.query));
  });
  app.get<{ Params: { id: string } }>('/api/admin/users/:id', async (req, reply) => {
    await requireAdmin(req);
    const d = await userDetail(req.params.id);
    return d ?? reply.code(404).send({ error: 'unknown user' });
  });
  app.get<{ Params: { id: string } } & Q>('/api/admin/users/:id/events', async (req) => {
    await requireAdmin(req);
    const page = clampPage(parsePage(req.query.page), await userEventCount(req.params.id));
    return { ...(await userEvents(req.params.id, page, PAGE_SIZE)), page, pageSize: PAGE_SIZE };
  });
  app.get<Q>('/api/admin/accounts', async (req) => {
    await requireAdmin(req);
    return listAccountsPage(parseAccountQuery(req.query));
  });
  // + the four POST routes moved verbatim from server/index.ts (sync, trust, plan, quota-reset),
  //   each calling invalidateAccountRows() before returning success.
}
```

Move the four `app.post('/api/admin/...')` handlers from `server/index.ts:246-291` into the function body unchanged (they use `accountById`, `listAccounts`, `adminSync`, `setTrusted`, `setPlan`, `resetQuota`, `db`, `users`, `eq`). Add `invalidateAccountRows();` before each `return { ... }` of success.

Add `userEventCount` to `server/db/events.ts`:

```ts
export async function userEventCount(userId: string): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(events).where(eq(events.userId, userId));
  return n;
}
```

`userEvents` still returns `total`.

- [ ] **Step 4: Wire into `server/index.ts`, delete `server/admin.ts`**

- Remove `import { adminStats, isAdmin, requireAdmin } from './admin.js';` → `import { isAdmin } from './admin/auth.js';` and `import { registerAdminRoutes } from './admin/routes.js';`
- Delete the `// ---- admin` block (`GET /api/admin/stats` and the four POSTs).
- Put `registerAdminRoutes(app);` where the block was.
- Drop now-unused imports (`setTrusted`, `resetQuota`, `setPlan`, `adminSync` if unused elsewhere — check with `tsc`).
- `git rm server/admin.ts`.

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Smoke test against the real local DB + cache**

Create `$SCRATCH/admin-smoke.ts` (scratchpad, not committed):

```ts
import { initDb, closeDb } from '/home/mario/Desktop/Projects/fc27-sbc-builder/server/db/index.js';
import { loadAccounts } from '/home/mario/Desktop/Projects/fc27-sbc-builder/server/accounts.js';
import { overview } from '/home/mario/Desktop/Projects/fc27-sbc-builder/server/admin/overview.js';
import { listUsers, userDetail } from '/home/mario/Desktop/Projects/fc27-sbc-builder/server/admin/users.js';
import { listAccountsPage } from '/home/mario/Desktop/Projects/fc27-sbc-builder/server/admin/accounts.js';
import { parseAccountQuery, parseUserQuery } from '/home/mario/Desktop/Projects/fc27-sbc-builder/server/admin/query.js';
await initDb();
await loadAccounts();
const o = await overview(30);
console.log(JSON.stringify(o.kpis), o.series.days.length, o.attention.length);
for (const q of [{}, { plan: 'premium' }, { ea: 'without' }, { q: '%' }, { page: '99' }, { sort: 'solves7d', dir: 'asc' }]) {
  const r = await listUsers(parseUserQuery(q));
  console.log(JSON.stringify(q), r.total, r.page, r.rows.map((x) => x.email));
}
const first = (await listUsers(parseUserQuery({}))).rows[0];
console.log((await userDetail(first.id))?.accounts.length, await userDetail('nope'));
console.log((await listAccountsPage(parseAccountQuery({ state: 'outdated' }))).rows.map((a) => a.personaName));
await closeDb();
process.exit(0);
```

Run from repo root: `npx tsx $SCRATCH/admin-smoke.ts`
Expected: KPI JSON with 4 users; `days.length` 30; `{}` → 4 rows; `premium` → the Premium users + admin; `without` → the user with no EA account; `q=%` → 0 rows (literal); `page=99` → page 1 with all rows; `userDetail('nope')` → `null`; outdated accounts listed. Fix anything that disagrees.

- [ ] **Step 6: `docs/api.md`**

Replace the `### GET /api/admin/stats` section with sections for the five GET endpoints: query params with allowed values and defaults ("invalid values fall back to the default"), page size 25, page past the end → last page, response JSON examples following the `Overview`, `UserRow`, `UserDetail`, `EventRow` shapes above. Keep `<account>` definition (now also used by accounts list, plus `ownerId`, `ownerEmail`; detail adds `linkedAt`, `previousUserId`). Note "Reads only the cache and the DB, never EA." Keep the POST sections, add "The next admin read is fresh (account rows are memoized 5 s otherwise)."

- [ ] **Step 7: Verify + commit**

Run: `npm run typecheck && npm test`
Expected: PASS.

```bash
git pull --rebase
git add -A server/admin server/admin.ts server/index.ts server/db/events.ts docs/api.md
git commit -m "feat(admin): paged users, user detail, accounts and overview endpoints"
```

---

### Task 5: Admin sub-routes in `route.ts`

**Files:**
- Modify: `web/src/route.ts`
- Test: `web/src/route.test.ts`

**Interfaces:**
- Produces: `AdminPage = 'overview' | 'users' | 'user' | 'accounts'`; route variant `{ view: 'admin'; page: AdminPage; userId: string | null; query: string }` (`query` without `?`, only for `users` / `accounts`); `adminRoute(page: AdminPage, extra?: { userId?: string; query?: string }): Route`.

- [ ] **Step 1: Failing tests** — append to `web/src/route.test.ts`, and change the two existing `{ view: 'admin' }` literals to `adminRoute('overview')`:

```ts
import { adminRoute } from './route.js'; // add to the existing import

test('admin sub-routes keep their query', () => {
  assert.deepEqual(parseRoute('/dashboard/admin'), adminRoute('overview'));
  assert.deepEqual(parseRoute('/dashboard/admin/users', '?plan=premium&page=2'), adminRoute('users', { query: 'plan=premium&page=2' }));
  assert.deepEqual(parseRoute('/dashboard/admin/users/user_2Rf%2Bx'), adminRoute('user', { userId: 'user_2Rf+x' }));
  assert.deepEqual(parseRoute('/dashboard/admin/accounts', '?state=online'), adminRoute('accounts', { query: 'state=online' }));
  assert.deepEqual(parseRoute('/dashboard/admin/nope'), adminRoute('overview'));
  assert.equal(routePath(adminRoute('users', { query: 'plan=premium' })), '/dashboard/admin/users?plan=premium');
  assert.equal(routePath(adminRoute('users')), '/dashboard/admin/users');
  assert.equal(routePath(adminRoute('user', { userId: 'user_2Rf+x' })), '/dashboard/admin/users/user_2Rf%2Bx');
  for (const r of [adminRoute('overview'), adminRoute('accounts', { query: 'q=a' }), adminRoute('user', { userId: 'u_1' })])
    assert.deepEqual(parseRoute(...(routePath(r).split('?') as [string, string?]).map((s, i) => (i ? `?${s}` : s)) as [string, string]), r);
});

test('canonicalPath ignores the admin query', () => {
  assert.equal(canonicalPath(adminRoute('users', { query: 'page=2' }), '/dashboard/admin/users'), null);
});
```

- [ ] **Step 2: Run** `node --import tsx --test web/src/route.test.ts` → FAIL (`adminRoute` missing).

- [ ] **Step 3: Implement** in `web/src/route.ts`:

Header comment: replace `/dashboard/admin       admin dashboard (admins only)` with
`/dashboard/admin[/users[/:id]|/accounts][?filters]   admin panel (admins only)`.

```ts
export type AdminPage = 'overview' | 'users' | 'user' | 'accounts';
// in Route union, replace { view: 'admin' } with:
  | { view: 'admin'; page: AdminPage; userId: string | null; query: string }

export const adminRoute = (page: AdminPage, extra: { userId?: string; query?: string } = {}): Route => ({
  view: 'admin',
  page,
  userId: page === 'user' ? extra.userId ?? null : null,
  query: page === 'users' || page === 'accounts' ? extra.query ?? '' : '',
});
```

In `parseRoute`, replace `if (x === 'admin') return { view: 'admin' };` with:

```ts
  if (x === 'admin') {
    const query = search.replace(/^\?/, '');
    if (y === 'users' && z) return adminRoute('user', { userId: decodeURIComponent(z) });
    if (y === 'users') return adminRoute('users', { query });
    if (y === 'accounts') return adminRoute('accounts', { query });
    return adminRoute('overview');
  }
```

(`const [x, y, z] = ...` already exists.) In `routePath`, remove `case 'admin':` from the club/settings group and add:

```ts
    case 'admin': {
      const base = r.page === 'overview' ? '/dashboard/admin' : r.page === 'user' ? `/dashboard/admin/users/${encodeURIComponent(r.userId ?? '')}` : `/dashboard/admin/${r.page}`;
      return r.query ? `${base}?${r.query}` : base;
    }
```

In `canonicalPath`: `const want = routePath(r).split('?')[0];`.

- [ ] **Step 4: Fix `App.tsx` callers**: in `go()` (L448-454):

```ts
    navigate(v === 'sbcs' ? { view: 'sbcs', setId: null, challengeId: null } : v === 'admin' ? adminRoute('overview') : { view: v });
```

Import `adminRoute`. `{view === 'admin' && <AdminView />}` stays until Task 7.

- [ ] **Step 5: Run** `npm test && npm run typecheck` → PASS.

- [ ] **Step 6: Commit**

```bash
git add web/src/route.ts web/src/route.test.ts web/src/App.tsx
git commit -m "feat(route): admin sub-pages with filters in the URL"
```

---

### Task 6: API client types and shared admin UI pieces

**Files:**
- Modify: `web/src/api.ts` (replace `adminStats`, `AdminStats`; keep `AdminAccount`, `AdminSyncResult`)
- Create: `web/src/components/admin/useLoad.ts`, `format.ts`, `DataTable.tsx`, `BarChart.tsx`, `KpiCard.tsx`, `AdminLayout.tsx`
- Modify: `web/src/styles.css` (replace the admin block starting at `/* ---------- admin ---------- */`, ~L2913–3112)
- Modify: `web/src/locales/en.ts`, `ro.ts`

**Interfaces:**
- Consumes: Task 4 response shapes; Task 5 `adminRoute`, `AdminPage`, `Route`.
- Produces:
  - `api.adminOverview(range: 7 | 30): Promise<AdminOverview>`, `api.adminUsers(query: string): Promise<Paged<AdminUserRow>>`, `api.adminUser(id: string): Promise<AdminUserDetail>`, `api.adminUserEvents(id: string, page: number): Promise<Paged<AdminEvent>>`, `api.adminAccounts(query: string): Promise<Paged<AdminAccountRow> & { latestExtension: string }>`; existing `adminSync`, `adminTrust`, `adminPlan`, `adminQuotaReset`.
  - `useLoad<T>(fn: () => Promise<T>, deps: unknown[], refreshMs?: number): { data: T | null; error: string | null; loading: boolean; reload: () => Promise<void> }`
  - `DataTable<T>` props: `{ caption: string; columns: Column<T>[]; rows: T[] | null; rowKey: (r: T) => string | number; rowHref?: (r: T) => string; onRowOpen?: (r: T) => void; sort?: { key: string; dir: 'asc' | 'desc' }; onSort?: (key: string) => void; page: number; total: number; pageSize: number; onPage: (p: number) => void; empty: string; loading: boolean }`; `Column<T> = { key: string; label: string; sortable?: boolean; render: (r: T) => ReactNode; primary?: boolean; hideSm?: boolean; num?: boolean }`
  - `BarChart` props: `{ title: string; days: string[]; series: { label: string; values: number[]; tone: 'go' | 'ink' | 'muted' | 'bad' }[] }` (series stack in order)
  - `KpiCard` props: `{ label: string; value: ReactNode; sub?: ReactNode; href?: string; onOpen?: () => void; tone?: 'bad' }`
  - `AdminLayout` props: `{ route: Extract<Route, { view: 'admin' }>; navigate: (r: Route, replace?: boolean) => void }`
  - `format.ts`: `shortDay(day: string, lang: string): string`, `setQuery(query: string, patch: Record<string, string | number | null>): string` (drops empty / default values, resets `page` unless patched), `getQuery(query: string): Record<string, string>`, `untilEndOfDay(date: string): string | null`

- [ ] **Step 1: `web/src/api.ts`** — add after `AdminAccount`:

```ts
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
```

Delete `AdminStats`. Replace `adminStats` in `api` with:

```ts
  adminOverview: (range: 7 | 30) => req<AdminOverview>(`/api/admin/overview?range=${range}`),
  adminUsers: (query: string) => req<Paged<AdminUserRow>>(`/api/admin/users${query ? `?${query}` : ''}`),
  adminUser: (id: string) => req<AdminUserDetail>(`/api/admin/users/${encodeURIComponent(id)}`),
  adminUserEvents: (id: string, page: number) => req<Paged<AdminEvent>>(`/api/admin/users/${encodeURIComponent(id)}/events?page=${page}`),
  adminAccounts: (query: string) => req<Paged<AdminAccountRow> & { latestExtension: string }>(`/api/admin/accounts${query ? `?${query}` : ''}`),
```

- [ ] **Step 2: `useLoad.ts`**

```ts
// Loads admin data, keeps the last good result while reloading, refreshes while the tab is visible.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n';
import { errorText } from '../../messages';

export function useLoad<T>(fn: () => Promise<T>, deps: unknown[], refreshMs = 0) {
  const { t } = useI18n();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);
  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await run();
      if (my === seq.current) (setData(d), setError(null));
    } catch (e) {
      if (my === seq.current) setError(errorText(e, t));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, [run, t]);
  useEffect(() => {
    void reload();
    if (!refreshMs) return;
    const id = setInterval(() => !document.hidden && void reload(), refreshMs);
    return () => clearInterval(id);
  }, [reload, refreshMs]);
  return { data, error, loading, reload };
}
```

(The `seq` guard drops out-of-order responses when filters change fast.)

- [ ] **Step 3: `format.ts`**

```ts
export const getQuery = (query: string) => Object.fromEntries(new URLSearchParams(query));

/** New query string with `patch` applied; empty values are removed, `page` resets unless patched. */
export function setQuery(query: string, patch: Record<string, string | number | null>): string {
  const p = new URLSearchParams(query);
  if (!('page' in patch)) p.delete('page');
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '' || v === 'all' || (k === 'page' && Number(v) <= 1)) p.delete(k);
    else p.set(k, String(v));
  }
  return p.toString();
}

export const shortDay = (day: string, lang: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** A date input value → end of that day in the admin's local time, as ISO (see docs/api.md admin/plan). */
export const untilEndOfDay = (date: string) => (date ? new Date(`${date}T23:59:59`).toISOString() : null);
```

Add `web/src/components/admin/format.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setQuery } from './format.js';

test('setQuery resets page on filter change and drops defaults', () => {
  assert.equal(setQuery('plan=premium&page=3', { activity: '7d' }), 'plan=premium&activity=7d');
  assert.equal(setQuery('plan=premium', { plan: 'all' }), '');
  assert.equal(setQuery('plan=premium', { page: 2 }), 'plan=premium&page=2');
  assert.equal(setQuery('page=2', { page: 1 }), '');
  assert.equal(setQuery('', { q: 'a b' }), 'q=a+b');
});
```

Run: `npm test` → PASS.

- [ ] **Step 4: `DataTable.tsx`**

```tsx
// Admin table: sortable headers (aria-sort), row opens a detail, server-side paging.
// Under 860px rows become stacked cards (CSS), cells carry data-label.
import type { MouseEvent, ReactNode } from 'react';
import { CaretDown, CaretLeft, CaretRight, CaretUp } from '@phosphor-icons/react';
import { useI18n } from '../../i18n';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render: (r: T) => ReactNode;
  primary?: boolean; // holds the row link
  hideSm?: boolean;
  num?: boolean;
}

interface Props<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[] | null;
  rowKey: (r: T) => string | number;
  rowHref?: (r: T) => string;
  onRowOpen?: (r: T) => void;
  sort?: { key: string; dir: 'asc' | 'desc' };
  onSort?: (key: string) => void;
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  empty: string;
  loading: boolean;
}

export function DataTable<T>(p: Props<T>) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(p.total / p.pageSize));
  const from = p.total ? (p.page - 1) * p.pageSize + 1 : 0;
  const to = Math.min(p.page * p.pageSize, p.total);
  const open = (e: MouseEvent, r: T) => {
    if (!p.onRowOpen || e.metaKey || e.ctrlKey || e.button !== 0) return; // new tab keeps working
    e.preventDefault();
    p.onRowOpen(r);
  };
  return (
    <div className="adm-table-wrap" aria-busy={p.loading}>
      <table className="adm-table">
        <caption className="sr-only">{p.caption}</caption>
        <thead>
          <tr>
            {p.columns.map((c) => {
              const active = p.sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={[c.num && 'num', c.hideSm && 'hide-sm'].filter(Boolean).join(' ') || undefined}
                  aria-sort={active ? (p.sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.sortable && p.onSort ? (
                    <button type="button" className="adm-sort" onClick={() => p.onSort!(c.key)}>
                      {c.label}
                      {active ? p.sort!.dir === 'asc' ? <CaretUp aria-hidden="true" /> : <CaretDown aria-hidden="true" /> : null}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {p.rows === null
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="adm-skel" aria-hidden="true">
                  {p.columns.map((c) => <td key={c.key} className={c.hideSm ? 'hide-sm' : undefined}><span /></td>)}
                </tr>
              ))
            : p.rows.map((r) => (
                <tr key={p.rowKey(r)} className={p.onRowOpen ? 'adm-row-link' : undefined} onClick={p.onRowOpen ? (e) => { if ((e.target as HTMLElement).closest('a,button,select,input')) return; p.onRowOpen!(r); } : undefined}>
                  {p.columns.map((c) => (
                    <td key={c.key} data-label={c.label} className={[c.num && 'num', c.hideSm && 'hide-sm', c.primary && 'primary'].filter(Boolean).join(' ') || undefined}>
                      {c.primary && p.rowHref ? <a href={p.rowHref(r)} onClick={(e) => open(e, r)}>{c.render(r)}</a> : c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {p.rows && p.rows.length === 0 && <p className="adm-empty">{p.empty}</p>}
      <nav className="adm-pager" aria-label={t('admin.table.pages')}>
        <span className="muted" role="status">{t('admin.table.range', { from, to, total: p.total })}</span>
        <button type="button" className="ghost" disabled={p.page <= 1} onClick={() => p.onPage(p.page - 1)} aria-label={t('admin.table.prev')}>
          <CaretLeft aria-hidden="true" />
        </button>
        <span aria-current="page">{t('admin.table.page', { page: p.page, pages })}</span>
        <button type="button" className="ghost" disabled={p.page >= pages} onClick={() => p.onPage(p.page + 1)} aria-label={t('admin.table.next')}>
          <CaretRight aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}
```

- [ ] **Step 5: `BarChart.tsx`**

```tsx
// Daily bar chart, stacked series, hand-written SVG. Values are also in a visually hidden table.
import { useI18n } from '../../i18n';
import { shortDay } from './format';

type Tone = 'go' | 'ink' | 'muted' | 'bad';
interface Props { title: string; days: string[]; series: { label: string; values: number[]; tone: Tone }[] }

const W = 600;
const H = 180;
const PAD = { l: 28, r: 6, t: 10, b: 22 };

export function BarChart({ title, days, series }: Props) {
  const { t, lang } = useI18n();
  const totals = days.map((_, i) => series.reduce((n, s) => n + s.values[i], 0));
  const max = Math.max(1, ...totals);
  const niceMax = max <= 5 ? max : Math.ceil(max / 5) * 5;
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const bw = iw / days.length;
  const y = (v: number) => PAD.t + ih - (v / niceMax) * ih;
  const every = days.length > 10 ? Math.ceil(days.length / 6) : 1;
  const sum = totals.reduce((a, b) => a + b, 0);
  return (
    <figure className="adm-chart">
      <figcaption>
        <span>{title}</span>
        <b>{sum}</b>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('admin.chart.aria', { title, total: sum })} preserveAspectRatio="none">
        {[0, niceMax / 2, niceMax].map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(v)} y2={y(v)} className="adm-grid" />
            <text x={PAD.l - 6} y={y(v) + 4} className="adm-axis" textAnchor="end">{Math.round(v)}</text>
          </g>
        ))}
        {days.map((d, i) => {
          let acc = 0;
          return (
            <g key={d}>
              <title>{`${shortDay(d, lang)}: ${series.map((s) => `${s.label} ${s.values[i]}`).join(', ')}`}</title>
              <rect x={PAD.l + i * bw} y={PAD.t} width={bw} height={ih} className="adm-hit" />
              {series.map((s) => {
                const v = s.values[i];
                const top = y(acc + v);
                const h = y(acc) - top;
                acc += v;
                return v ? <rect key={s.label} x={PAD.l + i * bw + bw * 0.15} y={top} width={bw * 0.7} height={Math.max(h, 1)} rx={2} className={`adm-bar ${s.tone}`} /> : null;
              })}
              {i % every === 0 && <text x={PAD.l + i * bw + bw / 2} y={H - 6} className="adm-axis" textAnchor="middle">{shortDay(d, lang)}</text>}
            </g>
          );
        })}
      </svg>
      {series.length > 1 && (
        <ul className="adm-legend">
          {series.map((s) => (
            <li key={s.label}><i className={`adm-swatch ${s.tone}`} aria-hidden="true" />{s.label}</li>
          ))}
        </ul>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead><tr><th scope="col">{t('admin.chart.day')}</th>{series.map((s) => <th key={s.label} scope="col">{s.label}</th>)}</tr></thead>
        <tbody>{days.map((d, i) => <tr key={d}><th scope="row">{d}</th>{series.map((s) => <td key={s.label}>{s.values[i]}</td>)}</tr>)}</tbody>
      </table>
    </figure>
  );
}
```

`useI18n()` exposes `lang` (`web/src/i18n.tsx:44`).

- [ ] **Step 6: `KpiCard.tsx`**

```tsx
import type { ReactNode } from 'react';

interface Props { label: string; value: ReactNode; sub?: ReactNode; href?: string; onOpen?: () => void; tone?: 'bad' }

export function KpiCard({ label, value, sub, href, onOpen, tone }: Props) {
  const body = (
    <>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </>
  );
  const cls = `adm-kpi${tone ? ` ${tone}` : ''}`;
  return href && onOpen ? (
    <a className={cls} href={href} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); onOpen(); }}>{body}</a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
```

- [ ] **Step 7: `AdminLayout.tsx`** (screens are stubs until Tasks 7–10)

```tsx
// Admin panel shell: tabs Overview · Users · EA accounts; the page and its filters live in the URL.
import { adminRoute, routePath, type AdminPage, type Route } from '../../route';
import { useI18n } from '../../i18n';
import { Overview } from './Overview';
import { UsersTable } from './UsersTable';
import { UserDetail } from './UserDetail';
import { AccountsTable } from './AccountsTable';

type AdminR = Extract<Route, { view: 'admin' }>;
export interface AdminProps { route: AdminR; navigate: (r: Route, replace?: boolean) => void }

const TABS: { page: Exclude<AdminPage, 'user'>; key: string }[] = [
  { page: 'overview', key: 'admin.tab.overview' },
  { page: 'users', key: 'admin.tab.users' },
  { page: 'accounts', key: 'admin.tab.accounts' },
];

export function AdminLayout({ route, navigate }: AdminProps) {
  const { t } = useI18n();
  const active = route.page === 'user' ? 'users' : route.page;
  return (
    <section className="adm">
      <header className="adm-head">
        <h1>{t('admin.title')}</h1>
        <nav className="adm-tabs" aria-label={t('admin.tabs')}>
          {TABS.map((tab) => {
            const r = adminRoute(tab.page);
            return (
              <a
                key={tab.page}
                href={routePath(r)}
                aria-current={active === tab.page ? 'page' : undefined}
                onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(r); }}
              >
                {t(tab.key)}
              </a>
            );
          })}
        </nav>
      </header>
      {route.page === 'overview' && <Overview route={route} navigate={navigate} />}
      {route.page === 'users' && <UsersTable route={route} navigate={navigate} />}
      {route.page === 'user' && <UserDetail route={route} navigate={navigate} />}
      {route.page === 'accounts' && <AccountsTable route={route} navigate={navigate} />}
    </section>
  );
}
```

For this task create the four screen files as `export function X(_: AdminProps) { return null; }` stubs so it compiles.

- [ ] **Step 8: CSS** — delete the old block from `/* ---------- admin ---------- */` up to (not including) `.legal-links` (~L2913–3112) and replace with:

```css
/* ---------- admin ---------- */
.adm { display: grid; gap: 18px; padding-bottom: 32px; }
.adm-head { display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px; }
.adm-head h1 { margin: 0; }
.adm-tabs { display: flex; gap: 4px; padding: 4px; border: 1px solid var(--line); border-radius: var(--r-box); background: var(--surface); overflow-x: auto; }
.adm-tabs a { padding: 8px 14px; border-radius: var(--r-ctl); color: var(--ink-2); text-decoration: none; white-space: nowrap; font-weight: 600; }
.adm-tabs a:hover { background: var(--surface-2); color: var(--ink); }
.adm-tabs a[aria-current='page'] { background: var(--go); color: var(--go-ink); }
.adm-card { border: 1px solid var(--line); border-radius: var(--r-box); background: var(--surface); padding: 16px; }
.adm-card > h2 { margin: 0 0 12px; font-size: 15px; }
.adm-toolbar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.adm-toolbar input[type='search'] { flex: 1 1 240px; min-width: 0; }
.adm-toolbar input, .adm-toolbar select, .adm-card select, .adm-card input[type='date'] {
  height: 36px; padding: 0 10px; border: 1px solid var(--line); border-radius: var(--r-ctl); background: var(--bg-0); color: var(--ink);
}
.adm-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
.adm-kpi { display: grid; gap: 2px; padding: 14px; border: 1px solid var(--line); border-radius: var(--r-box); background: var(--surface); color: var(--ink); text-decoration: none; }
a.adm-kpi:hover { background: var(--surface-2); }
.adm-kpi span { color: var(--ink-3); font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; }
.adm-kpi b { font: 700 30px/1.1 var(--font-num); }
.adm-kpi small { color: var(--ink-2); }
.adm-kpi.bad b { color: var(--bad); }
.adm-grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 12px; }
.adm-chart { margin: 0; }
.adm-chart figcaption { display: flex; justify-content: space-between; margin-bottom: 6px; color: var(--ink-2); }
.adm-chart svg { width: 100%; height: 180px; display: block; }
.adm-grid { stroke: var(--line); stroke-width: 1; }
.adm-axis { fill: var(--ink-3); font-size: 11px; }
.adm-hit { fill: transparent; }
.adm-hit:hover { fill: oklch(1 0 0 / 0.04); }
.adm-bar.go, .adm-swatch.go { fill: var(--go); background: var(--go); }
.adm-bar.ink, .adm-swatch.ink { fill: var(--ink-2); background: var(--ink-2); }
.adm-bar.muted, .adm-swatch.muted { fill: var(--ink-3); background: var(--ink-3); }
.adm-bar.bad, .adm-swatch.bad { fill: var(--bad); background: var(--bad); }
.adm-legend { display: flex; gap: 14px; margin: 6px 0 0; padding: 0; list-style: none; color: var(--ink-2); font-size: 12px; }
.adm-swatch { display: inline-block; width: 10px; height: 10px; margin-right: 6px; border-radius: 2px; }
.adm-range { display: inline-flex; gap: 4px; }
.adm-range button[aria-pressed='true'] { background: var(--surface-3); color: var(--ink); }
.adm-table-wrap { border: 1px solid var(--line); border-radius: var(--r-box); background: var(--surface); overflow: hidden; }
.adm-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.adm-table th { padding: 10px 12px; text-align: left; color: var(--ink-3); font-weight: 600; font-size: 12px; border-bottom: 1px solid var(--line); white-space: nowrap; }
.adm-table td { padding: 10px 12px; border-bottom: 1px solid var(--line); vertical-align: middle; }
.adm-table tr:last-child td { border-bottom: 0; }
.adm-table .num { text-align: right; font-variant-numeric: tabular-nums; }
.adm-table td.primary a { color: var(--ink); font-weight: 600; text-decoration: none; }
.adm-row-link { cursor: pointer; }
.adm-row-link:hover td { background: var(--surface-2); }
.adm-table td.primary a:focus-visible { outline: 2px solid var(--go); outline-offset: 2px; border-radius: 4px; }
.adm-sort { all: unset; display: inline-flex; gap: 4px; align-items: center; cursor: pointer; }
.adm-sort:focus-visible { outline: 2px solid var(--go); border-radius: 4px; }
.adm-skel span { display: block; height: 12px; border-radius: 4px; background: var(--surface-2); animation: adm-pulse 1.2s ease-in-out infinite; }
@keyframes adm-pulse { 50% { opacity: 0.5; } }
@media (prefers-reduced-motion: reduce) { .adm-skel span { animation: none; } }
.adm-empty { margin: 0; padding: 24px; text-align: center; color: var(--ink-3); }
.adm-pager { display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--line); }
.adm-pager span[role='status'] { margin-right: auto; }
.adm-pager button { width: 32px; height: 32px; display: grid; place-items: center; border-radius: var(--r-ctl); }
.adm-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; border: 1px solid var(--line); border-radius: 999px; font-size: 12px; white-space: nowrap; }
.adm-badge.premium { border-color: var(--go); color: var(--go); }
.adm-badge.bad { border-color: var(--bad); color: var(--bad); }
.adm-dot { display: inline-flex; align-items: center; gap: 6px; }
.adm-list { display: grid; margin: 0; padding: 0; list-style: none; }
.adm-list li { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; border-bottom: 1px solid var(--line); }
.adm-list li:last-child { border-bottom: 0; }
.adm-dl { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin: 0; font-size: 13px; }
.adm-dl dt { color: var(--ink-3); }
.adm-dl dd { margin: 0; }
.adm-back { display: inline-flex; gap: 6px; align-items: center; color: var(--ink-2); text-decoration: none; }
.adm-actions { display: flex; flex-wrap: wrap; gap: 8px; }
@media (max-width: 860px) {
  .adm-table thead { display: none; }
  .adm-table tr { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; padding: 12px; border-bottom: 1px solid var(--line); }
  .adm-table td { padding: 0; border: 0; }
  .adm-table td.primary { grid-column: 1 / -1; }
  .adm-table .hide-sm { display: none; }
  .adm-table td:not(.primary)::before { content: attr(data-label) ' · '; color: var(--ink-3); }
  .adm-table .num { text-align: left; }
}
```

- [ ] **Step 9: i18n keys** — add to `en.ts` (remove all old `admin.*` keys that nothing uses after Task 10; for now only add):

```ts
  'admin.tabs': 'Admin sections',
  'admin.tab.overview': 'Dashboard',
  'admin.tab.users': 'Users',
  'admin.tab.accounts': 'EA accounts',
  'admin.table.pages': 'Pages',
  'admin.table.range': '{from}–{to} of {total}',
  'admin.table.page': 'Page {page} of {pages}',
  'admin.table.prev': 'Previous page',
  'admin.table.next': 'Next page',
  'admin.chart.aria': '{title}: {total} in total',
  'admin.chart.day': 'Day',
```

`ro.ts`:

```ts
  'admin.tabs': 'Secțiuni admin',
  'admin.tab.overview': 'Dashboard',
  'admin.tab.users': 'Utilizatori',
  'admin.tab.accounts': 'Conturi EA',
  'admin.table.pages': 'Pagini',
  'admin.table.range': '{from}–{to} din {total}',
  'admin.table.page': 'Pagina {page} din {pages}',
  'admin.table.prev': 'Pagina anterioară',
  'admin.table.next': 'Pagina următoare',
  'admin.chart.aria': '{title}: {total} în total',
  'admin.chart.day': 'Zi',
```

- [ ] **Step 10: Verify + commit**

Run: `npm run typecheck && npm test && npm run i18n:check`
Expected: PASS (old `AdminView` still references removed `api.adminStats` → temporarily keep `AdminView` compiling by leaving it in `App.tsx`? It won't compile. So in this task also switch `App.tsx`: `{view === 'admin' && <AdminLayout route={route} navigate={navigate} />}` (narrow with `route.view === 'admin'`) and `git rm web/src/components/AdminView.tsx`.)

```bash
git add -A web/src
git commit -m "feat(admin): admin shell, data table, bar chart and api types"
```

---

### Task 7: Overview screen

**Files:**
- Modify: `web/src/components/admin/Overview.tsx`
- Modify: `en.ts`, `ro.ts`

**Interfaces:**
- Consumes: `api.adminOverview`, `api.adminSync`, `AdminOverview`, `AdminSyncResult`, `useLoad`, `KpiCard`, `BarChart`, `adminRoute`, `routePath`, `setQuery`, `AdminProps`.

- [ ] **Step 1: Implement**

```tsx
// Dashboard: KPIs (each opens the filtered table), 7/30-day charts, what needs attention, versions,
// data counts and the sync-everyone action from the old screen.
import { useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { api, type AdminAttention, type AdminSyncResult } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { errorText } from '../../messages';
import { adminRoute, routePath } from '../../route';
import type { AdminProps } from './AdminLayout';
import { BarChart } from './BarChart';
import { KpiCard } from './KpiCard';
import { useLoad } from './useLoad';

export function Overview({ navigate }: AdminProps) {
  const { t } = useI18n();
  const ago = useAgo();
  const [range, setRange] = useState<7 | 30>(7);
  const { data: o, error, reload } = useLoad(() => api.adminOverview(range), [range], 30000);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<AdminSyncResult[] | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const users = (query: string) => adminRoute('users', { query });
  const accounts = (query: string) => adminRoute('accounts', { query });
  const kpiLink = (r: ReturnType<typeof users>) => ({ href: routePath(r), onOpen: () => navigate(r) });

  const syncAll = async (what: 'club' | 'sbc' | 'all') => {
    setBusy(what);
    setSyncError(null);
    try {
      setResults((await api.adminSync(what)).results);
      await reload();
    } catch (e) {
      setSyncError(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };

  if (!o) return error ? <p className="signin-error" role="alert">{error}</p> : <p className="muted" aria-busy="true">{t('admin.loading')}</p>;
  const k = o.kpis;
  const s = o.series;

  const attentionText = (a: AdminAttention) =>
    a.kind === 'expiring'
      ? t('admin.attention.expiring', { email: a.email, time: new Date(a.until).toLocaleDateString() })
      : t(`admin.attention.${a.kind}`, { name: a.personaName, detail: a.detail ?? '' });
  const attentionRoute = (a: AdminAttention) =>
    a.userId ? adminRoute('user', { userId: a.userId }) : accounts(`q=${a.kind === 'expiring' ? '' : a.personaId}`);

  return (
    <>
      {error && <p className="signin-error" role="alert">{error}</p>}
      <p className="muted">{t('admin.lede', { time: ago(o.at) })}</p>
      <div className="adm-kpis">
        <KpiCard label={t('admin.kpi.users')} value={k.users.total} sub={t('admin.kpi.usersNew', { n: k.users.new7d })} {...kpiLink(users(''))} />
        <KpiCard label={t('admin.kpi.active')} value={k.users.active24h} sub={t('admin.kpi.active7d', { n: k.users.active7d })} {...kpiLink(users('activity=24h'))} />
        <KpiCard label={t('admin.kpi.premium')} value={k.premium.total} sub={t('admin.kpi.expiring', { n: k.premium.expiring7d })} {...kpiLink(users('plan=premium'))} />
        <KpiCard label={t('admin.kpi.online')} value={`${k.accounts.online}/${k.accounts.total}`} sub={t('admin.kpi.unlinked', { n: k.accounts.unlinked })} {...kpiLink(accounts('state=online'))} />
        <KpiCard label={t('admin.kpi.problem')} value={k.accounts.problem} tone={k.accounts.problem ? 'bad' : undefined} sub={t('admin.kpi.problemSub')} {...kpiLink(accounts('state=problem'))} />
        <KpiCard label={t('admin.kpi.solvesToday')} value={k.solvesToday} />
        <KpiCard label={t('admin.kpi.ea')} value={k.ea.today} sub={t('admin.kpi.eaSub', { limit: k.ea.limit })} />
      </div>

      <section className="adm-card">
        <div className="adm-head">
          <h2>{t('admin.charts.title')}</h2>
          <div className="adm-range" role="group" aria-label={t('admin.charts.range')}>
            {([7, 30] as const).map((r) => (
              <button key={r} type="button" className="ghost" aria-pressed={range === r} onClick={() => setRange(r)}>
                {t('admin.charts.days', { n: r })}
              </button>
            ))}
          </div>
        </div>
        <div className="adm-grid2">
          <BarChart title={t('admin.charts.solves')} days={s.days} series={[
            { label: t('admin.charts.found'), values: s.found, tone: 'go' },
            { label: t('admin.charts.notFound'), values: s.notFound, tone: 'muted' },
          ]} />
          <BarChart title={t('admin.charts.signups')} days={s.days} series={[{ label: t('admin.charts.signups'), values: s.signups, tone: 'ink' }]} />
          <BarChart title={t('admin.charts.ea')} days={s.days} series={[{ label: t('admin.charts.ea'), values: s.eaRequests, tone: 'ink' }]} />
          <BarChart title={t('admin.charts.syncs')} days={s.days} series={[
            { label: t('admin.charts.syncOk'), values: s.syncs.map((n, i) => n - s.syncFailed[i]), tone: 'ink' },
            { label: t('admin.charts.syncFailed'), values: s.syncFailed, tone: 'bad' },
          ]} />
        </div>
      </section>

      <div className="adm-grid2">
        <section className="adm-card">
          <h2>{t('admin.attention.title', { count: o.attention.length })}</h2>
          {o.attention.length === 0 ? (
            <p className="muted">{t('admin.attention.none')}</p>
          ) : (
            <ul className="adm-list">
              {o.attention.map((a, i) => {
                const r = attentionRoute(a);
                return (
                  <li key={i}>
                    <a href={routePath(r)} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(r); }}>{attentionText(a)}</a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="adm-card">
          <h2>{t('admin.versions.title', { v: o.latestExtension })}</h2>
          <ul className="adm-list">
            {o.versions.map((v) => (
              <li key={v.version}>
                <span>{v.version === '?' ? t('admin.versions.unknown') : v.version}{!v.latest && v.version !== '?' && <small className="muted"> · {t('admin.versions.old')}</small>}{v.latest && <small> · {t('admin.versions.latest')}</small>}</span>
                <b>{v.count}</b>
              </li>
            ))}
          </ul>
          <h2>{t('admin.data.title')}</h2>
          <ul className="adm-list">
            <li><span>{t('admin.data.sets')}</span><b>{o.db.sets}</b></li>
            <li><span>{t('admin.data.challenges')}</span><b>{o.db.challenges}</b></li>
            <li><span>{t('admin.data.bricks')}</span><b>{o.db.brickReports}</b></li>
            <li><span>{t('admin.data.trusted')}</span><b>{o.db.trusted}</b></li>
            <li><span>{t('admin.data.drop')}</span><b>{ago(o.lastDrop)}</b></li>
          </ul>
        </section>
      </div>

      <section className="adm-card">
        <h2>{t('admin.sync.title')}</h2>
        <p className="muted">{t('admin.sync.lede')}</p>
        <div className="adm-actions">
          <button type="button" className="solve-sm" disabled={!!busy} onClick={() => void syncAll('all')}>
            <ArrowsClockwise aria-hidden="true" /> {busy === 'all' ? t('admin.sync.running') : t('admin.sync.all')}
          </button>
          <button type="button" className="ghost wide" disabled={!!busy} onClick={() => void syncAll('club')}>{t('admin.sync.club')}</button>
          <button type="button" className="ghost wide" disabled={!!busy} onClick={() => void syncAll('sbc')}>{t('admin.sync.sbc')}</button>
        </div>
        {syncError && <p className="signin-error" role="alert">{syncError}</p>}
        {results && (
          <p role="status">{t('admin.sync.summary', {
            queued: results.filter((r) => r.outcome === 'queued').length,
            deferred: results.filter((r) => r.outcome === 'deferred').length,
            skipped: results.filter((r) => r.outcome === 'skipped').length,
          })}</p>
        )}
      </section>
    </>
  );
}
```

Unlinked accounts in attention (no `userId`) link to the accounts table searched by personaId: fix `attentionRoute` to `accounts(\`q=${a.personaId}\`)` for the non-expiring branch without `userId` (the ternary above already does that; drop the `expiring` check inside since `expiring` always has `userId`).

- [ ] **Step 2: i18n** — keep existing keys `admin.title`, `admin.lede`, `admin.loading`, `admin.sync.*`, `admin.data.*`, `admin.versions.title/unknown/old`. Add (en):

```ts
  'admin.kpi.users': 'Users',
  'admin.kpi.usersNew': '{n} new in 7 days',
  'admin.kpi.active': 'Active 24 h',
  'admin.kpi.active7d': '{n} in 7 days',
  'admin.kpi.premium': 'Premium',
  'admin.kpi.expiring': '{n} ending within 7 days',
  'admin.kpi.online': 'EA accounts online',
  'admin.kpi.unlinked': '{n} without an owner',
  'admin.kpi.problem': 'Accounts with problems',
  'admin.kpi.problemSub': 'error, stale, paused or at the limit',
  'admin.kpi.solvesToday': 'Solves today',
  'admin.kpi.ea': 'EA requests today',
  'admin.kpi.eaSub': 'of {limit} allowed',
  'admin.charts.title': 'Activity',
  'admin.charts.range': 'Period',
  'admin.charts.days': '{n} days',
  'admin.charts.solves': 'Solves',
  'admin.charts.found': 'Found',
  'admin.charts.notFound': 'Not found',
  'admin.charts.signups': 'Sign-ups',
  'admin.charts.ea': 'EA requests',
  'admin.charts.syncs': 'Syncs',
  'admin.charts.syncOk': 'Succeeded',
  'admin.charts.syncFailed': 'Failed',
  'admin.attention.title_one': 'Needs attention ({count})',
  'admin.attention.title_other': 'Needs attention ({count})',
  'admin.attention.none': 'Nothing needs attention.',
  'admin.attention.error': '{name}: sync error ({detail})',
  'admin.attention.paused': '{name}: paused by EA throttling',
  'admin.attention.atLimit': '{name}: daily EA limit reached',
  'admin.attention.outdated': '{name}: outdated extension {detail}',
  'admin.attention.expiring': '{email}: Premium ends {time}',
  'admin.versions.latest': 'latest',
```

(ro):

```ts
  'admin.kpi.users': 'Utilizatori',
  'admin.kpi.usersNew': '{n} noi în 7 zile',
  'admin.kpi.active': 'Activi 24 h',
  'admin.kpi.active7d': '{n} în 7 zile',
  'admin.kpi.premium': 'Premium',
  'admin.kpi.expiring': '{n} expiră în 7 zile',
  'admin.kpi.online': 'Conturi EA online',
  'admin.kpi.unlinked': '{n} fără proprietar',
  'admin.kpi.problem': 'Conturi cu probleme',
  'admin.kpi.problemSub': 'eroare, vechi, în pauză sau la limită',
  'admin.kpi.solvesToday': 'Rezolvări azi',
  'admin.kpi.ea': 'Cereri EA azi',
  'admin.kpi.eaSub': 'din {limit} permise',
  'admin.charts.title': 'Activitate',
  'admin.charts.range': 'Perioadă',
  'admin.charts.days': '{n} zile',
  'admin.charts.solves': 'Rezolvări',
  'admin.charts.found': 'Găsite',
  'admin.charts.notFound': 'Negăsite',
  'admin.charts.signups': 'Înscrieri',
  'admin.charts.ea': 'Cereri EA',
  'admin.charts.syncs': 'Sincronizări',
  'admin.charts.syncOk': 'Reușite',
  'admin.charts.syncFailed': 'Eșuate',
  'admin.attention.title_one': 'Necesită atenție ({count})',
  'admin.attention.title_few': 'Necesită atenție ({count})',
  'admin.attention.title_other': 'Necesită atenție ({count})',
  'admin.attention.none': 'Nimic nu necesită atenție.',
  'admin.attention.error': '{name}: eroare la sincronizare ({detail})',
  'admin.attention.paused': '{name}: în pauză, EA a cerut încetinire',
  'admin.attention.atLimit': '{name}: limita zilnică EA atinsă',
  'admin.attention.outdated': '{name}: extensie depășită {detail}',
  'admin.attention.expiring': '{email}: Premium se termină pe {time}',
  'admin.versions.latest': 'ultima',
```

If a key already exists (e.g. `admin.kpi.users`), update it in place instead of duplicating.

- [ ] **Step 3: Verify in the browser** (`npm run dev` already running; don't kill it): open `http://localhost:5173/dashboard/admin` signed in as the admin. Check: KPIs show numbers, each linked KPI opens the right tab with the filter in the URL; 7/30 toggle changes the charts; Back returns. Then at 390px width (DevTools device mode): cards wrap, charts fit, no horizontal page scroll.

Run: `npm run typecheck && npm run i18n:check && npm run build` → PASS.

- [ ] **Step 4: Commit** — `git commit -am "feat(admin): dashboard with KPIs, charts and attention list"` (after `git add` of new files).

---

### Task 8: Users table

**Files:**
- Modify: `web/src/components/admin/UsersTable.tsx`
- Modify: `en.ts`, `ro.ts`

**Interfaces:**
- Consumes: `api.adminUsers(query)`, `AdminUserRow`, `DataTable`, `Column`, `useLoad`, `getQuery`, `setQuery`, `adminRoute`, `routePath`, `AdminProps`.
- Produces: `PlanBadge({ plan }: { plan: PlanInfo })` exported from `UsersTable.tsx` (reused by `UserDetail`).

- [ ] **Step 1: Implement**

```tsx
// Users: server-side filter / sort / paging, all in the URL query (?q&plan&activity&ea&sort&dir&page).
import { useEffect, useState } from 'react';
import { Circle, Crown } from '@phosphor-icons/react';
import { api, type AdminUserRow, type PlanInfo } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { adminRoute, routePath } from '../../route';
import type { AdminProps } from './AdminLayout';
import { DataTable, type Column } from './DataTable';
import { getQuery, setQuery } from './format';
import { useLoad } from './useLoad';

export function PlanBadge({ plan }: { plan: PlanInfo }) {
  const { t } = useI18n();
  return plan.tier === 'premium' ? (
    <span className="adm-badge premium">
      <Crown aria-hidden="true" /> {t('admin.plan.premium')}
      {plan.premiumUntil && <small>· {new Date(plan.premiumUntil).toLocaleDateString()}</small>}
    </span>
  ) : (
    <span className="adm-badge">{t('admin.plan.free')}</span>
  );
}

const FILTERS = {
  plan: ['all', 'free', 'premium', 'expiring'],
  activity: ['all', '24h', '7d', 'inactive30'],
  ea: ['all', 'with', 'without', 'problem', 'outdated'],
} as const;

export function UsersTable({ route, navigate }: AdminProps) {
  const { t } = useI18n();
  const ago = useAgo();
  const q = getQuery(route.query);
  const go = (patch: Record<string, string | number | null>) =>
    navigate(adminRoute('users', { query: setQuery(route.query, patch) }), true);
  const { data, error } = useLoad(() => api.adminUsers(route.query), [route.query]);

  // search box: typed text is local, the URL follows 300 ms after typing stops
  const [text, setText] = useState(q.q ?? '');
  useEffect(() => setText(q.q ?? ''), [q.q]);
  useEffect(() => {
    if (text === (q.q ?? '')) return;
    const id = setTimeout(() => go({ q: text.trim() || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const sort = { key: q.sort ?? 'lastSeen', dir: (q.dir as 'asc' | 'desc') ?? (q.sort === 'email' ? 'asc' : 'desc') };
  const onSort = (key: string) =>
    go({ sort: key === 'lastSeen' ? null : key, dir: sort.key === key ? (sort.dir === 'asc' ? 'desc' : 'asc') : key === 'email' ? 'asc' : 'desc' });

  const userRoute = (u: AdminUserRow) => adminRoute('user', { userId: u.id });
  const columns: Column<AdminUserRow>[] = [
    { key: 'email', label: t('admin.users.col.email'), sortable: true, primary: true, render: (u) => u.email || u.id },
    { key: 'plan', label: t('admin.users.col.plan'), render: (u) => <PlanBadge plan={u.plan} /> },
    { key: 'quota', label: t('admin.users.col.quota'), num: true, hideSm: true, render: (u) => (u.plan.quota ? `${u.plan.quota.used}/${u.plan.quota.limit}` : '—') },
    {
      key: 'accounts', label: t('admin.users.col.accounts'), render: (u) =>
        u.accounts === 0 ? <span className="muted">—</span> : (
          <span className="adm-dot">
            <Circle weight={u.online ? 'fill' : 'regular'} aria-hidden="true" />
            {t('admin.users.accounts', { count: u.accounts, n: u.accounts, online: u.online })}
          </span>
        ),
    },
    { key: 'solves7d', label: t('admin.users.col.solves'), sortable: true, num: true, hideSm: true, render: (u) => u.solves7d },
    { key: 'lastSeen', label: t('admin.users.col.seen'), sortable: true, render: (u) => ago(u.lastSeenAt) },
    { key: 'createdAt', label: t('admin.users.col.joined'), sortable: true, hideSm: true, render: (u) => new Date(u.createdAt).toLocaleDateString() },
  ];

  return (
    <>
      <div className="adm-toolbar" role="search">
        <label className="sr-only" htmlFor="adm-users-q">{t('admin.users.search')}</label>
        <input id="adm-users-q" type="search" placeholder={t('admin.users.search')} value={text} onChange={(e) => setText(e.target.value)} />
        {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((f) => (
          <label key={f}>
            <span className="sr-only">{t(`admin.users.filter.${f}`)}</span>
            <select value={q[f] ?? 'all'} onChange={(e) => go({ [f]: e.target.value })}>
              {FILTERS[f].map((v) => <option key={v} value={v}>{t(`admin.users.${f}.${v}`)}</option>)}
            </select>
          </label>
        ))}
        {route.query && <button type="button" className="ghost" onClick={() => navigate(adminRoute('users'), true)}>{t('admin.users.clear')}</button>}
      </div>
      {error && <p className="signin-error" role="alert">{error}</p>}
      <DataTable
        caption={t('admin.tab.users')}
        columns={columns}
        rows={data?.rows ?? null}
        rowKey={(u) => u.id}
        rowHref={(u) => routePath(userRoute(u))}
        onRowOpen={(u) => navigate(userRoute(u))}
        sort={sort}
        onSort={onSort}
        page={data?.page ?? 1}
        total={data?.total ?? 0}
        pageSize={data?.pageSize ?? 25}
        onPage={(p) => go({ page: p })}
        empty={t('admin.users.empty')}
        loading={!data}
      />
    </>
  );
}
```

The detail page's back link uses `history.back()` when `canGoBack()`, else `adminRoute('users')` — so the table's query is preserved through history. (`useLoad` keeps old rows visible while a new query loads; pass `loading` from `useLoad` instead of `!data` if you want the skeleton only on first load — keep `!data`.)

- [ ] **Step 2: i18n** (en):

```ts
  'admin.plan.free': 'Free',
  'admin.plan.premium': 'Premium',
  'admin.users.search': 'Search email, EA name, club or persona id',
  'admin.users.clear': 'Clear filters',
  'admin.users.empty': 'No user matches these filters.',
  'admin.users.col.email': 'Email',
  'admin.users.col.plan': 'Plan',
  'admin.users.col.quota': 'Quota',
  'admin.users.col.accounts': 'EA accounts',
  'admin.users.col.solves': 'Solves 7 d',
  'admin.users.col.seen': 'Last seen',
  'admin.users.col.joined': 'Signed up',
  'admin.users.accounts_one': '{n} account, {online} online',
  'admin.users.accounts_other': '{n} accounts, {online} online',
  'admin.users.filter.plan': 'Plan',
  'admin.users.filter.activity': 'Activity',
  'admin.users.filter.ea': 'EA accounts',
  'admin.users.plan.all': 'All plans',
  'admin.users.plan.free': 'Free',
  'admin.users.plan.premium': 'Premium',
  'admin.users.plan.expiring': 'Premium ending ≤ 7 days',
  'admin.users.activity.all': 'Any activity',
  'admin.users.activity.24h': 'Active 24 h',
  'admin.users.activity.7d': 'Active 7 days',
  'admin.users.activity.inactive30': 'Inactive 30+ days',
  'admin.users.ea.all': 'Any EA account',
  'admin.users.ea.with': 'With an EA account',
  'admin.users.ea.without': 'Without an EA account',
  'admin.users.ea.problem': 'Account with problems',
  'admin.users.ea.outdated': 'Outdated extension',
```

Plural forms are picked by the `count` param (`translate()` in `web/src/i18n.tsx:32`). (ro):

```ts
  'admin.plan.free': 'Free',
  'admin.plan.premium': 'Premium',
  'admin.users.search': 'Caută email, nume EA, club sau persona id',
  'admin.users.clear': 'Șterge filtrele',
  'admin.users.empty': 'Niciun utilizator nu se potrivește filtrelor.',
  'admin.users.col.email': 'Email',
  'admin.users.col.plan': 'Plan',
  'admin.users.col.quota': 'Cotă',
  'admin.users.col.accounts': 'Conturi EA',
  'admin.users.col.solves': 'Rezolvări 7 z',
  'admin.users.col.seen': 'Văzut',
  'admin.users.col.joined': 'Înscris',
  'admin.users.accounts_one': '{n} cont, {online} online',
  'admin.users.accounts_few': '{n} conturi, {online} online',
  'admin.users.accounts_other': '{n} de conturi, {online} online',
  'admin.users.filter.plan': 'Plan',
  'admin.users.filter.activity': 'Activitate',
  'admin.users.filter.ea': 'Conturi EA',
  'admin.users.plan.all': 'Toate planurile',
  'admin.users.plan.free': 'Free',
  'admin.users.plan.premium': 'Premium',
  'admin.users.plan.expiring': 'Premium expiră ≤ 7 zile',
  'admin.users.activity.all': 'Orice activitate',
  'admin.users.activity.24h': 'Activi 24 h',
  'admin.users.activity.7d': 'Activi 7 zile',
  'admin.users.activity.inactive30': 'Inactivi 30+ zile',
  'admin.users.ea.all': 'Orice cont EA',
  'admin.users.ea.with': 'Cu cont EA',
  'admin.users.ea.without': 'Fără cont EA',
  'admin.users.ea.problem': 'Cont cu probleme',
  'admin.users.ea.outdated': 'Extensie depășită',
```

- [ ] **Step 3: Verify in browser**: `/dashboard/admin/users` shows 4 rows; each filter updates the URL (replace, no history spam) and the rows; typing in search updates after a pause; `?page=99` shows the last page; header click toggles sort with arrow and `aria-sort`; row click and Enter on the email link open the detail; ctrl+click opens a new tab. 390px: stacked rows, no horizontal scroll.

Run: `npm run typecheck && npm run i18n:check && npm run build` → PASS.

- [ ] **Step 4: Commit** — `feat(admin): users table with filters, sort and paging`.

---

### Task 9: User detail page

**Files:**
- Create: `web/src/components/admin/AccountCard.tsx`
- Modify: `web/src/components/admin/UserDetail.tsx`
- Modify: `en.ts`, `ro.ts`

**Interfaces:**
- Consumes: `api.adminUser`, `api.adminUserEvents`, `api.adminPlan`, `api.adminQuotaReset`, `api.adminSync`, `api.adminTrust`, `AdminUserDetail`, `AdminAccount`, `AdminEvent`, `PlanBadge`, `BarChart`, `DataTable`, `useLoad`, `untilEndOfDay`, `canGoBack`.
- Produces: `AccountCard({ acc, latest, onChanged, extra })` where `acc: AdminAccount`, `latest: string`, `onChanged: () => void`, `extra?: ReactNode` (reused by Task 10).

- [ ] **Step 1: `AccountCard.tsx`** — port `AccountRow` from the old `AdminView.tsx` (git show `HEAD~N:web/src/components/AdminView.tsx`, the `AccountRow` function, lines ~200–332) into a card that owns its actions:

```tsx
// One EA account: identity, freshness, EA usage and the admin actions (sync, trust).
import { useState, type ReactNode } from 'react';
import { ArrowsClockwise, CheckCircle, Circle, ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { api, type AdminAccount, type AdminSyncResult } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { errorText } from '../../messages';

export function AccountCard({ acc, latest, onChanged, extra }: { acc: AdminAccount; latest: string; onChanged: () => void; extra?: ReactNode }) {
  const { t } = useI18n();
  const ago = useAgo();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (key: string, fn: () => Promise<string | null>) => {
    setBusy(key);
    setMsg(null);
    try {
      setMsg(await fn());
      onChanged();
    } catch (e) {
      setMsg(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };
  const syncText = (r: AdminSyncResult | undefined) =>
    !r ? null : r.outcome === 'skipped' ? t(`err.${r.code}`, r.params) : t(`admin.account.sync.${r.outcome}`);
  const sync = (what: 'club' | 'sbc' | 'all') => act(`sync:${what}`, async () => syncText((await api.adminSync(what, [acc.personaId])).results[0]));
  const outdated = !acc.extVersion || acc.extVersion !== latest;
  const fresh = (at: number | null, stale: boolean, label: string) => (
    <span className="adm-dot">
      {stale ? <WarningCircle className="adm-bad" aria-hidden="true" /> : <CheckCircle aria-hidden="true" />}
      {label}: {ago(at)} {stale && <small>({t('admin.account.stale')})</small>}
    </span>
  );
  return (
    <article className="adm-card">
      <header className="adm-head">
        <div>
          <h3>{acc.personaName} {acc.trusted && <span className="adm-badge"><ShieldCheck aria-hidden="true" /> {t('admin.trusted')}</span>}</h3>
          <small className="muted">{acc.clubName} · {acc.personaId}</small>
        </div>
        <span className="adm-dot">
          <Circle weight={acc.online ? 'fill' : 'regular'} aria-hidden="true" /> {acc.online ? t('admin.account.online') : t('admin.account.offline')}
        </span>
      </header>
      <dl className="adm-dl">
        <dt>{t('admin.account.mode')}</dt><dd>{t(`admin.account.mode.${acc.mode}`)}</dd>
        <dt>{t('admin.account.ext')}</dt><dd>{acc.extVersion ?? '?'} {outdated && <span className="adm-badge bad">{t('admin.versions.old')}</span>}</dd>
        <dt>{t('admin.account.club')}</dt><dd>{fresh(acc.clubAt, acc.clubStale, t('admin.account.players', { n: acc.players }))}</dd>
        <dt>{t('admin.account.sbcs')}</dt><dd>{fresh(acc.sbcAt, acc.sbcStale, t('admin.account.sbcList'))}</dd>
        <dt>{t('admin.account.ea')}</dt>
        <dd>
          {acc.ea.today}/{acc.ea.limit} · {t('admin.account.clubSyncs', { used: acc.clubSyncs.used, limit: acc.clubSyncs.limit })}
          {acc.ea.pausedUntil && <span className="adm-badge bad">{t('admin.account.paused')}</span>}
        </dd>
        {acc.running && (<><dt>{t('admin.account.running')}</dt><dd>{acc.running}</dd></>)}
        {acc.error && (<><dt>{t('admin.account.error')}</dt><dd className="adm-bad">{acc.error}</dd></>)}
        {acc.forced && (<><dt>{t('admin.account.forced')}</dt><dd>{[acc.forced.club && 'club', acc.forced.sbc && 'sbc'].filter(Boolean).join(', ')}</dd></>)}
        {extra}
      </dl>
      <div className="adm-actions">
        {(['all', 'club', 'sbc'] as const).map((w) => (
          <button key={w} type="button" className={w === 'all' ? 'solve-sm' : 'ghost wide'} disabled={!!busy} onClick={() => void sync(w)}>
            <ArrowsClockwise aria-hidden="true" /> {t(`admin.sync.${w}`)}
          </button>
        ))}
        <button type="button" className="ghost wide" disabled={!!busy} onClick={() => void act('trust', async () => (await api.adminTrust(acc.personaId, !acc.trusted), null))}>
          <ShieldCheck aria-hidden="true" /> {acc.trusted ? t('admin.untrust') : t('admin.trust')}
        </button>
      </div>
      {msg && <p role="status" className="muted">{msg}</p>}
    </article>
  );
}
```

Reuse existing `admin.trust`, `admin.untrust`, `admin.trusted`, `admin.sync.all/club/sbc`, `admin.versions.old` keys if present (check `en.ts` around L418+); add the missing ones in Step 3. Use `isOutdated`-equivalent: `extVersion` newer-than-latest is impossible, so `!==` is fine.

- [ ] **Step 2: `UserDetail.tsx`**

```tsx
// One user: plan + quota controls, their EA accounts, solves per day and the event log.
import { useEffect, useState } from 'react';
import { ArrowLeft, Copy } from '@phosphor-icons/react';
import { api, type AdminEvent } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { errorText } from '../../messages';
import { adminRoute, canGoBack, routePath } from '../../route';
import { AccountCard } from './AccountCard';
import type { AdminProps } from './AdminLayout';
import { BarChart } from './BarChart';
import { DataTable, type Column } from './DataTable';
import { untilEndOfDay } from './format';
import { PlanBadge } from './UsersTable';
import { useLoad } from './useLoad';

const dateInput = (ts: number | null) => (ts ? new Date(ts - new Date(ts).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '');

export function UserDetail({ route, navigate }: AdminProps) {
  const { t } = useI18n();
  const ago = useAgo();
  const id = route.userId ?? '';
  const { data: d, error, reload } = useLoad(() => api.adminUser(id), [id]);
  const [evPage, setEvPage] = useState(1);
  const ev = useLoad(() => api.adminUserEvents(id, evPage), [id, evPage]);
  const [tier, setTier] = useState<'free' | 'premium'>('free');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!d) return;
    setTier(d.planSet);
    setUntil(dateInput(d.plan.premiumUntil));
  }, [d]);

  const back = () => (canGoBack() ? history.back() : navigate(adminRoute('users')));
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      setMsg(t('admin.user.saved'));
      await reload();
    } catch (e) {
      setMsg(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };

  if (!d)
    return (
      <>
        <a className="adm-back" href={routePath(adminRoute('users'))} onClick={(e) => (e.preventDefault(), back())}><ArrowLeft aria-hidden="true" /> {t('admin.user.back')}</a>
        {error ? <p className="signin-error" role="alert">{error}</p> : <p className="muted" aria-busy="true">{t('admin.loading')}</p>}
      </>
    );

  const eventText = (e: AdminEvent) => {
    const x = e.data as Record<string, string | number | boolean>;
    if (e.type === 'solve') return t(x.found ? 'admin.event.solveFound' : 'admin.event.solveMiss', { set: x.setId, ch: x.challengeId });
    if (e.type === 'sync') return t(x.ok ? 'admin.event.syncOk' : 'admin.event.syncFail', { what: String(x.what), error: String(x.error ?? '') });
    if (e.type === 'ea_error') return t('admin.event.throttle');
    return t('admin.event.eaDay', { day: String(x.day), n: Number(x.count) });
  };
  const evCols: Column<AdminEvent>[] = [
    { key: 'at', label: t('admin.event.when'), render: (e) => <time dateTime={new Date(e.at).toISOString()} title={new Date(e.at).toLocaleString()}>{ago(e.at)}</time> },
    { key: 'what', label: t('admin.event.what'), render: eventText },
    { key: 'persona', label: t('admin.event.account'), hideSm: true, render: (e) => d.accounts.find((a) => a.personaId === e.personaId)?.personaName ?? e.personaId ?? '—' },
  ];

  return (
    <>
      <a className="adm-back" href={routePath(adminRoute('users'))} onClick={(e) => (e.preventDefault(), back())}><ArrowLeft aria-hidden="true" /> {t('admin.user.back')}</a>
      <section className="adm-card">
        <header className="adm-head">
          <div>
            <h2>{d.user.email || d.user.id} {d.user.admin && <span className="adm-badge">{t('admin.user.admin')}</span>}</h2>
            <small className="muted">
              {d.user.id}{' '}
              <button type="button" className="ghost" aria-label={t('admin.user.copyId')} onClick={() => void navigator.clipboard.writeText(d.user.id)}><Copy aria-hidden="true" /></button>
            </small>
          </div>
          <PlanBadge plan={d.plan} />
        </header>
        <dl className="adm-dl">
          <dt>{t('admin.users.col.joined')}</dt><dd>{new Date(d.user.createdAt).toLocaleString()}</dd>
          <dt>{t('admin.users.col.seen')}</dt><dd>{ago(d.user.lastSeenAt)}</dd>
        </dl>
      </section>

      <section className="adm-card">
        <h2>{t('admin.user.planTitle')}</h2>
        <div className="adm-actions">
          <label>{t('admin.users.col.plan')}{' '}
            <select value={tier} onChange={(e) => setTier(e.target.value as 'free' | 'premium')}>
              <option value="free">{t('admin.plan.free')}</option>
              <option value="premium">{t('admin.plan.premium')}</option>
            </select>
          </label>
          {tier === 'premium' && (
            <label>{t('admin.plan.until')}{' '}<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
          )}
          <button type="button" className="solve-sm" disabled={!!busy} onClick={() => void act('plan', () => api.adminPlan(id, tier, tier === 'premium' ? untilEndOfDay(until) : null))}>
            {t('admin.user.savePlan')}
          </button>
        </div>
        {d.plan.quota ? (
          <p>
            {t('admin.user.quota', { used: d.plan.quota.used, limit: d.plan.quota.limit })}
            {d.plan.quota.resetsAt && ` · ${t('admin.user.resets', { time: new Date(d.plan.quota.resetsAt).toLocaleString() })}`}{' '}
            <button type="button" className="ghost wide" disabled={!!busy || d.plan.quota.used === 0} onClick={() => void act('quota', () => api.adminQuotaReset(id))}>
              {t('admin.user.resetQuota')}
            </button>
          </p>
        ) : (
          <p className="muted">{t('admin.user.unlimited')}</p>
        )}
        {msg && <p role="status" className="muted">{msg}</p>}
      </section>

      <section className="adm-grid2">
        {d.accounts.length === 0 && d.missing.length === 0 && <p className="muted">{t('admin.user.noAccounts')}</p>}
        {d.accounts.map((a) => (
          <AccountCard key={a.personaId} acc={a} latest={d.latestExtension} onChanged={() => void reload()} extra={
            <>
              <dt>{t('admin.account.linked')}</dt><dd>{new Date(a.linkedAt).toLocaleDateString()}</dd>
              {a.previousUserId && (<><dt>{t('admin.account.previous')}</dt><dd>{a.previousUserId}</dd></>)}
            </>
          } />
        ))}
        {d.missing.map((pid) => <p key={pid} className="muted">{t('admin.user.missing', { id: pid })}</p>)}
      </section>

      <section className="adm-card">
        <BarChart title={t('admin.user.solves30')} days={d.solves.days} series={[
          { label: t('admin.charts.found'), values: d.solves.found, tone: 'go' },
          { label: t('admin.charts.notFound'), values: d.solves.notFound, tone: 'muted' },
        ]} />
      </section>

      <section>
        <h2>{t('admin.user.events')}</h2>
        {ev.error && <p className="signin-error" role="alert">{ev.error}</p>}
        <DataTable caption={t('admin.user.events')} columns={evCols} rows={ev.data?.rows ?? null} rowKey={(e) => e.id}
          page={ev.data?.page ?? 1} total={ev.data?.total ?? 0} pageSize={ev.data?.pageSize ?? 25} onPage={setEvPage}
          empty={t('admin.user.noEvents')} loading={!ev.data} />
      </section>
    </>
  );
}
```

The events page lives in component state, not the URL (a detail sub-list; spec only requires table filters in the URL).

- [ ] **Step 3: i18n** (en; skip any that already exist, update wording if different):

```ts
  'admin.trust': 'Trust',
  'admin.untrust': 'Untrust',
  'admin.trusted': 'Trusted',
  'admin.plan.until': 'until',
  'admin.user.back': 'All users',
  'admin.user.admin': 'Admin',
  'admin.user.copyId': 'Copy user id',
  'admin.user.planTitle': 'Plan and quota',
  'admin.user.savePlan': 'Save plan',
  'admin.user.saved': 'Saved.',
  'admin.user.quota': '{used}/{limit} solves this week',
  'admin.user.resets': 'resets {time}',
  'admin.user.resetQuota': 'Reset quota',
  'admin.user.unlimited': 'Unlimited solves.',
  'admin.user.noAccounts': 'No EA account linked yet.',
  'admin.user.missing': 'EA account {id} is linked but not cached on this server.',
  'admin.user.solves30': 'Solves, last 30 days',
  'admin.user.events': 'Activity',
  'admin.user.noEvents': 'No activity recorded yet.',
  'admin.account.online': 'Online',
  'admin.account.offline': 'Offline',
  'admin.account.mode': 'Mode',
  'admin.account.mode.client': 'extension (web app tab)',
  'admin.account.mode.legacy': 'legacy (server session)',
  'admin.account.ext': 'Extension',
  'admin.account.club': 'Club',
  'admin.account.players': '{n} players',
  'admin.account.sbcs': 'SBCs',
  'admin.account.sbcList': 'SBC list',
  'admin.account.stale': 'before the last drop',
  'admin.account.ea': 'EA today',
  'admin.account.clubSyncs': 'club syncs {used}/{limit}',
  'admin.account.paused': 'Paused',
  'admin.account.running': 'Running',
  'admin.account.error': 'Last error',
  'admin.account.forced': 'Sync waiting for next visit',
  'admin.account.linked': 'Linked',
  'admin.account.previous': 'Previous owner',
  'admin.account.sync.queued': 'Sync started.',
  'admin.account.sync.deferred': 'Offline: syncs on the next web app visit.',
  'admin.event.when': 'When',
  'admin.event.what': 'What',
  'admin.event.account': 'EA account',
  'admin.event.solveFound': 'Solved set {set}, challenge {ch}: found',
  'admin.event.solveMiss': 'Solved set {set}, challenge {ch}: not found',
  'admin.event.syncOk': 'Synced {what}',
  'admin.event.syncFail': 'Sync {what} failed: {error}',
  'admin.event.throttle': 'EA asked to slow down (paused 15 min)',
  'admin.event.eaDay': '{n} EA requests on {day}',
```

(ro):

```ts
  'admin.trust': 'De încredere',
  'admin.untrust': 'Scoate încrederea',
  'admin.trusted': 'De încredere',
  'admin.plan.until': 'până la',
  'admin.user.back': 'Toți utilizatorii',
  'admin.user.admin': 'Admin',
  'admin.user.copyId': 'Copiază id-ul',
  'admin.user.planTitle': 'Plan și cotă',
  'admin.user.savePlan': 'Salvează planul',
  'admin.user.saved': 'Salvat.',
  'admin.user.quota': '{used}/{limit} rezolvări săptămâna asta',
  'admin.user.resets': 'se resetează {time}',
  'admin.user.resetQuota': 'Resetează cota',
  'admin.user.unlimited': 'Rezolvări nelimitate.',
  'admin.user.noAccounts': 'Niciun cont EA legat încă.',
  'admin.user.missing': 'Contul EA {id} e legat, dar nu e în cache pe acest server.',
  'admin.user.solves30': 'Rezolvări, ultimele 30 de zile',
  'admin.user.events': 'Activitate',
  'admin.user.noEvents': 'Nicio activitate înregistrată încă.',
  'admin.account.online': 'Online',
  'admin.account.offline': 'Offline',
  'admin.account.mode': 'Mod',
  'admin.account.mode.client': 'extensie (tab web app)',
  'admin.account.mode.legacy': 'vechi (sesiune pe server)',
  'admin.account.ext': 'Extensie',
  'admin.account.club': 'Club',
  'admin.account.players': '{n} jucători',
  'admin.account.sbcs': 'SBC-uri',
  'admin.account.sbcList': 'lista SBC',
  'admin.account.stale': 'dinainte de ultimul drop',
  'admin.account.ea': 'EA azi',
  'admin.account.clubSyncs': 'sincronizări club {used}/{limit}',
  'admin.account.paused': 'În pauză',
  'admin.account.running': 'Rulează',
  'admin.account.error': 'Ultima eroare',
  'admin.account.forced': 'Sincronizare la următoarea vizită',
  'admin.account.linked': 'Legat',
  'admin.account.previous': 'Proprietar anterior',
  'admin.account.sync.queued': 'Sincronizare pornită.',
  'admin.account.sync.deferred': 'Offline: se sincronizează la următoarea vizită în web app.',
  'admin.event.when': 'Când',
  'admin.event.what': 'Ce',
  'admin.event.account': 'Cont EA',
  'admin.event.solveFound': 'Rezolvare set {set}, provocare {ch}: găsit',
  'admin.event.solveMiss': 'Rezolvare set {set}, provocare {ch}: negăsit',
  'admin.event.syncOk': 'Sincronizat {what}',
  'admin.event.syncFail': 'Sincronizare {what} eșuată: {error}',
  'admin.event.throttle': 'EA a cerut încetinire (pauză 15 min)',
  'admin.event.eaDay': '{n} cereri EA pe {day}',
```

`admin.account.players` with a count may need plural forms (`_one/_few/_other`) per `ro.ts` rules; if `i18n:check` flags it, split into plural keys with `count`.

- [ ] **Step 4: Verify in browser**: open a user from the table; header, plan select + date + save (then Free → Premium → reload shows badge); reset quota on the Free user with used > 0; account card sync buttons show a status line; trust toggles the badge; chart and events render (at least your own solve from Task 1); back link returns to the filtered table. `/dashboard/admin/users/nope` shows the translated "unknown user" error (check `errorText` falls back to message; add `err.unknownUser`? The 404 body has no `msgCode` → shows the raw English `unknown user`; acceptable for admin-only). 390px check.

Run: `npm run typecheck && npm run i18n:check && npm run build` → PASS.

- [ ] **Step 5: Commit** — `feat(admin): user detail with plan, accounts, chart and activity`.

---

### Task 10: EA accounts table + cleanup

**Files:**
- Modify: `web/src/components/admin/AccountsTable.tsx`
- Modify: `en.ts`, `ro.ts` (add keys; remove old `admin.*` keys nothing uses)
- Modify: `docs/architecture.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: `api.adminAccounts`, `AdminAccountRow`, `DataTable`, `AccountCard`, `useLoad`, `getQuery`, `setQuery`.

- [ ] **Step 1: Implement**

```tsx
// All EA accounts on this server (linked or not): filter / sort / page in the URL; unlinked rows expand in place.
import { useEffect, useState } from 'react';
import { Circle } from '@phosphor-icons/react';
import { api, type AdminAccountRow } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { adminRoute, routePath } from '../../route';
import { AccountCard } from './AccountCard';
import type { AdminProps } from './AdminLayout';
import { DataTable, type Column } from './DataTable';
import { getQuery, setQuery } from './format';
import { useLoad } from './useLoad';

const STATES = ['all', 'online', 'problem', 'outdated', 'unlinked', 'trusted'] as const;

export function AccountsTable({ route, navigate }: AdminProps) {
  const { t } = useI18n();
  const ago = useAgo();
  const q = getQuery(route.query);
  const go = (patch: Record<string, string | number | null>) => navigate(adminRoute('accounts', { query: setQuery(route.query, patch) }), true);
  const { data, error, reload } = useLoad(() => api.adminAccounts(route.query), [route.query], 30000);
  const [open, setOpen] = useState<number | null>(null);
  const [text, setText] = useState(q.q ?? '');
  useEffect(() => setText(q.q ?? ''), [q.q]);
  useEffect(() => {
    if (text === (q.q ?? '')) return;
    const id = setTimeout(() => go({ q: text.trim() || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const sort = { key: q.sort ?? 'name', dir: (q.dir as 'asc' | 'desc') ?? 'asc' };
  const onSort = (key: string) => go({ sort: key === 'name' ? null : key, dir: sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' });
  const openRow = (a: AdminAccountRow) => (a.ownerId ? navigate(adminRoute('user', { userId: a.ownerId })) : setOpen(open === a.personaId ? null : a.personaId));

  const columns: Column<AdminAccountRow>[] = [
    { key: 'name', label: t('admin.accounts.col.persona'), sortable: true, primary: true, render: (a) => a.personaName },
    { key: 'club', label: t('admin.accounts.col.club'), hideSm: true, render: (a) => a.clubName },
    { key: 'owner', label: t('admin.accounts.col.owner'), render: (a) => a.ownerEmail ?? <span className="adm-badge">{t('admin.accounts.unlinked')}</span> },
    { key: 'ext', label: t('admin.account.ext'), hideSm: true, render: (a) => a.extVersion ?? '?' },
    { key: 'online', label: t('admin.accounts.col.state'), render: (a) => (
      <span className="adm-dot"><Circle weight={a.online ? 'fill' : 'regular'} aria-hidden="true" />{a.online ? t('admin.account.online') : t('admin.account.offline')}{a.error && <span className="adm-badge bad">{t('admin.accounts.error')}</span>}</span>
    ) },
    { key: 'clubAt', label: t('admin.account.club'), sortable: true, hideSm: true, render: (a) => ago(a.clubAt) },
    { key: 'sbcAt', label: t('admin.account.sbcs'), sortable: true, hideSm: true, render: (a) => ago(a.sbcAt) },
    { key: 'eaToday', label: t('admin.account.ea'), sortable: true, num: true, render: (a) => `${a.ea.today}/${a.ea.limit}` },
  ];

  const expanded = data?.rows.find((a) => a.personaId === open && !a.ownerId);
  return (
    <>
      <div className="adm-toolbar" role="search">
        <label className="sr-only" htmlFor="adm-acc-q">{t('admin.accounts.search')}</label>
        <input id="adm-acc-q" type="search" placeholder={t('admin.accounts.search')} value={text} onChange={(e) => setText(e.target.value)} />
        <label>
          <span className="sr-only">{t('admin.accounts.filter')}</span>
          <select value={q.state ?? 'all'} onChange={(e) => go({ state: e.target.value })}>
            {STATES.map((s) => <option key={s} value={s}>{t(`admin.accounts.state.${s}`)}</option>)}
          </select>
        </label>
        {route.query && <button type="button" className="ghost" onClick={() => navigate(adminRoute('accounts'), true)}>{t('admin.users.clear')}</button>}
      </div>
      {error && <p className="signin-error" role="alert">{error}</p>}
      <DataTable caption={t('admin.tab.accounts')} columns={columns} rows={data?.rows ?? null} rowKey={(a) => a.personaId}
        rowHref={(a) => (a.ownerId ? routePath(adminRoute('user', { userId: a.ownerId })) : `#acc-${a.personaId}`)}
        onRowOpen={openRow} sort={sort} onSort={onSort}
        page={data?.page ?? 1} total={data?.total ?? 0} pageSize={data?.pageSize ?? 25} onPage={(p) => go({ page: p })}
        empty={t('admin.accounts.empty')} loading={!data} />
      {expanded && data && (
        <div id={`acc-${expanded.personaId}`}>
          <AccountCard acc={expanded} latest={data.latestExtension} onChanged={() => void reload()} />
        </div>
      )}
    </>
  );
}
```

Spec said unlinked rows "expand inline"; rendering the card right under the table (anchored, scrolled into view) is the pragmatic version — add `useEffect(() => { if (expanded) document.getElementById(\`acc-${expanded.personaId}\`)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }); }, [expanded?.personaId]);`.

- [ ] **Step 2: i18n** (en):

```ts
  'admin.accounts.search': 'Search EA name, club, persona id or owner email',
  'admin.accounts.filter': 'State',
  'admin.accounts.empty': 'No EA account matches these filters.',
  'admin.accounts.unlinked': 'no owner',
  'admin.accounts.error': 'error',
  'admin.accounts.col.persona': 'EA account',
  'admin.accounts.col.club': 'Club',
  'admin.accounts.col.owner': 'Owner',
  'admin.accounts.col.state': 'State',
  'admin.accounts.state.all': 'All accounts',
  'admin.accounts.state.online': 'Online',
  'admin.accounts.state.problem': 'With problems',
  'admin.accounts.state.outdated': 'Outdated extension',
  'admin.accounts.state.unlinked': 'Without an owner',
  'admin.accounts.state.trusted': 'Trusted',
```

(ro):

```ts
  'admin.accounts.search': 'Caută nume EA, club, persona id sau emailul proprietarului',
  'admin.accounts.filter': 'Stare',
  'admin.accounts.empty': 'Niciun cont EA nu se potrivește filtrelor.',
  'admin.accounts.unlinked': 'fără proprietar',
  'admin.accounts.error': 'eroare',
  'admin.accounts.col.persona': 'Cont EA',
  'admin.accounts.col.club': 'Club',
  'admin.accounts.col.owner': 'Proprietar',
  'admin.accounts.col.state': 'Stare',
  'admin.accounts.state.all': 'Toate conturile',
  'admin.accounts.state.online': 'Online',
  'admin.accounts.state.problem': 'Cu probleme',
  'admin.accounts.state.outdated': 'Extensie depășită',
  'admin.accounts.state.unlinked': 'Fără proprietar',
  'admin.accounts.state.trusted': 'De încredere',
```

Then remove every `admin.*` key from `en.ts` + `ro.ts` that no file references any more:

Run: `for k in $(grep -o "'admin\.[^']*'" web/src/locales/en.ts | tr -d "'" | sed 's/_\(one\|few\|other\)$//' | sort -u); do grep -rq "'$k" web/src/components web/src/App.tsx || grep -rq "admin.attention.\${\|admin.users.\${\|admin.accounts.state.\${\|admin.account.mode.\${\|admin.account.sync.\${\|admin.sync.\${\|admin.tab" web/src/components/admin || echo $k; done`
Review the list by hand (dynamic keys like `admin.users.plan.${v}` are built from template strings) and delete only keys that are truly dead.

- [ ] **Step 3: Docs** — `docs/architecture.md`: add a short "Admin history" paragraph (events table, what writes it, 180-day prune, EA per-day via `ea_day` max-dedup). `CLAUDE.md` Layout: replace `` `admin.ts` `` mentions (if any) and add: server `admin/` (admin panel API: `query.ts` pure filters/paging/day keys, `users.ts`, `accounts.ts`, `overview.ts`, `routes.ts`), `db/events.ts` history; web `components/admin/` admin panel (tabs, `DataTable`, SVG `BarChart`).

- [ ] **Step 4: Full verification**

Run: `npm run typecheck && npm test && npm run i18n:check && npm run build`
Expected: all PASS; paste the tail of each output in the report.
Browser (dev server running): every tab at desktop and 390px; accounts filter `unlinked` expands a card; `owner` rows open the user; Back/Forward walk tabs and filters; Romanian language switch shows every admin string translated; keyboard: Tab through tabs, sort buttons, row links, pager; no console errors; `[csp]` log shows nothing new.

- [ ] **Step 5: Commit**

```bash
git pull --rebase
git add -A web/src docs CLAUDE.md
git commit -m "feat(admin): EA accounts table, drop old admin strings, docs"
```

---

## Self-review notes

- Spec coverage: routes (T5), overview KPIs/charts/attention/versions (T4, T7), users table columns/sort/filters/page (T2, T4, T8), user detail sections (T4, T9), accounts table (T3, T4, T10), events table + writers + prune (T1), API + docs (T4), removal of `/api/admin/stats` (T4), tests (T2, T5, T6), i18n (T6–T10), 390px (T7–T10). Kept from the old screen though the spec didn't list them: sync-everyone buttons and DB counts (T7) so no admin capability is lost.
- The spec's `ea_error` row is aligned in T1 Step 7.
