# Free and Premium Plans Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two account plans set by the admin: Free (20 found solves per rolling 7-day window, no global solver settings) and Premium (unlimited + global settings), enforced by the server and explained on the site.

**Architecture:** Four new columns on `users` hold the plan and the quota window. Pure rules live in `server/plan.ts` (unit-tested); DB reads/writes in `server/db/users.ts` and `server/plans.ts`. `/api/solve` checks the quota before the solver and counts a token after a `found: true` result; `/api/me` and the solve response carry the plan/quota so the site can show a counter, lock the global settings and explain the system.

**Tech Stack:** Fastify 5 + Drizzle (Postgres) on Node 24 / `tsx`; React 19 + Vite 8, plain CSS; `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-24-free-premium-plans-design.md`

## Global Constraints

- Start from `dev`, `git pull` first. Commits: `git pull --rebase`, then `type(scope): subject`, ending with the Co-Authored-By line. Never push.
- DB value is `'free' | 'premium'`. User-facing name is **Premium** everywhere (the landing page's existing "Pro" is renamed to "Premium").
- Limit: `FREE_WEEKLY_SOLVES` in `.env`, default `20`. Window length: 7 days.
- Only a solve whose result is `found: true` costs a token; every solver run counts the same (Solve, Cheaper/deep, storage retry, exclude-and-resolve).
- Admins (`ADMIN_EMAILS`) are always Premium. `premium_until` in the past = Free.
- Global settings lock is UI-only (site sends merged options).
- Every string via `t()` with keys in `web/src/locales/en.ts` and `ro.ts` (Romanian plurals `_one`/`_few`/`_other`); `npm run i18n:check` must pass.
- New endpoint / payload change → `docs/api.md`.
- UI: `--go` green only for primary action / met / selected; controls 8px radius, containers 14px; state never by color alone; check 390px width.
- Verification per task: `npm test`, `npm run typecheck`; UI tasks also `npm run build` and a browser check (dev server `npm run dev` is already running, don't kill it).

## Review Focus

1. A user whose `premium_until` passes mid-week keeps the quota they already used this window (no free reset from the plan change) — pinned in Task 1 (`quotaState` ignores the plan) and Task 2 (`setPlan` does not touch quota columns).
2. Quota exhausted while the set screen is open: every solve action (Solve, Cheaper, storage retry, exclude-and-resolve from PlayerPanel) must be blocked, not just the main button — Task 5.
3. A free user who had global settings saved in `localStorage` must get `DEFAULT_OPTIONS` from both the solve path and the "per-SBC settings" starting point, and the Club screen's global exclude must not silently keep working — Task 4.
4. Window boundary: a solve exactly at `start + 7d` starts a new window (`used = 1`), not `used = 21` — Task 1 test + Task 2 SQL uses the same `<=` cutoff.
5. `resetsAt` in days: "resets in 3d 4h", not "76 h 12 min" — Task 5 `untilText` test.

---

### Task 1: Pure plan rules

**Files:**
- Create: `server/plan.ts`
- Test: `server/plan.test.ts`

**Interfaces:**
- Produces:
  - `type Tier = 'free' | 'premium'`
  - `const WEEK_MS: number` (7 days)
  - `interface PlanRow { plan: string; premiumUntil: Date | null; quotaStart: Date | null; quotaUsed: number }`
  - `interface Quota { used: number; limit: number; resetsAt: number | null }`
  - `effectivePlan(row: PlanRow, admin: boolean, now: number): Tier`
  - `quotaState(row: PlanRow, limit: number, now: number): Quota`
  - `weeklyLimit(raw: string | undefined): number` (parses env, default 20, positive integers only)

- [ ] **Step 1: Write the failing test** — `server/plan.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEEK_MS, effectivePlan, quotaState, weeklyLimit, type PlanRow } from './plan.js';

const NOW = Date.UTC(2026, 8, 24, 12);
const row = (p: Partial<PlanRow> = {}): PlanRow => ({ plan: 'free', premiumUntil: null, quotaStart: null, quotaUsed: 0, ...p });

test('effectivePlan', () => {
  assert.equal(effectivePlan(row(), false, NOW), 'free');
  assert.equal(effectivePlan(row(), true, NOW), 'premium'); // admins
  assert.equal(effectivePlan(row({ plan: 'premium' }), false, NOW), 'premium'); // no end date
  assert.equal(effectivePlan(row({ plan: 'premium', premiumUntil: new Date(NOW + 1000) }), false, NOW), 'premium');
  assert.equal(effectivePlan(row({ plan: 'premium', premiumUntil: new Date(NOW) }), false, NOW), 'free'); // ended
  assert.equal(effectivePlan(row({ plan: 'bogus' }), false, NOW), 'free');
});

test('quotaState: no window yet', () => {
  assert.deepEqual(quotaState(row(), 20, NOW), { used: 0, limit: 20, resetsAt: null });
});

test('quotaState: open window', () => {
  const start = new Date(NOW - 2 * 24 * 3600e3);
  assert.deepEqual(quotaState(row({ quotaStart: start, quotaUsed: 12 }), 20, NOW), { used: 12, limit: 20, resetsAt: start.getTime() + WEEK_MS });
});

test('quotaState: window ends exactly at start + 7 days', () => {
  const start = new Date(NOW - WEEK_MS);
  assert.deepEqual(quotaState(row({ quotaStart: start, quotaUsed: 20 }), 20, NOW), { used: 0, limit: 20, resetsAt: null });
  assert.equal(quotaState(row({ quotaStart: new Date(NOW - WEEK_MS + 1), quotaUsed: 20 }), 20, NOW).used, 20);
});

test('quotaState ignores the plan (ending Premium does not refill the week)', () => {
  const start = new Date(NOW - 3600e3);
  assert.equal(quotaState(row({ plan: 'premium', quotaStart: start, quotaUsed: 7 }), 20, NOW).used, 7);
});

test('weeklyLimit', () => {
  assert.equal(weeklyLimit(undefined), 20);
  assert.equal(weeklyLimit(''), 20);
  assert.equal(weeklyLimit('15'), 15);
  assert.equal(weeklyLimit('0'), 20);
  assert.equal(weeklyLimit('abc'), 20);
});
```

- [ ] **Step 2: Run it, expect FAIL** — `node --import tsx --test server/plan.test.ts` → "Cannot find module './plan.js'".

- [ ] **Step 3: Implement** — `server/plan.ts`

```ts
// Free and Premium plans: which one a user is on and how much of the weekly solve quota is left.
// Pure rules; the rows come from server/db/users.ts, the admin flag from server/admin.ts.

export type Tier = 'free' | 'premium';
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface PlanRow {
  plan: string;
  premiumUntil: Date | null;
  quotaStart: Date | null;
  quotaUsed: number;
}

export interface Quota {
  used: number;
  limit: number;
  /** when the current window ends; null while no window is open */
  resetsAt: number | null;
}

/** Admins are always Premium; a Premium end date in the past falls back to Free. */
export function effectivePlan(row: PlanRow, admin: boolean, now: number): Tier {
  if (admin) return 'premium';
  if (row.plan !== 'premium') return 'free';
  return !row.premiumUntil || row.premiumUntil.getTime() > now ? 'premium' : 'free';
}

/** The window opens on the first counted solve and closes 7 days later (Claude-style). */
export function quotaState(row: PlanRow, limit: number, now: number): Quota {
  const start = row.quotaStart?.getTime() ?? null;
  if (start === null || now >= start + WEEK_MS) return { used: 0, limit, resetsAt: null };
  return { used: row.quotaUsed, limit, resetsAt: start + WEEK_MS };
}

export function weeklyLimit(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 20;
}
```

- [ ] **Step 4: Run, expect PASS** — `node --import tsx --test server/plan.test.ts`

- [ ] **Step 5: Commit** — `git add server/plan.ts server/plan.test.ts && git commit -m "feat(plans): pure plan and weekly quota rules"`

---

### Task 2: Schema, migration and DB helpers

**Files:**
- Modify: `server/db/schema.ts:59-65` (`users`)
- Create: `server/db/migrations/0002_*.sql` (generated)
- Modify: `server/db/users.ts` (append helpers)
- Create: `server/plans.ts`
- Modify: `.env.example` (add `FREE_WEEKLY_SOLVES=20`)

**Interfaces:**
- Consumes: Task 1 (`PlanRow`, `Quota`, `Tier`, `effectivePlan`, `quotaState`, `weeklyLimit`, `WEEK_MS`).
- Produces:
  - `db/users.ts`: `planRow(userId: string): Promise<PlanRow | null>`, `countSolve(userId: string): Promise<PlanRow>`, `setPlan(userId: string, tier: Tier, premiumUntil: Date | null): Promise<boolean>`, `resetQuota(userId: string): Promise<boolean>`
  - `server/plans.ts`: `interface PlanInfo { tier: Tier; premiumUntil: number | null; quota: Quota | null }` (quota `null` for Premium), `limit(): number`, `planFor(userId: string): Promise<PlanInfo>`, `planInfo(row: PlanRow, admin: boolean, now: number): PlanInfo`

- [ ] **Step 1: Columns** — in `server/db/schema.ts` replace the `users` table comment + definition:

```ts
/** FC Solver users, keyed by their Clerk user id; `plan` + the weekly solve quota (server/plan.ts). */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  plan: text('plan').notNull().default('free'), // 'free' | 'premium'
  premiumUntil: timestamp('premium_until', { withTimezone: true }), // null: no end
  quotaStart: timestamp('quota_start', { withTimezone: true }), // null: no open window
  quotaUsed: integer('quota_used').notNull().default(0),
});
```

- [ ] **Step 2: Generate the migration** — `npm run db:generate`. Expected: a new `server/db/migrations/0002_<name>.sql` with four `ALTER TABLE "users" ADD COLUMN` lines and an updated `meta/` journal. Read the SQL; it must not drop anything.

- [ ] **Step 3: DB helpers** — append to `server/db/users.ts` and add `import type { PlanRow, Tier } from '../plan.js';` at the top:

```ts
const planCols = { plan: users.plan, premiumUntil: users.premiumUntil, quotaStart: users.quotaStart, quotaUsed: users.quotaUsed };

export async function planRow(userId: string): Promise<PlanRow | null> {
  const [row] = await db.select(planCols).from(users).where(eq(users.id, userId));
  return row ?? null;
}

/** One found solve: opens a new 7-day window when none is open (same cutoff as quotaState), else counts on. */
export async function countSolve(userId: string): Promise<PlanRow> {
  const fresh = sql`(${users.quotaStart} is null or ${users.quotaStart} <= now() - interval '7 days')`;
  const [row] = await db
    .update(users)
    .set({
      quotaStart: sql`case when ${fresh} then now() else ${users.quotaStart} end`,
      quotaUsed: sql`case when ${fresh} then 1 else ${users.quotaUsed} + 1 end`,
    })
    .where(eq(users.id, userId))
    .returning(planCols);
  return row;
}

/** The quota columns are left alone: switching plans never refills or empties the week. */
export async function setPlan(userId: string, tier: Tier, premiumUntil: Date | null): Promise<boolean> {
  const done = await db.update(users).set({ plan: tier, premiumUntil }).where(eq(users.id, userId)).returning({ id: users.id });
  return done.length > 0;
}

export async function resetQuota(userId: string): Promise<boolean> {
  const done = await db.update(users).set({ quotaStart: null, quotaUsed: 0 }).where(eq(users.id, userId)).returning({ id: users.id });
  return done.length > 0;
}
```

- [ ] **Step 4: `server/plans.ts`**

```ts
// A signed-in user's plan and quota, for /api/me, /api/solve and the admin screen.
import { isAdmin } from './admin.js';
import { planRow } from './db/users.js';
import { effectivePlan, quotaState, weeklyLimit, type PlanRow, type Quota, type Tier } from './plan.js';

export interface PlanInfo {
  tier: Tier;
  premiumUntil: number | null;
  quota: Quota | null; // null: Premium, no limit
}

// read on use: .env is loaded by initDb(), after this module is imported
export const limit = () => weeklyLimit(process.env.FREE_WEEKLY_SOLVES);

export function planInfo(row: PlanRow, admin: boolean, now: number): PlanInfo {
  const tier = effectivePlan(row, admin, now);
  return { tier, premiumUntil: row.premiumUntil?.getTime() ?? null, quota: tier === 'free' ? quotaState(row, limit(), now) : null };
}

export async function planFor(userId: string): Promise<PlanInfo> {
  const row = (await planRow(userId)) ?? { plan: 'free', premiumUntil: null, quotaStart: null, quotaUsed: 0 };
  return planInfo(row, await isAdmin(userId), Date.now());
}
```

- [ ] **Step 5: `.env.example`** — add under `ADMIN_EMAILS`:

```
# solves a Free user gets per rolling 7-day window (found squads only)
FREE_WEEKLY_SOLVES=20
```

- [ ] **Step 6: Apply + verify** — restart is automatic (`npm run dev` watches `server/`; `initDb()` runs migrations). Then:
  - `npm run typecheck` → no errors
  - `npm test` → all pass
  - `docker exec postgresql psql -U postgres -d fcsolver -c '\d users'` (adjust user if `.env` `DATABASE_URL` differs) → shows `plan`, `premium_until`, `quota_start`, `quota_used`.

- [ ] **Step 7: Commit** — `git add server/db server/plans.ts .env.example && git commit -m "feat(plans): plan and quota columns on users"`

---

### Task 3: Server endpoints

**Files:**
- Modify: `server/auth.ts:62-73` (`siteAccount` → `siteContext`)
- Modify: `server/index.ts` — `/api/me` (~line 148), `/api/solve` (~line 431), admin routes (~line 229-258)
- Modify: `server/admin.ts:109-117` (`userList`)
- Modify: `docs/api.md` (`GET /api/me`, `GET /api/admin/stats`, new admin routes, `POST /api/solve`)

**Interfaces:**
- Consumes: Task 2 (`planFor`, `planInfo`, `countSolve`, `setPlan`, `resetQuota`, `limit`), Task 1 (`quotaState`).
- Produces (HTTP):
  - `GET /api/me` adds `plan: PlanInfo` (`{ tier, premiumUntil: number|null, quota: { used, limit, resetsAt: number|null } | null }`).
  - `POST /api/solve` adds `quota: Quota | null` to both found and not-found answers; 403 `{ error, code: 'quotaExhausted', params: { limit, resetsAt } }` when a Free user has `used >= limit`.
  - `GET /api/admin/stats` `userList[]` adds `plan: PlanInfo` and `planSet: 'free' | 'premium'` (the stored value, for the select).
  - `POST /api/admin/plan` body `{ userId: string; tier: 'free'|'premium'; premiumUntil: string|null }` (ISO date) → `{ ok: true }`; 400 on bad payload, 404 unknown user.
  - `POST /api/admin/quota-reset` body `{ userId: string }` → `{ ok: true }`; 404 unknown user.

- [ ] **Step 1: `siteContext`** — in `server/auth.ts` rename the body of `siteAccount` into `siteContext` and keep `siteAccount` as a wrapper:

```ts
/** The signed-in user and the EA persona (X-Persona) the call is about. */
export async function siteContext(req: FastifyRequest): Promise<{ userId: string; acc: Account }> {
  const userId = await siteUser(req);
  const raw = req.headers['x-persona'];
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) throw new SessionError('Pick an EA account first.', 400, 'noPersona');
  const row = await personaRow(id);
  const acc = accountById(id);
  if (row?.userId === userId && acc) return { userId, acc };
  if (row?.previousUserId === userId)
    throw new SessionError('This EA account is now linked to another FC Solver user.', 403, 'personaTakenOver');
  throw new SessionError('This EA account is not linked to you.', 403, 'personaNotYours');
}

export async function siteAccount(req: FastifyRequest): Promise<Account> {
  return (await siteContext(req)).acc;
}
```

- [ ] **Step 2: `/api/me`** — import `planFor` from `./plans.js` and return it:

```ts
  return { user: { id: userId, email: row?.email ?? '' }, personas, admin: await isAdmin(userId), plan: await planFor(userId) };
```

- [ ] **Step 3: `/api/solve`** — import `siteContext` from `./auth.js`, `planFor` + `planInfo` from `./plans.js`, `countSolve` from `./db/users.js`, `isAdmin` is already imported. Change the handler start:

```ts
    const { userId, acc } = await siteContext(req);
    const plan = await planFor(userId);
    // Free: 20 found squads per 7-day window (server/plan.ts); checked before the solver runs
    if (plan.quota && plan.quota.used >= plan.quota.limit)
      throw new SessionError('Weekly solve limit reached.', 403, 'quotaExhausted', { limit: plan.quota.limit, resetsAt: plan.quota.resetsAt ?? 0 });
    const meta = await metaFor(acc);
```

  In the `!sol` branch add `quota: plan.quota,` to the returned object. Before the final `return {` of the found branch add:

```ts
    // only a found squad costs a token; Premium is not counted
    const quota =
      plan.quota && sol.eval.allMet ? planInfo(await countSolve(userId), false, Date.now()).quota : plan.quota;
```

  and add `quota,` to that returned object. (`planInfo(..., false, ...)` is safe here: the user is Free, otherwise `plan.quota` would be null.)

- [ ] **Step 4: Admin stats** — in `server/admin.ts` import `planInfo` from `./plans.js`; compute the admin list once: `const admins = adminEmails();` near `userRows`; in the `userList` map add:

```ts
        planSet: u.plan === 'premium' ? ('premium' as const) : ('free' as const),
        plan: planInfo(u, !!u.email && admins.includes(u.email.toLowerCase()), now),
```

  (`plans.ts` imports `isAdmin` from `admin.ts` and `admin.ts` imports `planInfo` from `plans.ts`: an ES module cycle of functions only, safe because neither runs the other at import time.)

- [ ] **Step 5: Admin routes** — in `server/index.ts` after `/api/admin/trust`, import `setPlan, resetQuota` from `./db/users.js`:

```ts
/** Free or Premium, optionally until a date (then Free again). The quota is left as it is. */
app.post<{ Body: { userId?: string; tier?: string; premiumUntil?: string | null } }>('/api/admin/plan', async (req, reply) => {
  await requireAdmin(req);
  const { userId, tier, premiumUntil } = req.body ?? {};
  const until = premiumUntil ? new Date(premiumUntil) : null;
  if (typeof userId !== 'string' || (tier !== 'free' && tier !== 'premium') || (until && Number.isNaN(until.getTime())))
    return reply.code(400).send({ error: 'invalid payload' });
  if (!(await setPlan(userId, tier, tier === 'premium' ? until : null))) return reply.code(404).send({ error: 'unknown user' });
  return { ok: true };
});

/** Gives a Free user their whole week back. */
app.post<{ Body: { userId?: string } }>('/api/admin/quota-reset', async (req, reply) => {
  await requireAdmin(req);
  const userId = req.body?.userId;
  if (typeof userId !== 'string') return reply.code(400).send({ error: 'invalid payload' });
  if (!(await resetQuota(userId))) return reply.code(404).send({ error: 'unknown user' });
  return { ok: true };
});
```

- [ ] **Step 6: `docs/api.md`** — document: `plan` in `GET /api/me` (shape above, "quota null = Premium"); `quota` in the `POST /api/solve` answer and the `403 quotaExhausted` error (`params: { limit, resetsAt }`, only found squads count, window rules); `planSet` + `plan` in `GET /api/admin/stats` `userList`; new sections `POST /api/admin/plan` and `POST /api/admin/quota-reset` under "Admin (site)".

- [ ] **Step 7: Verify** — `npm run typecheck`, `npm test`. Then in the browser (signed in on `http://localhost:5173/dashboard`), DevTools console:

```js
// reads your own plan (admin → premium, quota null)
await (await fetch('/api/me', { headers: { Authorization: 'Bearer ' + await window.Clerk.session.getToken() } })).json()
```

  Expected: `plan: { tier: 'premium', premiumUntil: null, quota: null }`.

- [ ] **Step 8: Commit** — `git add server docs/api.md && git commit -m "feat(plans): weekly solve quota on /api/solve, plan in /api/me and admin"`

---

### Task 4: Site plan state, locked global settings and the Plan card

**Files:**
- Modify: `web/src/api.ts` (types, `me`, `SolveResult`, admin calls)
- Modify: `web/src/App.tsx` (plan state; `effective`/`LocalOptions`/`ClubView`/Settings wiring)
- Create: `web/src/components/PlanCard.tsx`
- Modify: `web/src/components/ClubView.tsx:32-36,176` (`onToggleExclude` optional)
- Modify: `web/src/components/PlayerPanel.tsx:50,146-150` (`onExclude` optional → button hidden)
- Modify: `web/src/styles.css` (`.plan-card`, `.locked-note`, `.settings-card.locked`)
- Modify: `web/src/locales/en.ts`, `web/src/locales/ro.ts`

**Interfaces:**
- Consumes: Task 3 HTTP shapes.
- Produces (web):
  - `api.ts`: `export interface Quota { used: number; limit: number; resetsAt: number | null }`, `export interface PlanInfo { tier: 'free' | 'premium'; premiumUntil: number | null; quota: Quota | null }`; `api.me()` returns `plan: PlanInfo`; `SolveResult.quota?: Quota | null`; `AdminStats.userList[]` gains `plan: PlanInfo; planSet: 'free' | 'premium'`; `api.adminPlan(userId: string, tier: 'free'|'premium', premiumUntil: string|null)`, `api.adminQuotaReset(userId: string)`.
  - `App.tsx`: `const [plan, setPlan] = useState<PlanInfo | null>(null)`; `const premium = plan?.tier === 'premium'`; `const globalOptions = premium ? options : DEFAULT_OPTIONS`.
  - `<PlanCard plan={plan} now={now} />`.

- [ ] **Step 1: api.ts** — add the two interfaces next to `SolveResult`, add `quota?: Quota | null;` to `SolveResult`, change `me` to `req<{ user: { id: string; email: string }; personas: Account[]; admin: boolean; plan: PlanInfo }>('/api/me')`, extend `AdminStats.userList` item with `plan: PlanInfo; planSet: 'free' | 'premium'`, and add to `api`:

```ts
  adminPlan: (userId: string, tier: 'free' | 'premium', premiumUntil: string | null) =>
    req<{ ok: true }>('/api/admin/plan', { method: 'POST', body: { userId, tier, premiumUntil } }),
  adminQuotaReset: (userId: string) => req<{ ok: true }>('/api/admin/quota-reset', { method: 'POST', body: { userId } }),
```

- [ ] **Step 2: App state** — in `App.tsx`: add `const [plan, setPlan] = useState<PlanInfo | null>(null);` beside `admin`; in `loadMe` destructure `plan` and call `setPlan(plan)` (rename the destructured var to `p` to avoid shadowing: `const { user, personas, admin, plan: p } = await api.me(); ... setPlan(p);`). Then replace

```ts
  const effective = local ?? options;
```

  with

```ts
  // global settings are Premium: a Free account solves with the defaults unless the SBC has its own
  const premium = plan?.tier === 'premium';
  const globalOptions = premium ? options : DEFAULT_OPTIONS;
  const effective = local ?? globalOptions;
```

  Pass `global={globalOptions}` to `<LocalOptions …>` (line ~948) instead of `options`. For `<ClubView …>` pass `excludeIds={globalOptions.excludeIds}` and `onToggleExclude={premium ? toggleGlobalExclude : undefined}`. Saved global settings stay in `localStorage` untouched.

- [ ] **Step 3: Optional exclude** — `ClubView` Props: `onToggleExclude?: (playerId: number) => void;` and line 176 `onExclude={onToggleExclude ? () => onToggleExclude(selected.id) : undefined}`. `PlayerPanel` Props: `onExclude?: () => void;` and wrap both exclude buttons (lines ~146-153) in `{onExclude && (…)}`.

- [ ] **Step 4: Locked global settings** — in the Settings view (`App.tsx` ~line 699) replace the options card:

```tsx
                <div className={`settings-card options${premium ? '' : ' locked'}`}>
                  {!premium && (
                    <p className="locked-note">
                      <Crown weight="fill" aria-hidden="true" /> {t('plan.globalLocked')}
                    </p>
                  )}
                  <fieldset disabled={!premium} className="plain">
                    <SolverOptions options={premium ? options : DEFAULT_OPTIONS} onChange={updateOptions} clubById={clubById} club={club} meta={meta} />
                  </fieldset>
                </div>
```

  Import `Crown` from `@phosphor-icons/react`. Put `<PlanCard plan={plan} now={now} />` as the first child of `.settings-side`.

- [ ] **Step 5: PlanCard** — `web/src/components/PlanCard.tsx`

```tsx
// Settings card: which plan this user is on, the weekly solves left and what Premium adds.
import { Crown } from '@phosphor-icons/react';
import type { PlanInfo } from '../api';
import { useI18n } from '../i18n';
import { untilText } from '../repeat';

export function PlanCard({ plan, now }: { plan: PlanInfo | null; now: number }) {
  const { t } = useI18n();
  if (!plan) return null;
  const q = plan.quota;
  return (
    <section className="settings-card plan-card">
      <h2>
        {plan.tier === 'premium' && <Crown weight="fill" aria-hidden="true" />} {t(plan.tier === 'premium' ? 'plan.premium' : 'plan.free')}
      </h2>
      {q ? (
        <>
          <p className="ea-count">
            <b>{q.limit - q.used}</b> / {q.limit}
          </p>
          <span className="req-bar ea-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, ((q.limit - q.used) / q.limit) * 100)}%` }} />
          </span>
          <p className="muted">
            {q.resetsAt ? t('plan.resetsIn', { until: untilText(t, q.resetsAt, now) }) : t('plan.windowIdle')}
          </p>
          <p className="muted">{t('plan.howFree', { limit: q.limit })}</p>
          <p>
            <b>{t('plan.premiumAdds')}</b> {t('plan.premiumList')} <em>{t('plan.soon')}</em>
          </p>
        </>
      ) : (
        <p className="muted">
          {t('plan.unlimited')}
          {plan.premiumUntil ? ` · ${t('plan.until', { date: new Date(plan.premiumUntil).toLocaleDateString() })}` : ''}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 6: CSS** — append to `web/src/styles.css` (reuse existing tokens; check variable names in `:root` before using):

```css
.settings-card.locked fieldset { opacity: 0.55; }
fieldset.plain { border: 0; margin: 0; padding: 0; min-width: 0; display: contents; }
.locked-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 12px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-2);
  font-size: 13px;
}
.plan-card h2 { display: flex; align-items: center; gap: 8px; }
```

  Note `display: contents` on a disabled fieldset still disables its controls (disabled is inherited via the fieldset, not layout). If a browser check shows controls still active, drop `display: contents`.

- [ ] **Step 7: i18n keys** — `en.ts`:

```ts
  'plan.free': 'Free plan',
  'plan.premium': 'Premium',
  'plan.resetsIn': 'Your solves come back in {until}.',
  'plan.windowIdle': 'Your week starts with your next solve.',
  'plan.howFree': 'Free gives you {limit} solves per week. Only a found squad costs one: Solve, Cheaper, the SBC storage retry and re-solving after excluding a player each count. "No squad" answers are free. The week starts with your first solve and resets 7 days later.',
  'plan.premiumAdds': 'Premium adds:',
  'plan.premiumList': 'unlimited solves and global solver settings for every SBC.',
  'plan.soon': 'Coming soon.',
  'plan.unlimited': 'Unlimited solves and global settings.',
  'plan.until': 'until {date}',
  'plan.globalLocked': 'Global settings are part of Premium. On Free, each SBC can still have its own settings and excluded players.',
```

  `ro.ts`:

```ts
  'plan.free': 'Plan Free',
  'plan.premium': 'Premium',
  'plan.resetsIn': 'Rezolvările revin în {until}.',
  'plan.windowIdle': 'Săptămâna ta începe cu următoarea rezolvare.',
  'plan.howFree': 'Free îți dă {limit} rezolvări pe săptămână. Doar o echipă găsită consumă una: Rezolvă, Mai ieftin, încercarea cu SBC storage și rezolvarea din nou după excluderea unui jucător. Răspunsurile „nicio echipă” sunt gratuite. Săptămâna începe la prima rezolvare și se resetează după 7 zile.',
  'plan.premiumAdds': 'Premium adaugă:',
  'plan.premiumList': 'rezolvări nelimitate și setări globale pentru fiecare SBC.',
  'plan.soon': 'În curând.',
  'plan.unlimited': 'Rezolvări nelimitate și setări globale.',
  'plan.until': 'până la {date}',
  'plan.globalLocked': 'Setările globale fac parte din Premium. Pe Free, fiecare SBC poate avea în continuare setările lui și jucătorii excluși.',
```

- [ ] **Step 8: Verify** — `npm run typecheck`, `npm run i18n:check`, `npm run build`. Browser: as admin the Plan card says Premium and the settings work. Temporarily test Free: in `.env` set `ADMIN_EMAILS=nobody@example.com` (dev server restarts), reload: Plan card shows `20 / 20`, global settings are dimmed with the note and not clickable, SBC Options panel starts from defaults, Club screen player panel has no exclude button. Restore `ADMIN_EMAILS`. Check at 390px width.

- [ ] **Step 9: Commit** — `git add web && git commit -m "feat(plans): plan card, global settings locked on Free"`

---

### Task 5: Quota counter at the Solve button

**Files:**
- Modify: `web/src/repeat.ts:39-42` (`untilText` with days)
- Create: `web/src/repeat.test.ts`
- Modify: `web/src/components/Pitch.tsx` (props `quota`, `outOfSolves`)
- Create: `web/src/components/QuotaMeter.tsx`
- Modify: `web/src/App.tsx` (`runSolve`, `tryStorage`, `excludeAndResolve`, `onApiError`, `PlayerPanel` in set screen)
- Modify: `web/src/styles.css`, `web/src/locales/en.ts`, `web/src/locales/ro.ts`

**Interfaces:**
- Consumes: Task 4 (`plan`, `setPlan`, `premium`, `PlanInfo`, `Quota`), `SolveResult.quota`.
- Produces: `untilText(t, ts, now)` returns `time.until.dh` for ≥ 24 h; `<QuotaMeter plan={plan} now={now} />`; App `outOfSolves: boolean`.

- [ ] **Step 1: Failing test** — `web/src/repeat.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { untilText } from './repeat';

const t = (k: string, p: Record<string, string | number> = {}) => `${k}:${JSON.stringify(p)}`;
const NOW = 1_000_000_000_000;

test('untilText: minutes, hours, days', () => {
  assert.equal(untilText(t as never, NOW + 5 * 60e3, NOW), 'time.until.min:{"m":5}');
  assert.equal(untilText(t as never, NOW + 125 * 60e3, NOW), 'time.until.hmin:{"h":2,"m":5}');
  assert.equal(untilText(t as never, NOW + (3 * 24 + 4) * 3600e3, NOW), 'time.until.dh:{"d":3,"h":4}');
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --import tsx --test web/src/repeat.test.ts` → the days case fails.

- [ ] **Step 3: Implement** — `web/src/repeat.ts`:

```ts
export function untilText(t: T, ts: number, now = Date.now()) {
  const m = Math.max(1, Math.round((ts - now) / 60000));
  if (m >= 24 * 60) return t('time.until.dh', { d: Math.floor(m / 1440), h: Math.floor((m % 1440) / 60) });
  return m < 60 ? t('time.until.min', { m }) : t('time.until.hmin', { h: Math.floor(m / 60), m: m % 60 });
}
```

  Keys: en `'time.until.dh': '{d} d {h} h',` ro `'time.until.dh': '{d} z {h} h',`.

- [ ] **Step 4: Run, expect PASS** — `node --import tsx --test web/src/repeat.test.ts`.

- [ ] **Step 5: QuotaMeter** — `web/src/components/QuotaMeter.tsx`

```tsx
// Next to the Solve button: weekly solves left on Free (with the rules one tap away), "unlimited" on Premium.
import { useState } from 'react';
import { Info } from '@phosphor-icons/react';
import type { PlanInfo } from '../api';
import { useI18n } from '../i18n';
import { untilText } from '../repeat';

export function QuotaMeter({ plan, now }: { plan: PlanInfo | null; now: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!plan) return null;
  const q = plan.quota;
  if (!q) return <p className="quota-meter">{t('quota.premium')}</p>;
  const left = Math.max(0, q.limit - q.used);
  return (
    <div className={`quota-meter${left === 0 ? ' empty' : ''}`}>
      <p role="status">
        {t('quota.left', { count: left, limit: q.limit })}
        {q.resetsAt && <> · {t('quota.resets', { until: untilText(t, q.resetsAt, now) })}</>}
        <button type="button" className="icon" aria-expanded={open} aria-label={t('quota.what')} onClick={() => setOpen((v) => !v)}>
          <Info weight="bold" aria-hidden="true" />
        </button>
      </p>
      {open && <p className="quota-help muted">{t('plan.howFree', { limit: q.limit })} {t('plan.premiumAdds')} {t('plan.premiumList')}</p>}
    </div>
  );
}
```

  Keys en:

```ts
  'quota.left_one': '{count} of {limit} solves left this week',
  'quota.left_other': '{count} of {limit} solves left this week',
  'quota.resets': 'resets in {until}',
  'quota.what': 'How weekly solves work',
  'quota.premium': 'Premium · unlimited solves',
  'quota.out': 'No solves left this week. They come back in {until}.',
  'err.quotaExhausted': 'You used all {limit} solves for this week.',
```

  ro:

```ts
  'quota.left_one': '{count} din {limit} rezolvări rămasă săptămâna asta',
  'quota.left_few': '{count} din {limit} rezolvări rămase săptămâna asta',
  'quota.left_other': '{count} din {limit} de rezolvări rămase săptămâna asta',
  'quota.resets': 'se resetează în {until}',
  'quota.what': 'Cum funcționează rezolvările săptămânale',
  'quota.premium': 'Premium · rezolvări nelimitate',
  'quota.out': 'Nu mai ai rezolvări săptămâna asta. Revin în {until}.',
  'err.quotaExhausted': 'Ai folosit toate cele {limit} rezolvări din săptămâna asta.',
```

- [ ] **Step 6: Wire into App** — in `App.tsx`:

```ts
  const outOfSolves = !!plan?.quota && plan.quota.used >= plan.quota.limit;
  const noteQuota = (r: SolveResult) => r.quota !== undefined && setPlan((p) => (p ? { ...p, quota: r.quota ?? null } : p));
```

  - `runSolve`: early return `if (!challenge || lock || outOfSolves) return;`; after `const r = await api.solve(...)` call `noteQuota(r);`.
  - `tryStorage`: same early-return guard and `noteQuota(r);` after the solve.
  - `excludeAndResolve`: still saves the per-SBC exclusion, but only calls `runSolve` when `!outOfSolves`.
  - `onApiError`: before the generic branch add `if (code === 'quotaExhausted') void api.me().then((m) => setPlan(m.plan));` (the message itself still comes from `errorText` → `err.quotaExhausted`).
  - Render `<QuotaMeter plan={plan} now={now} />` directly above `<Pitch …>`; when `outOfSolves && plan?.quota?.resetsAt`, also render `<div className="notice-inline" role="status">{t('quota.out', { until: untilText(t, plan.quota.resetsAt, now) })}</div>`.
  - Pass `outOfSolves={outOfSolves}` to `<Pitch>`; hide the storage-retry notice button when `outOfSolves` (add `&& !outOfSolves` to `askStorage && !solving`).
  - The set-screen `<PlayerPanel … onExclude=…>` keeps its button (it still saves the exclusion); no change.

- [ ] **Step 7: Pitch** — add prop `outOfSolves: boolean` to `Props` and the destructuring; both `.solve` and `.solve-deep` buttons get `disabled={solving || outOfSolves}`.

- [ ] **Step 8: CSS** — append:

```css
.quota-meter { margin: 0 0 8px; font-size: 13px; color: var(--muted); }
.quota-meter p { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0; }
.quota-meter.empty { color: var(--text); font-weight: 600; }
.quota-help { margin: 6px 0 0; max-width: 60ch; }
```

  (Check the real names of the muted/text color tokens in `:root` of `styles.css` and use those.)

- [ ] **Step 9: Verify** — `npm test`, `npm run typecheck`, `npm run i18n:check`, `npm run build`. Browser with Free forced (Task 4 Step 8 trick): solve a challenge → counter goes `20 → 19`; a "no squad" answer leaves it; set `quota_used` to the limit via `docker exec postgresql psql … -c "update users set quota_start=now(), quota_used=20 where email='<you>'"` → Solve/Cheaper disabled, "come back in 6 d 23 h" notice, (i) opens the rules; a direct API solve returns 403 `quotaExhausted`. 390px width. Restore `ADMIN_EMAILS`.

- [ ] **Step 10: Commit** — `git add web && git commit -m "feat(plans): weekly solves counter at the solve button"`

---

### Task 6: Admin plan controls

**Files:**
- Modify: `web/src/components/AdminView.tsx:162-172` (user rows) + handlers near line 50
- Modify: `web/src/styles.css`, `web/src/locales/en.ts`, `web/src/locales/ro.ts`

**Interfaces:**
- Consumes: `api.adminPlan`, `api.adminQuotaReset`, `AdminStats.userList[].plan / planSet`, `untilText`.

- [ ] **Step 1: Handlers** — in `AdminView` beside the trust handler:

```tsx
  const changePlan = async (userId: string, tier: 'free' | 'premium', until: string) => {
    setBusy(`plan-${userId}`);
    setError(null);
    try {
      await api.adminPlan(userId, tier, tier === 'premium' && until ? new Date(`${until}T23:59:59`).toISOString() : null);
      await load();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };
  const resetQuota = async (userId: string) => {
    setBusy(`quota-${userId}`);
    setError(null);
    try {
      await api.adminQuotaReset(userId);
      await load();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };
```

  (Match the existing trust handler's error handling if it differs from this — copy its pattern.)

- [ ] **Step 2: Row UI** — inside each `admin-user` `<li>`, after `.admin-user-head`:

```tsx
            <div className="admin-plan">
              <label>
                {t('admin.plan.label')}{' '}
                <select
                  value={usr.planSet}
                  disabled={busy === `plan-${usr.id}`}
                  onChange={(e) => void changePlan(usr.id, e.target.value as 'free' | 'premium', '')}
                >
                  <option value="free">Free</option>
                  <option value="premium">Premium</option>
                </select>
              </label>
              {usr.planSet === 'premium' && (
                <label>
                  {t('admin.plan.until')}{' '}
                  <input
                    type="date"
                    defaultValue={usr.plan.premiumUntil ? new Date(usr.plan.premiumUntil).toISOString().slice(0, 10) : ''}
                    onChange={(e) => void changePlan(usr.id, 'premium', e.target.value)}
                  />
                </label>
              )}
              <span className="muted">
                {usr.plan.quota
                  ? t('admin.plan.quota', {
                      used: usr.plan.quota.used,
                      limit: usr.plan.quota.limit,
                      reset: usr.plan.quota.resetsAt ? untilText(t, usr.plan.quota.resetsAt) : '—',
                    })
                  : t('admin.plan.unlimited')}
              </span>
              {usr.plan.quota && usr.plan.quota.used > 0 && (
                <button type="button" className="ghost" disabled={busy === `quota-${usr.id}`} onClick={() => void resetQuota(usr.id)}>
                  {t('admin.plan.reset')}
                </button>
              )}
            </div>
```

  Import `untilText` from `../repeat` and `errorText` from `../messages` if not already imported. "Free" / "Premium" are product names, not translated.

- [ ] **Step 3: Keys** — en:

```ts
  'admin.plan.label': 'Plan',
  'admin.plan.until': 'until',
  'admin.plan.quota': '{used}/{limit} solves · resets in {reset}',
  'admin.plan.unlimited': 'unlimited',
  'admin.plan.reset': 'Reset quota',
```

  ro:

```ts
  'admin.plan.label': 'Plan',
  'admin.plan.until': 'până la',
  'admin.plan.quota': '{used}/{limit} rezolvări · reset în {reset}',
  'admin.plan.unlimited': 'nelimitat',
  'admin.plan.reset': 'Resetează quota',
```

- [ ] **Step 4: CSS**

```css
.admin-plan { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; margin: 8px 0; font-size: 13px; }
.admin-plan select, .admin-plan input[type='date'] { border-radius: 8px; }
```

- [ ] **Step 5: Verify** — `npm run typecheck`, `npm run i18n:check`, `npm run build`. Browser on `/dashboard/admin`: switch a test user to Premium → row shows "unlimited"; set a past date → row shows the quota again (effective Free); switch back to Free; after a few solves as that user "Reset quota" brings it to 0. The 15 s auto-refresh must not reset the select while editing (it re-renders from `planSet`, which is already saved). 390px width.

- [ ] **Step 6: Commit** — `git add web && git commit -m "feat(admin): set a member's plan and reset their weekly quota"`

---

### Task 7: Landing pricing and Terms

**Files:**
- Modify: `web/src/locales/en.ts:515-531`, `web/src/locales/ro.ts` (`landing.price.*`)
- Modify: `web/src/landing/Pricing.tsx` (Free list gets a 4th item; Premium list 3 items)
- Modify: `web/src/landing/pricing.ts:1`, `web/src/landing/Pricing.tsx:1` (comments: Pro → Premium)
- Modify: `web/src/legal/docs.ts` (`paid` section in `en` ~line 76 and `ro` ~line 250; `UPDATED`)

**Interfaces:** none new.

- [ ] **Step 1: Landing copy** — en (replace existing values, add new keys):

```ts
  'landing.price.free.f3': '{limit} solves a week, only found squads count',
  'landing.price.free.f4': 'Settings and excluded players per SBC',
  'landing.price.pro.name': 'Premium',
  'landing.price.pro.f1': 'Unlimited solves',
  'landing.price.pro.f2': 'Global solver settings for every SBC',
  'landing.price.pro.f3': 'Everything in Free',
```

  ro:

```ts
  'landing.price.free.f3': '{limit} rezolvări pe săptămână, contează doar echipele găsite',
  'landing.price.free.f4': 'Setări și jucători excluși pentru fiecare SBC',
  'landing.price.pro.name': 'Premium',
  'landing.price.pro.f1': 'Rezolvări nelimitate',
  'landing.price.pro.f2': 'Setări globale pentru toate SBC-urile',
  'landing.price.pro.f3': 'Tot ce include Free',
```

  In `Pricing.tsx`: Free list `[t('landing.price.free.f1'), t('landing.price.free.f2'), t('landing.price.free.f3', { limit: 20 }), t('landing.price.free.f4')]`; Premium list `[t('landing.price.pro.f1'), t('landing.price.pro.f2'), t('landing.price.pro.f3')]`. Add `export const FREE_WEEKLY_SOLVES = 20;` to `pricing.ts` (comment: "display only; the server's FREE_WEEKLY_SOLVES decides") and use it instead of the literal. Also update `landing.price.title` if it still reads "upgrade for every SBC" — it stays true, leave it. Check the FAQ (`Faq.tsx` keys `landing.faq.*`) for "Pro" or "limited number of SBCs" and align wording to Premium / weekly solves.

- [ ] **Step 2: Terms** — in `docs.ts` rename the `paid` section heading to "Plans" / "Planuri" and give it two paragraphs in both languages (the test requires equal paragraph counts):

  en:
```ts
        h: 'Plans',
        p: [
          'FC Solver has a Free plan and a Premium plan. Free includes a weekly number of solves (shown in the app next to the Solve button and in Settings); only a solve that finds a squad counts, and the week starts with your first counted solve and resets 7 days later. Premium removes the limit and adds global solver settings. We may grant or end Premium, and change the Free limit, with notice in the app.',
          'Prices shown on the website for Premium are indicative; paid plans are not on sale yet. When they are, their price, billing and cancellation terms will be shown before you pay, and these terms will be updated.',
        ],
```

  ro:
```ts
        h: 'Planuri',
        p: [
          'FC Solver are un plan Free și un plan Premium. Free include un număr săptămânal de rezolvări (afișat în aplicație lângă butonul Rezolvă și în Setări); contează doar o rezolvare care găsește o echipă, iar săptămâna începe la prima rezolvare numărată și se resetează după 7 zile. Premium elimină limita și adaugă setări globale pentru solver. Putem acorda sau încheia Premium și putem schimba limita Free, cu anunț în aplicație.',
          'Prețurile afișate pe site pentru Premium sunt orientative; planurile plătite nu sunt încă de vânzare. Când vor fi, prețul, facturarea și condițiile de anulare îți vor fi arătate înainte de plată, iar acești termeni vor fi actualizați.',
        ],
```

  Keep `id: 'paid'` (anchor stability). `UPDATED` is already `2026-09-24`; if implementing on a later date, set it to that date.

- [ ] **Step 3: Verify** — `npm test` (docs.test.ts passes), `npm run i18n:check`, `npm run build`. Browser: `/` pricing shows Free (4 items incl. "20 solves a week") and Premium; `/terms` (and RO) shows the "Plans" section. 390px width.

- [ ] **Step 4: Commit** — `git add web && git commit -m "feat(landing): Free and Premium plans on pricing and in the terms"`

---

### Task 8: Final check

- [ ] `npm test`, `npm run typecheck`, `npm run i18n:check`, `npm run build` — all green, output quoted in the report.
- [ ] Browser walk-through of the spec's Testing list (Free until 0, admin → Premium, past end date → Free, quota reset, 390px).
- [ ] `docs/architecture.md`: one paragraph under the auth/users part: "Plans: `users.plan` + weekly quota (`server/plan.ts`), enforced in `/api/solve`".
- [ ] `CLAUDE.md` Layout line for `server/`: add `plan.ts` pure plan/quota rules, `plans.ts` plan for a user. Commit `docs: plans in architecture and CLAUDE.md`.
- [ ] Ask before pushing.
