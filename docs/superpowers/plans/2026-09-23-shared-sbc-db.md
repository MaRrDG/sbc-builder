# Shared SBC Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Postgres (via Drizzle) keeps every SBC set / challenge ever seen and shares brick (locked-slot) layouts between all accounts, so a brick SBC seen once by anyone is solvable for everyone.

**Architecture:** A `server/db/` module owns the connection, schema, migrations and the few queries we need. Existing hooks that already write the per-account JSON cache (`server/events.ts`, `server/sync.ts`) also upsert into the DB; `challengeLayout()` in `server/layout.ts` reads the shared bricks from the DB. Pure brick logic (hash, checks, layout choice) lives in `server/bricks.ts` with `node:test` unit tests.

**Tech Stack:** Node 24, TypeScript via `tsx`, Fastify 5, Postgres 18, `drizzle-orm` + `postgres` (postgres.js), `drizzle-kit` (dev), `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-23-shared-sbc-db-design.md`

## Global Constraints

- Never add any EA request; never write to EA. Everything here rides on data the app already receives.
- Never print or commit keys, SIDs, `DATABASE_URL` or `DB_PASSWORD`. `.env` must be git-ignored before it is created.
- DB rows are never deleted by app code.
- `brick_reports.layout` holds only `BrickSlot[]`, never the reporter's placed players.
- Server must not start without a working DB (exit 1 with a clear message). DB write failures during sync / relay are logged and swallowed.
- Game formulas (`server/squad.ts`) and `found` logic are untouched.
- Commit messages: `type(scope): subject`, ending with the two attribution lines:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01L5tvz1oKUwcQvY2AfSdzJQ
  ```
- Branch `dev`; `git pull --rebase` before each commit; never push.
- `npm run dev` may already be running; don't kill it.

## File map

| File | Responsibility |
|---|---|
| `server/db/schema.ts` (new) | Drizzle table definitions |
| `server/db/index.ts` (new) | `.env` loading, connection, migrations, `softly()` error wrapper |
| `server/db/migrations/` (generated) | SQL migrations + drizzle journal |
| `server/db/sbcs.ts` (new) | `saveSets`, `saveChallenges`, `reportBricks`, `sharedBricks` |
| `server/bricks.ts` (new) | pure: `isBrickChallenge`, `canonicalBricks`, `layoutHash`, `rejectReason`, `chooseLayout` |
| `server/bricks.test.ts` (new) | unit tests for `bricks.ts` |
| `drizzle.config.ts` (new) | drizzle-kit config |
| `server/index.ts` | call `initDb()` before `listen` |
| `server/events.ts` | save sets / challenges / brick reports from relayed responses |
| `server/sync.ts` | save sets / challenges after syncs |
| `server/layout.ts` | read shared bricks; re-export `isBrickChallenge` |
| `scripts/db-import.ts`, `scripts/db-trust.ts` (new) | backfill, trusted accounts |
| `package.json`, `.gitignore`, `.env.example`, `docker-compose.yml`, `Dockerfile` | deps, scripts, config, deploy |
| `docs/architecture.md`, `docs/deploy.md`, `CLAUDE.md` | docs |

---

### Task 1: Pure brick logic with unit tests

**Files:**
- Create: `server/bricks.ts`, `server/bricks.test.ts`
- Modify: `server/layout.ts:122` (move `isBrickChallenge` out), `package.json` (add `test` script)

**Interfaces:**
- Consumes: `BrickSlot` type from `server/layout.ts` (`{ index; custom; nation; league; club; rareflag; positions: string[] | null }`).
- Produces:
  - `isBrickChallenge(type: string | null | undefined): boolean`
  - `canonicalBricks(bricks: BrickSlot[]): BrickSlot[]`
  - `layoutHash(bricks: BrickSlot[]): string`
  - `rejectReason(challengeType: string | null | undefined, bricks: BrickSlot[]): string | null`
  - `interface Report { personaId: number; hash: string; bricks: BrickSlot[]; capturedAt: number }`
  - `chooseLayout(reports: Report[], trusted: Set<number>): BrickSlot[] | null`

- [ ] **Step 1: Add the test script**

In `package.json` `scripts`, after `"i18n:check"`, add:
```json
"test": "node --import tsx --test 'server/**/*.test.ts'"
```

- [ ] **Step 2: Write the failing tests** — `server/bricks.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BrickSlot } from './layout.js';
import { canonicalBricks, chooseLayout, isBrickChallenge, layoutHash, rejectReason, type Report } from './bricks.js';

const brick = (index: number, over: Partial<BrickSlot> = {}): BrickSlot => ({
  index, custom: false, nation: 0, league: 0, club: 0, rareflag: 0, positions: null, ...over,
});

test('isBrickChallenge', () => {
  assert.equal(isBrickChallenge('BRICK_CHALLENGE'), true);
  assert.equal(isBrickChallenge('CUSTOM_BRICK_CHALLENGE'), true);
  assert.equal(isBrickChallenge('OPEN_CHALLENGE'), false);
  assert.equal(isBrickChallenge(undefined), false);
});

test('hash ignores order and extra keys', () => {
  const a = [brick(3), brick(1, { custom: true, club: 5 })];
  const b = [{ ...brick(1, { custom: true, club: 5 }), extra: 1 } as BrickSlot, brick(3)];
  assert.equal(layoutHash(a), layoutHash(b));
  assert.deepEqual(canonicalBricks(a).map((x) => x.index), [1, 3]);
  assert.notEqual(layoutHash(a), layoutHash([brick(3), brick(2)]));
});

test('rejectReason accepts a sane layout', () => {
  assert.equal(rejectReason('BRICK_CHALLENGE', [brick(0), brick(10)]), null);
  assert.equal(rejectReason('CUSTOM_BRICK_CHALLENGE', [brick(4, { custom: true, positions: ['ST'] })]), null);
});

test('rejectReason refuses broken layouts', () => {
  assert.match(rejectReason('OPEN_CHALLENGE', [brick(0)])!, /not a brick/);
  assert.match(rejectReason('BRICK_CHALLENGE', [])!, /no locked/);
  assert.match(rejectReason('BRICK_CHALLENGE', Array.from({ length: 11 }, (_, i) => brick(i)))!, /every slot/);
  assert.match(rejectReason('BRICK_CHALLENGE', [brick(12)])!, /out of range/);
  assert.match(rejectReason('BRICK_CHALLENGE', [brick(2), brick(2)])!, /twice/);
  assert.match(rejectReason('BRICK_CHALLENGE', [brick(2, { club: -1 })])!, /invalid id/);
  assert.match(rejectReason('BRICK_CHALLENGE', [brick(2, { positions: [1] as unknown as string[] })])!, /positions/);
});

const rep = (personaId: number, bricks: BrickSlot[], capturedAt: number): Report => ({
  personaId, bricks, hash: layoutHash(bricks), capturedAt,
});

test('chooseLayout: none', () => {
  assert.equal(chooseLayout([], new Set()), null);
});

test('chooseLayout: majority of distinct accounts wins', () => {
  const real = [brick(1)], fake = [brick(9)];
  const pick = chooseLayout([rep(1, fake, 1), rep(1, fake, 2), rep(2, real, 3), rep(3, real, 4)], new Set());
  assert.deepEqual(pick, real);
});

test('chooseLayout: tie goes to the earliest', () => {
  const a = [brick(1)], b = [brick(2)];
  assert.deepEqual(chooseLayout([rep(1, b, 20), rep(2, a, 10)], new Set()), a);
});

test('chooseLayout: newest trusted report wins over majority', () => {
  const a = [brick(1)], b = [brick(2)], c = [brick(3)];
  const reports = [rep(1, a, 1), rep(2, a, 2), rep(9, b, 3), rep(9, c, 4)];
  assert.deepEqual(chooseLayout(reports, new Set([9])), c);
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, `Cannot find module ... server/bricks.ts` (or `ERR_MODULE_NOT_FOUND`).

- [ ] **Step 4: Implement** — `server/bricks.ts`

```ts
// Pure rules for shared brick layouts: which challenges have them, how a report is fingerprinted,
// which reports are obviously broken, and which layout wins when accounts disagree.
import { createHash } from 'node:crypto';
import type { BrickSlot } from './layout.js';

/** Brick challenges have locked slots we must know before solving. */
export const isBrickChallenge = (type: string | null | undefined) => !!type && type.toUpperCase().includes('BRICK');

/** Bricks sorted by slot with a fixed key order, so equal layouts serialize equally. */
export function canonicalBricks(bricks: BrickSlot[]): BrickSlot[] {
  return [...bricks]
    .sort((a, b) => a.index - b.index)
    .map((b) => ({
      index: b.index, custom: b.custom, nation: b.nation, league: b.league, club: b.club, rareflag: b.rareflag,
      positions: b.positions ? [...b.positions] : null,
    }));
}

export const layoutHash = (bricks: BrickSlot[]) =>
  createHash('sha256').update(JSON.stringify(canonicalBricks(bricks))).digest('hex');

const isId = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;

/** Why a reported layout cannot be right, or null when it passes. Structural checks only. */
export function rejectReason(challengeType: string | null | undefined, bricks: BrickSlot[]): string | null {
  if (!isBrickChallenge(challengeType)) return 'not a brick challenge';
  if (bricks.length === 0) return 'no locked slots';
  if (bricks.length > 10) return 'every slot locked';
  const seen = new Set<number>();
  for (const b of bricks) {
    if (!Number.isInteger(b.index) || b.index < 0 || b.index > 10) return `slot ${b.index} out of range`;
    if (seen.has(b.index)) return `slot ${b.index} twice`;
    seen.add(b.index);
    if (![b.nation, b.league, b.club, b.rareflag].every(isId)) return 'invalid id';
    if (b.positions !== null && !(Array.isArray(b.positions) && b.positions.every((p) => typeof p === 'string')))
      return 'invalid positions';
  }
  return null;
}

export interface Report {
  personaId: number;
  hash: string;
  bricks: BrickSlot[];
  capturedAt: number;
}

/** Newest trusted report wins; otherwise the layout most distinct accounts sent; ties: earliest seen. */
export function chooseLayout(reports: Report[], trusted: Set<number>): BrickSlot[] | null {
  if (!reports.length) return null;
  const fromTrusted = reports.filter((r) => trusted.has(r.personaId)).sort((a, b) => b.capturedAt - a.capturedAt)[0];
  if (fromTrusted) return fromTrusted.bricks;
  const byHash = new Map<string, { voters: Set<number>; first: number; bricks: BrickSlot[] }>();
  for (const r of reports) {
    const g = byHash.get(r.hash) ?? { voters: new Set<number>(), first: r.capturedAt, bricks: r.bricks };
    g.voters.add(r.personaId);
    g.first = Math.min(g.first, r.capturedAt);
    byHash.set(r.hash, g);
  }
  return [...byHash.values()].sort((a, b) => b.voters.size - a.voters.size || a.first - b.first)[0].bricks;
}
```

- [ ] **Step 5: Move `isBrickChallenge` out of `server/layout.ts`**

Replace the last two lines of `server/layout.ts`:
```ts
/** Brick challenges have locked slots we must know before solving. */
export const isBrickChallenge = (type: string | undefined) => !!type && type.toUpperCase().includes('BRICK');
```
with:
```ts
export { isBrickChallenge } from './bricks.js';
```

- [ ] **Step 6: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: all 8 tests pass (`# pass 8`, `# fail 0`); typecheck exits 0.

- [ ] **Step 7: Commit**

```bash
git pull --rebase
git add server/bricks.ts server/bricks.test.ts server/layout.ts package.json
git commit -m "feat(server): brick layout hash, checks and vote" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L5tvz1oKUwcQvY2AfSdzJQ"
```

---

### Task 2: Database foundation (local DB, schema, migrations, startup)

**Files:**
- Modify: `.gitignore`, `package.json`, `server/index.ts:330`
- Create: `.env` (local, never committed), `.env.example`, `drizzle.config.ts`, `server/db/schema.ts`, `server/db/index.ts`, `server/db/migrations/*` (generated)

**Interfaces:**
- Consumes: `ROOT` from `server/store.ts`; `BrickSlot` from `server/layout.ts`.
- Produces:
  - tables `sbcSets`, `challenges`, `brickReports`, `trustedAccounts` (Drizzle objects in `server/db/schema.ts`)
  - `db: PostgresJsDatabase<typeof schema>` (live binding, set by `initDb`)
  - `initDb(): Promise<void>` — loads `.env` if present, connects, applies migrations; throws on failure
  - `closeDb(): Promise<void>`
  - `softly(what: string, fn: () => Promise<unknown>): Promise<void>` — runs `fn`, logs `[db] <what> failed: <message>` on error, never throws

- [ ] **Step 1: Git-ignore `.env` first**

Append to `.gitignore`:
```
.env
```
Run: `git check-ignore .env` → Expected: prints `.env`.

- [ ] **Step 2: Create the local role and database**

```bash
PW=$(openssl rand -hex 24)
docker exec -i postgresql psql -U postgres -v ON_ERROR_STOP=1 <<SQL
CREATE ROLE fcsolver LOGIN PASSWORD '$PW';
CREATE DATABASE fcsolver OWNER fcsolver;
SQL
printf 'DATABASE_URL=postgres://fcsolver:%s@127.0.0.1:5432/fcsolver\n' "$PW" > .env
unset PW
```
Verify without printing the password: `docker exec postgresql psql -U postgres -Atc "select datname from pg_database where datname='fcsolver'"` → Expected: `fcsolver`.

- [ ] **Step 3: `.env.example`**

```
# Local development: Postgres connection for the API and the db:* scripts.
DATABASE_URL=postgres://fcsolver:CHANGE_ME@127.0.0.1:5432/fcsolver
# Production (docker compose): password for the db service; compose builds DATABASE_URL from it.
DB_PASSWORD=CHANGE_ME
```

- [ ] **Step 4: Install dependencies**

Run: `npm install drizzle-orm postgres && npm install -D drizzle-kit`
Expected: `package.json` gains `drizzle-orm`, `postgres` in `dependencies` and `drizzle-kit` in `devDependencies`.

Add to `package.json` `scripts`:
```json
"db:generate": "drizzle-kit generate",
"db:import": "tsx scripts/db-import.ts",
"db:trust": "tsx scripts/db-trust.ts"
```
(The two scripts are created in Task 4.)

- [ ] **Step 5: `drizzle.config.ts`**

```ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
});
```

- [ ] **Step 6: `server/db/schema.ts`**

```ts
// Shared, account-independent data. Per-account data (club, squad, progress) stays in data/accounts/.
import { bigint, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import type { BrickSlot } from '../layout.js';

const seen = () => ({
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
});

/** Every SBC set ever seen: latest definition as EA sent it. */
export const sbcSets = pgTable('sbc_sets', {
  setId: integer('set_id').primaryKey(),
  name: text('name').notNull().default(''),
  description: text('description').notNull().default(''),
  categoryId: integer('category_id'),
  repeatabilityMode: text('repeatability_mode'),
  endTime: bigint('end_time', { mode: 'number' }), // unix seconds
  raw: jsonb('raw').notNull(),
  ...seen(),
});

/** Every challenge ever seen: latest definition as EA sent it. */
export const challenges = pgTable('challenges', {
  challengeId: integer('challenge_id').primaryKey(),
  setId: integer('set_id').notNull().references(() => sbcSets.setId),
  name: text('name').notNull().default(''),
  type: text('type'),
  formation: text('formation'),
  elgOperation: text('elg_operation'),
  elgReq: jsonb('elg_req').notNull(),
  raw: jsonb('raw').notNull(),
  ...seen(),
});

/** One row per account and distinct layout it reported for a brick challenge. */
export const brickReports = pgTable(
  'brick_reports',
  {
    id: serial('id').primaryKey(),
    challengeId: integer('challenge_id').notNull().references(() => challenges.challengeId),
    personaId: bigint('persona_id', { mode: 'number' }).notNull(),
    layout: jsonb('layout').$type<BrickSlot[]>().notNull(),
    layoutHash: text('layout_hash').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('brick_reports_unique').on(t.challengeId, t.personaId, t.layoutHash),
    index('brick_reports_challenge').on(t.challengeId),
  ],
);

/** Accounts whose report wins outright. Managed with `npm run db:trust`. */
export const trustedAccounts = pgTable('trusted_accounts', {
  personaId: bigint('persona_id', { mode: 'number' }).primaryKey(),
  note: text('note').notNull().default(''),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 7: Generate the first migration**

Run: `npm run db:generate`
Expected: creates `server/db/migrations/0000_<name>.sql` and `server/db/migrations/meta/_journal.json`. Open the SQL and check it creates the 4 tables, both FKs, the unique index and the plain index.

- [ ] **Step 8: `server/db/index.ts`**

```ts
// Postgres connection. initDb() must succeed before the API listens; it applies pending migrations.
import { join } from 'node:path';
import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { ROOT } from '../store.js';
import * as schema from './schema.js';

let client: postgres.Sql | null = null;
export let db: PostgresJsDatabase<typeof schema>;

export async function initDb(): Promise<void> {
  try {
    process.loadEnvFile(join(ROOT, '.env')); // local dev; in the container the env comes from compose
  } catch {
    /* no .env */
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  client = postgres(url, { max: 5, onnotice: () => {} });
  db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: join(ROOT, 'server/db/migrations') });
}

export async function closeDb(): Promise<void> {
  await client?.end();
  client = null;
}

/** For writes that ride along a sync or relay: a DB hiccup is logged, never breaks the caller. */
export async function softly(what: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`[db] ${what} failed: ${(e as Error).message}`);
  }
}
```

- [ ] **Step 9: Start the DB before the API listens** — `server/index.ts`

Add to the imports:
```ts
import { initDb } from './db/index.js';
```
Immediately before `await app.listen({ port: PORT, ... });` (currently `server/index.ts:330`) add:
```ts
try {
  await initDb();
} catch (e) {
  console.error(`[db] cannot start: ${(e as Error).message}`);
  process.exit(1);
}
```

- [ ] **Step 10: Verify migrations apply**

Run: `npm run typecheck` → exit 0.
If `npm run dev` is running, `tsx watch` restarts the API by itself; otherwise run `npm run dev:api` briefly. Expected log: `FC Solver API on http://localhost:5178` and no `[db]` error.
Run: `docker exec postgresql psql -U postgres -d fcsolver -Atc "\dt"` → Expected: `brick_reports`, `challenges`, `sbc_sets`, `trusted_accounts` (plus drizzle's `__drizzle_migrations` in schema `drizzle`).
Check failure mode: `DATABASE_URL=postgres://x:y@127.0.0.1:1/x PORT=5999 node --import tsx server/index.ts` → Expected: `[db] cannot start: ...` and exit code 1 (`echo $?`).

- [ ] **Step 11: Commit**

```bash
git pull --rebase
git status --short   # .env must NOT appear
git add .gitignore .env.example package.json package-lock.json drizzle.config.ts server/db server/index.ts
git commit -m "feat(db): postgres + drizzle schema, migrate on start" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L5tvz1oKUwcQvY2AfSdzJQ"
```

---

### Task 3: Save SBCs and brick reports, read shared bricks

**Files:**
- Create: `server/db/sbcs.ts`
- Modify: `server/events.ts:117-146`, `server/sync.ts:155-175`, `server/layout.ts:77-95`

**Interfaces:**
- Consumes: `db`, `softly` (Task 2); tables (Task 2); `canonicalBricks`, `layoutHash`, `rejectReason`, `chooseLayout` (Task 1); `parseLayout`, `BrickSlot`, `ChallengeLayout` from `server/layout.ts`; `SbcSet`, `Challenge` from `server/ea.ts`.
- Produces:
  - `saveSets(sets: SbcSet[]): Promise<void>`
  - `saveChallenges(setId: number, list: Challenge[]): Promise<void>`
  - `reportBricks(challengeId: number, personaId: number, bricks: BrickSlot[], capturedAt: number): Promise<string | null>` — null when stored (or already stored), else the reject reason
  - `sharedBricks(challengeId: number): Promise<BrickSlot[] | null>`

- [ ] **Step 1: `server/db/sbcs.ts`**

```ts
// SBC history and shared brick layouts. Sets / challenges are upserted (never deleted);
// brick reports are append-only and the shared layout is voted from them (server/bricks.ts).
import { eq, sql } from 'drizzle-orm';
import type { Challenge, SbcSet } from '../ea.js';
import type { BrickSlot } from '../layout.js';
import { canonicalBricks, chooseLayout, layoutHash, rejectReason } from '../bricks.js';
import { db } from './index.js';
import { brickReports, challenges, sbcSets, trustedAccounts } from './schema.js';

const uniqueBy = <T>(list: T[], key: (x: T) => number) => [...new Map(list.map((x) => [key(x), x])).values()];

export async function saveSets(sets: SbcSet[]): Promise<void> {
  const rows = uniqueBy(sets, (s) => s.setId).map((s) => ({
    setId: s.setId,
    name: s.name ?? '',
    description: s.description ?? '',
    categoryId: s.categoryId ?? null,
    repeatabilityMode: s.repeatabilityMode ?? null,
    endTime: s.endTime ?? null,
    raw: s,
  }));
  if (!rows.length) return;
  await db.insert(sbcSets).values(rows).onConflictDoUpdate({
    target: sbcSets.setId,
    set: {
      name: sql`excluded.name`,
      description: sql`excluded.description`,
      categoryId: sql`excluded.category_id`,
      repeatabilityMode: sql`excluded.repeatability_mode`,
      endTime: sql`excluded.end_time`,
      raw: sql`excluded.raw`,
      lastSeen: sql`now()`,
    },
  });
}

export async function saveChallenges(setId: number, list: Challenge[]): Promise<void> {
  const rows = uniqueBy(list, (c) => c.challengeId).map((c) => ({
    challengeId: c.challengeId,
    setId,
    name: c.name ?? '',
    type: c.type ?? null,
    formation: c.formation ?? null,
    elgOperation: c.elgOperation ?? null,
    elgReq: c.elgReq ?? [],
    raw: c,
  }));
  if (!rows.length) return;
  // challenges can arrive before their set; keep the FK happy with a placeholder the set later fills
  await db.insert(sbcSets).values({ setId, raw: {} }).onConflictDoNothing();
  await db.insert(challenges).values(rows).onConflictDoUpdate({
    target: challenges.challengeId,
    set: {
      setId: sql`excluded.set_id`,
      name: sql`excluded.name`,
      type: sql`excluded.type`,
      formation: sql`excluded.formation`,
      elgOperation: sql`excluded.elg_operation`,
      elgReq: sql`excluded.elg_req`,
      raw: sql`excluded.raw`,
      lastSeen: sql`now()`,
    },
  });
}

const CACHE_MS = 10 * 60 * 1000; // db:trust runs in another process, so entries also expire
const chosen = new Map<number, { bricks: BrickSlot[] | null; at: number }>();

/** Store one account's view of a challenge's locked slots. Null when stored, else why it was refused. */
export async function reportBricks(
  challengeId: number, personaId: number, bricks: BrickSlot[], capturedAt: number,
): Promise<string | null> {
  const [ch] = await db.select({ type: challenges.type }).from(challenges).where(eq(challenges.challengeId, challengeId));
  if (!ch) return 'unknown challenge';
  const why = rejectReason(ch.type, bricks);
  if (why) return why;
  const layout = canonicalBricks(bricks);
  await db
    .insert(brickReports)
    .values({ challengeId, personaId, layout, layoutHash: layoutHash(layout), capturedAt: new Date(capturedAt) })
    .onConflictDoNothing();
  chosen.delete(challengeId);
  return null;
}

/** The layout everyone uses for this challenge, or null if nobody has reported one yet. */
export async function sharedBricks(challengeId: number): Promise<BrickSlot[] | null> {
  const hit = chosen.get(challengeId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.bricks;
  const rows = await db.select().from(brickReports).where(eq(brickReports.challengeId, challengeId));
  const trusted = rows.length
    ? new Set((await db.select({ id: trustedAccounts.personaId }).from(trustedAccounts)).map((r) => r.id))
    : new Set<number>();
  const bricks = chooseLayout(
    rows.map((r) => ({ personaId: r.personaId, hash: r.layoutHash, bricks: r.layout, capturedAt: r.capturedAt.getTime() })),
    trusted,
  );
  chosen.set(challengeId, { bricks, at: Date.now() });
  return bricks;
}
```

- [ ] **Step 2: Relay hooks** — `server/events.ts`

Add imports:
```ts
import { parseLayout } from './layout.js';
import { softly } from './db/index.js';
import { reportBricks, saveChallenges, saveSets } from './db/sbcs.js';
```
In `applyLoadedData`, `/sbs/sets` branch, after the `writeCache<SetsData>(...)` line:
```ts
    await softly('save sets', () => saveSets((res.categories as SetsData['categories']).flatMap((c) => c.sets ?? [])));
```
Challenges branch, after its `writeCache<Challenge[]>(...)` line:
```ts
    await softly('save challenges', () => saveChallenges(Number(setId), res.challenges as Challenge[]));
```
Challenge-squad branch, after its `writeCache(key, ...)` line and before `return 'SBC squad updated...'`:
```ts
    const layout = method === 'PUT' ? null : parseLayout(ev.response, Date.now());
    if (layout?.bricks.length)
      await softly('report bricks', async () => {
        const why = await reportBricks(Number(sbcSquad[1]), acc.id, layout.bricks, layout.capturedAt);
        if (why) console.warn(`[db] brick report for challenge ${sbcSquad[1]} refused: ${why}`);
      });
```

- [ ] **Step 3: Sync hooks** — `server/sync.ts`

Add imports:
```ts
import { softly } from './db/index.js';
import { saveChallenges, saveSets } from './db/sbcs.js';
```
In `syncSbcs`, after `await writeCache(acc.key(`challenges/${set.setId}`), ch.challenges);`:
```ts
      await softly('save challenges', () => saveChallenges(set.setId, ch.challenges));
```
Replace `return writeCache(acc.key('sets'), next);` in `syncSbcs` with:
```ts
    await softly('save sets', () => saveSets(next.categories.flatMap((c) => c.sets)));
    return writeCache(acc.key('sets'), next);
```
In `getChallenges`, replace the last two lines:
```ts
  const ch = await acc.utas.challenges(setId);
  return writeCache(key, ch.challenges);
```
with:
```ts
  const ch = await acc.utas.challenges(setId);
  await softly('save challenges', () => saveChallenges(setId, ch.challenges));
  return writeCache(key, ch.challenges);
```

- [ ] **Step 4: Read shared bricks** — `server/layout.ts`

Add import:
```ts
import { sharedBricks } from './db/sbcs.js';
```
Replace the whole `challengeLayout` function with:
```ts
/**
 * Locked slots come from the layout shared by all accounts (DB), falling back to this account's
 * own capture; players already placed always come from this account's own capture.
 * Null when neither exists (nobody has opened the challenge in the web app yet).
 */
export async function challengeLayout(acc: Account, challengeId: number): Promise<ChallengeLayout | null> {
  const caps = (await readCache<Capture[]>(acc.key(`challengeSquads/${challengeId}`)))?.data ?? [];
  // newest first; a save (PUT) answers without the requirements, so the layout comes from a load
  let layout: ChallengeLayout | null = null;
  for (const c of caps) if (c.method !== 'PUT' && (layout = parseLayout(c.response, c.at))) break;
  let shared: BrickSlot[] | null = null;
  try {
    shared = await sharedBricks(challengeId);
  } catch (e) {
    console.error(`[db] shared bricks for challenge ${challengeId} failed: ${(e as Error).message}`);
  }
  if (!layout) return shared ? { bricks: shared, placed: [], capturedAt: 0 } : null;
  if (shared) layout.bricks = shared;
  // ...but players saved after that load are the current ones: PUT body {players:[{index,itemData:{id,dream}}]}
  const save = caps.find((c) => c.method === 'PUT' && c.path.endsWith('/squad') && c.at > layout!.capturedAt);
  const saved = (save?.request as { players?: { index?: number; itemData?: { id?: number; dream?: boolean } }[] } | null)?.players;
  const locked = new Set(layout.bricks.map((b) => b.index));
  if (Array.isArray(saved))
    layout.placed = saved
      .filter((p) => num(p.index) < 11 && !locked.has(num(p.index)) && num(p.itemData?.id) > 0 && !p.itemData?.dream)
      .map((p) => ({ index: num(p.index), itemId: num(p.itemData!.id) }));
  else layout.placed = layout.placed.filter((p) => !locked.has(p.index)); // never a player on a shared locked slot
  return layout;
}
```

- [ ] **Step 5: Typecheck and tests**

Run: `npm run typecheck && npm test`
Expected: exit 0; 8 tests pass.

- [ ] **Step 6: Verify end to end on real data**

With the API running (`npm run dev`), open FC Solver in the browser, then in the FC27 web app open the SBC list and one set (the extension relays them).
Run: `docker exec postgresql psql -U postgres -d fcsolver -Atc "select count(*) from sbc_sets; select count(*) from challenges;"`
Expected: both > 0.
Insert a fake report for a challenge that is not a brick challenge from `node --import tsx -e` and expect a refusal:
```bash
node --import tsx -e "
const { initDb, closeDb, db } = await import('./server/db/index.ts');
const { reportBricks } = await import('./server/db/sbcs.ts');
const { challenges } = await import('./server/db/schema.ts');
await initDb();
const [c] = await db.select().from(challenges).limit(1);
console.log(c.type, await reportBricks(c.challengeId, 1, [{ index: 12, custom: false, nation: 0, league: 0, club: 0, rareflag: 0, positions: null }], Date.now()));
await closeDb();"
```
Expected: prints the type and a reason (`not a brick challenge` or `slot 12 out of range`); `select count(*) from brick_reports` stays 0.

- [ ] **Step 7: Commit**

```bash
git pull --rebase
git add server/db/sbcs.ts server/events.ts server/sync.ts server/layout.ts
git commit -m "feat(server): keep SBC history and share brick layouts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L5tvz1oKUwcQvY2AfSdzJQ"
```

---

### Task 4: `db:import` and `db:trust` scripts

**Files:**
- Create: `scripts/db-import.ts`, `scripts/db-trust.ts`

**Interfaces:**
- Consumes: `initDb`, `closeDb`, `db` (Task 2); `saveSets`, `saveChallenges`, `reportBricks` (Task 3); `trustedAccounts` (Task 2); `parseLayout` (`server/layout.ts`); `readCache`, `DATA_DIR` (`server/store.ts`); `SetsData` type (`server/sync.ts`).
- Produces: `npm run db:import`, `npm run db:trust <personaId> [note]`, `npm run db:trust -- --remove <personaId>`.

- [ ] **Step 1: `scripts/db-import.ts`**

```ts
// One-off backfill: copies the SBC sets, challenges and brick layouts already cached per account
// (data/accounts/<personaId>/) into Postgres. Safe to run again: everything is upserted / deduplicated.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Challenge } from '../server/ea.js';
import type { SetsData } from '../server/sync.js';
import { DATA_DIR, readCache } from '../server/store.js';
import { parseLayout } from '../server/layout.js';
import { closeDb, initDb } from '../server/db/index.js';
import { reportBricks, saveChallenges, saveSets } from '../server/db/sbcs.js';

const ids = async (dir: string) =>
  (await readdir(dir).catch(() => [] as string[])).map((f) => f.replace(/\.json$/, '')).filter((f) => /^\d+$/.test(f)).map(Number);

await initDb();
const accounts = await ids(join(DATA_DIR, 'accounts'));
let sets = 0, chals = 0, bricks = 0, refused = 0;

// sets and challenges of every account first, so brick reports find their challenge
for (const persona of accounts) {
  const s = await readCache<SetsData>(`accounts/${persona}/sets`);
  const list = s?.data.categories.flatMap((c) => c.sets) ?? [];
  await saveSets(list);
  sets += list.length;
  for (const setId of await ids(join(DATA_DIR, 'accounts', String(persona), 'challenges'))) {
    const ch = (await readCache<Challenge[]>(`accounts/${persona}/challenges/${setId}`))?.data ?? [];
    await saveChallenges(setId, ch);
    chals += ch.length;
  }
}

for (const persona of accounts) {
  for (const challengeId of await ids(join(DATA_DIR, 'accounts', String(persona), 'challengeSquads'))) {
    const caps = (await readCache<{ method: string; response: unknown; at: number }[]>(`accounts/${persona}/challengeSquads/${challengeId}`))?.data ?? [];
    for (const c of caps) {
      if (c.method === 'PUT') continue;
      const layout = parseLayout(c.response, c.at);
      if (!layout?.bricks.length) continue;
      const why = await reportBricks(challengeId, persona, layout.bricks, c.at);
      if (why) {
        refused++;
        console.warn(`challenge ${challengeId} (account ${persona}): refused, ${why}`);
      } else bricks++;
    }
  }
}

console.log(`accounts ${accounts.length}, sets ${sets}, challenges ${chals}, brick reports ${bricks}, refused ${refused}`);
await closeDb();
```

- [ ] **Step 2: `scripts/db-trust.ts`**

```ts
// Trusted accounts: their brick report wins over the vote. Usage:
//   npm run db:trust                        list
//   npm run db:trust <personaId> [note]     add / update
//   npm run db:trust -- --remove <personaId>
import { eq } from 'drizzle-orm';
import { closeDb, db, initDb } from '../server/db/index.js';
import { trustedAccounts } from '../server/db/schema.js';

const args = process.argv.slice(2);
const remove = args[0] === '--remove';
const id = Number(remove ? args[1] : args[0]);
await initDb();
if (args.length && !Number.isInteger(id)) {
  console.error('usage: npm run db:trust [<personaId> [note]] | npm run db:trust -- --remove <personaId>');
  process.exitCode = 1;
} else if (remove) {
  await db.delete(trustedAccounts).where(eq(trustedAccounts.personaId, id));
  console.log(`removed ${id}`);
} else if (args.length) {
  const note = args.slice(1).join(' ');
  await db.insert(trustedAccounts).values({ personaId: id, note }).onConflictDoUpdate({ target: trustedAccounts.personaId, set: { note } });
  console.log(`trusted ${id}`);
}
for (const t of await db.select().from(trustedAccounts)) console.log(`${t.personaId}\t${t.note}`);
console.log('(the server picks this up within 10 minutes)');
await closeDb();
```

- [ ] **Step 3: Run the import (twice) and check**

Run: `npm run db:import` → Expected: a summary line with sets and challenges > 0 (bricks may be 0: no brick capture exists locally yet).
Run it again → Expected: same summary, no errors (idempotent).
Run: `docker exec postgresql psql -U postgres -d fcsolver -Atc "select count(*) from sbc_sets; select count(*) from challenges; select count(*) from brick_reports;"` → counts match the summary (sets can be lower if accounts share sets).

- [ ] **Step 4: Check `db:trust`**

Run: `npm run db:trust 123 test` → prints `trusted 123` and the list. Run: `npm run db:trust -- --remove 123` → prints `removed 123`, list without it. Run: `npm run db:trust abc` → usage message, exit code 1.

- [ ] **Step 5: Verify the shared-layout path with a fixture report**

Pick a real brick challenge id if one exists (`select challenge_id, type from challenges where type like '%BRICK%' limit 1`). If none exists, skip this step and note it in the report: it gets verified the first time anyone opens a brick SBC.
If one exists (id `C`), store a report from a fake persona and check that an account without its own capture gets it:
```bash
node --import tsx -e "
const { initDb, closeDb } = await import('./server/db/index.ts');
const { reportBricks, sharedBricks } = await import('./server/db/sbcs.ts');
await initDb();
console.log(await reportBricks(C, 999, [{ index: 0, custom: false, nation: 0, league: 0, club: 0, rareflag: 0, positions: null }], Date.now()));
console.log(JSON.stringify(await sharedBricks(C)));
await closeDb();"
```
Expected: `null`, then the layout. Restart the API (touch `server/index.ts`), open that set in FC Solver: the challenge no longer asks to be opened in the web app. Then remove the fixture: `docker exec postgresql psql -U postgres -d fcsolver -c "delete from brick_reports where persona_id = 999"`.

- [ ] **Step 6: Commit**

```bash
git pull --rebase
git add scripts/db-import.ts scripts/db-trust.ts
git commit -m "feat(db): import cached SBCs, manage trusted accounts" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L5tvz1oKUwcQvY2AfSdzJQ"
```

---

### Task 5: Docker compose, image and docs

**Files:**
- Modify: `docker-compose.yml`, `Dockerfile`, `docs/architecture.md`, `docs/deploy.md`, `CLAUDE.md`

**Interfaces:**
- Consumes: `DATABASE_URL` contract (Task 2), scripts (Task 4).
- Produces: deployable stack; docs.

- [ ] **Step 1: `docker-compose.yml`**

Replace the file with:
```yaml
services:
  app:
    build: .
    container_name: sbc-builder
    restart: unless-stopped
    # only Apache on the host talks to it
    ports:
      - "127.0.0.1:5178:5178"
    volumes:
      - ./data:/app/data
    environment:
      SBC_DROP_TIME: "20:01"
      SBC_DROP_TZ: Europe/Bucharest
      DATABASE_URL: postgres://fcsolver:${DB_PASSWORD:?set DB_PASSWORD in .env}@db:5432/fcsolver
    depends_on:
      db:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://127.0.0.1:5178/api/meta').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 60s
      timeout: 10s
      retries: 3

  db:
    image: postgres:18-alpine
    container_name: sbc-builder-db
    restart: unless-stopped
    # no ports: only the app reaches it, over the compose network
    environment:
      POSTGRES_USER: fcsolver
      POSTGRES_DB: fcsolver
      POSTGRES_PASSWORD: ${DB_PASSWORD:?set DB_PASSWORD in .env}
    volumes:
      - ./data/postgres:/var/lib/postgresql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fcsolver -d fcsolver"]
      interval: 10s
      timeout: 5s
      retries: 5
```
(Postgres 18 images keep data under `/var/lib/postgresql/18/docker`, so the volume mounts `/var/lib/postgresql`.)

- [ ] **Step 2: `Dockerfile`**

After `COPY server ./server` add:
```dockerfile
COPY scripts ./scripts
```

- [ ] **Step 3: Validate compose and image**

Run: `DB_PASSWORD=x docker compose config >/dev/null && echo ok` → Expected: `ok`.
Run: `docker compose config 2>&1 | head -1` without `DB_PASSWORD` in the environment or `.env` → Expected: error mentioning `set DB_PASSWORD in .env`.
Run: `docker build -t sbc-builder-test .` → Expected: builds.
Smoke-test the stack in a throwaway project so production data is untouched:
```bash
mkdir -p "$TMPDIR/fcs" && cp docker-compose.yml "$TMPDIR/fcs/" && cd "$TMPDIR/fcs"
sed -i 's|build: .|image: sbc-builder-test|; s|127.0.0.1:5178:5178|127.0.0.1:5979:5178|; s|container_name: sbc-builder-db|container_name: fcs-test-db|; s|container_name: sbc-builder$|container_name: fcs-test-app|' docker-compose.yml
DB_PASSWORD=test docker compose -p fcstest up -d && sleep 20
docker compose -p fcstest logs app | tail -5
docker compose -p fcstest exec db psql -U fcsolver -Atc "\dt"
DB_PASSWORD=test docker compose -p fcstest down -v; cd - >/dev/null; rm -rf "$TMPDIR/fcs"
```
(`$TMPDIR` = the session scratchpad.) Expected: app log shows `FC Solver API on http://localhost:5178`, `\dt` lists the 4 tables. If `./data/postgres` in the scratch dir is root-owned and `rm` fails, leave it and note it.

- [ ] **Step 4: Docs**

`docs/deploy.md`:
- In `## Compose`, add: the stack has two services, `app` and `db` (`postgres:18-alpine`, data in `./data/postgres`, no host port). Put `DB_PASSWORD=<long random>` in `.env` next to `docker-compose.yml` (`openssl rand -hex 24`); compose refuses to start without it.
- In the env var list, add `DATABASE_URL` (required; set by compose in production, from `.env` locally).
- In `## First-time setup on a new host` and `## Releasing`, add: after the first deploy with the DB, run `docker compose exec app npm run db:import` once; trusted accounts with `docker compose exec app npm run db:trust <personaId> <note>`.
- Add `## Backup`: `docker compose exec db pg_dump -U fcsolver fcsolver | gzip > fcsolver-$(date +%F).sql.gz`; restore with `gunzip -c file | docker compose exec -T db psql -U fcsolver fcsolver`.

`docs/architecture.md`: add a section `## Shared data (Postgres)` after `## Data flow`: what lives in Postgres (every SBC set / challenge ever seen, brick reports, trusted accounts) vs per account JSON (club, squad, progress, meter, raw challenge-squad captures); writes ride on the relay and syncs, no extra EA calls; brick reports pass structural checks, then trusted-newest > most distinct accounts > earliest; `challengeLayout()` takes bricks from the shared layout and placed players from the account; cached 10 min.

`CLAUDE.md`:
- Layout: after the `store.ts` mention add `db/` Postgres via Drizzle (`schema.ts`, `sbcs.ts` SBC history + shared brick layouts, migrations in `db/migrations/`), `bricks.ts` pure brick rules.
- Commands: add
  ```bash
  npm test           # node:test unit tests (server/**/*.test.ts)
  npm run db:generate  # new migration after editing server/db/schema.ts
  npm run db:import    # backfill Postgres from data/accounts
  npm run db:trust     # list / add / --remove trusted accounts
  ```
  and a line: `DATABASE_URL` in `.env` (git-ignored, see `.env.example`); local DB `fcsolver` in the `postgresql` container.
- Replace "No automated test suite." with "Unit tests only for pure logic (`npm test`)."

- [ ] **Step 5: Final verification**

Run: `npm test && npm run typecheck && npm run build && npm run i18n:check`
Expected: all exit 0.
Browser check: open FC Solver, SBC list and a set still load; solving a normal SBC still works.

- [ ] **Step 6: Commit**

```bash
git pull --rebase
git add docker-compose.yml Dockerfile docs/architecture.md docs/deploy.md CLAUDE.md
git commit -m "chore(deploy): postgres service, db docs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L5tvz1oKUwcQvY2AfSdzJQ"
```
Do not push; ask the user.
