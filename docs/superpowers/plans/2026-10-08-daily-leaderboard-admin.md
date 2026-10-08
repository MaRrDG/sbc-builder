# FC Solver Daily: Leaderboard, Admin Stats and Player-Base Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An opt-in all-time leaderboard with user-chosen usernames on `/daily`, an admin "Daily" tab (per-day results for signed-in and anonymous games, full leaderboard with moderation), and clear messaging that the game only knows players FC Solver has collected so far.

**Architecture:** Pure rules in `server/daily/username.ts`, `leaderboard.ts`, `summary.ts` (unit tested). Postgres: three new `users` columns and two aggregate tables for anonymous games (Drizzle migration). DB access in `server/db/daily.ts` (extended) and `server/db/dailyProfile.ts` (new). Public endpoints in `server/daily/routes.ts`, admin endpoints in `server/admin/daily.ts` + `server/admin/routes.ts`. Web: a username prompt + leaderboard dialog in `web/src/daily/`, a Settings card, an admin tab, info lines on `/daily` and the landing teaser.

**Tech Stack:** Fastify 5, Drizzle 0.45 + Postgres, node:test via `tsx`, React 19 + Vite 8, plain CSS (OKLCH tokens), Phosphor icons, i18n en/ro/it.

**Spec:** `docs/superpowers/specs/2026-10-08-daily-leaderboard-admin-design.md` (builds on `docs/superpowers/specs/2026-10-08-daily-player-guess-design.md`, shipped).

## Global Constraints

- Read-only toward EA; no new EA call. The day's answer never reaches a non-admin browser before that game is finished. Points rules unchanged.
- Username: trimmed, 3–16 chars from `A–Z a–z 0–9 _ . -`, at least one letter or digit; unique case-insensitively (unique index on `lower(username)`). Error codes `usernameInvalid` (400), `usernameTaken` (409).
- Opt-in only: a user appears on the public leaderboard only with `leaderboard = true` AND a username AND ≥ 1 finished daily game. Signed-out, Practice and anonymous games never count.
- Ask once: after a signed-in user finishes a daily game and `leaderboard_asked_at` is null, show the prompt; any answer sets `leaderboard_asked_at`.
- Leaderboard order: wins desc → average guesses on wins asc → `reachedDay` asc (the day of the latest win) → username asc (case-insensitive). Ranks 1..n, no shared ranks. Public list: top 50. Cached 60 s, invalidated on any profile change.
- Columns: rank, username, wins, played, win % (integer), average guesses (1 decimal, wins only), current streak (info).
- Anonymous counters: aggregate only, no IP or identifier: `daily_anon_stats (day pk, finished, won, d1..d5)`, `daily_guess_counts (day, asset_id, count, pk(day, asset_id))`. Incremented when the server applies a signed-out daily guess (guess count) and when that guess finishes the game (finished / won / d<n>). Practice never counted.
- Admin endpoints require `requireAdmin(req)` like the rest of `/api/admin/*`. Admin may see the answer of any day, including today.
- Every user-facing string through `t()` in `web/src/locales/en.ts`, `ro.ts`, `it.ts` (RO `_one`/`_few`/`_other`, IT `_one`/`_other`, placeholder `{count}`); `npm run i18n:check`. Player / club names as EA sends them; usernames shown as typed.
- Server errors as `SessionError(msg, status, code)`; the site shows `t('err.<code>')`.
- UI per `DESIGN.md` and the shipped `/daily` look (web/src/daily/daily.css): dialogs are a centred modal on desktop and a bottom sheet ≤ 640 px (reuse `Sheets.tsx`); `--go` only for primary / selected; no emoji in UI (Phosphor icons); `prefers-reduced-motion`; no horizontal scroll at 390 px; tap targets ≥ 44 px on phones. Load `frontend-design:frontend-design` before UI tasks.
- New / changed endpoints → `docs/api.md`. Privacy policy line about public usernames in `web/src/legal/docs.ts` (all languages), bump `UPDATED`.
- Commits: `git pull --rebase` when the branch has an upstream (skip on a local worktree branch), then `type(scope): subject`, trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` (or the model actually used). Never push or deploy without asking.

## Review Focus

1. **Username race / case:** two users claim "Mario" and "mario" at once → one wins, the other gets `usernameTaken`, never a 500. Pinned by the unique `lower(username)` index + 23505 mapping in Task 4 and `normalizeUsername` tests in Task 1.
2. **Hidden users leaking:** a user who chose "Not now", hid themselves, or was cleared by an admin must not appear in `GET /api/daily/leaderboard` (including "your place"). Pinned by the filter in Task 4 and the `rankLeaderboard` input contract in Task 2; checked by curl in Task 5.
3. **Answer leak through the new endpoints:** `GET /api/daily` (now with `players` and `me`) and the leaderboard carry no answer data; only admin endpoints return the answer. Checked in Task 5.
4. **Prompt loops:** the prompt must not reappear after "Not now", after a reload, or on another device. Pinned by `leaderboard_asked_at` (Task 4) and `me.asked` (Task 5), checked in the browser in Task 6.
5. **Anonymous counters double-counting:** one signed-out finished game increments `finished` once. A replayed state token can inflate counts (accepted, documented); a signed-in game never touches the anon tables. Pinned in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/daily/username.ts` (+test) | `normalizeUsername`, `usernameKey` |
| `server/daily/leaderboard.ts` (+test) | `rankLeaderboard` |
| `server/daily/summary.ts` (+test) | `daySummary` (signed-in + anonymous per-day aggregation), `topGuessed` |
| `server/db/schema.ts`, `server/db/migrations/0011_*.sql` | `users.username/leaderboard/leaderboard_asked_at`, `daily_anon_stats`, `daily_guess_counts` |
| `server/db/dailyProfile.ts` (new) | profile read/update, leaderboard source rows, admin clear |
| `server/db/daily.ts` (modify) | anon counter writes, admin day reads |
| `server/daily/service.ts`, `routes.ts` (modify) | `me` + `players` in `/api/daily`, leaderboard endpoint + cache, profile endpoint, anon hooks |
| `server/admin/daily.ts` (new), `server/admin/routes.ts` (modify) | admin day + leaderboard + clear username |
| `web/src/api.ts` (modify) | types + helpers |
| `web/src/daily/ProfilePrompt.tsx`, `Leaderboard.tsx` (new), `Daily.tsx`, `Search.tsx`, `daily.css` (modify) | prompt, leaderboard dialog, info line, empty search text |
| `web/src/components/DailyProfileCard.tsx` (new), `web/src/App.tsx` (modify) | Settings card |
| `web/src/landing/DailyTeaser.tsx` (modify) | player count line |
| `web/src/route.ts` (+test), `web/src/components/admin/DailyAdmin.tsx` (new), `AdminLayout.tsx` (modify) | admin tab |
| `web/src/locales/{en,ro,it}.ts`, `web/src/legal/docs.ts`, `docs/api.md`, `CLAUDE.md` | text, privacy, docs |

---

### Task 1: Username rules

**Files:**
- Create: `server/daily/username.ts`
- Test: `server/daily/username.test.ts`

**Interfaces:**
- Produces: `normalizeUsername(raw: unknown): string | null` (trimmed valid name, else null); `usernameKey(u: string): string` (lowercase).

- [ ] **Step 1: Write the failing test**

```ts
// server/daily/username.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsername, usernameKey } from './username.js';

test('valid usernames are trimmed and kept as typed', () => {
  assert.equal(normalizeUsername('  Mario_10 '), 'Mario_10');
  assert.equal(normalizeUsername('a.b-c'), 'a.b-c');
  assert.equal(normalizeUsername('abc'), 'abc');
  assert.equal(normalizeUsername('x'.repeat(16)), 'x'.repeat(16));
});

test('invalid usernames are refused', () => {
  for (const bad of ['ab', 'x'.repeat(17), 'two words', 'émile', 'a/b', '...', '_-_', '', '   ', 42, null, undefined, {}])
    assert.equal(normalizeUsername(bad), null, String(bad));
});

test('usernameKey folds case', () => {
  assert.equal(usernameKey('MaRiO'), 'mario');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test server/daily/username.test.ts`
Expected: FAIL, cannot find module `./username.js`.

- [ ] **Step 3: Implement**

```ts
// server/daily/username.ts
// Public leaderboard names: short, plain ASCII, unique ignoring case (unique index on lower(username)).
const RE = /^[A-Za-z0-9_.-]{3,16}$/;

export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const u = raw.trim();
  return RE.test(u) && /[A-Za-z0-9]/.test(u) ? u : null;
}

export const usernameKey = (u: string) => u.toLowerCase();
```

- [ ] **Step 4: Run it, it passes**

Run: `node --import tsx --test server/daily/username.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/daily/username.ts server/daily/username.test.ts
git commit -m "feat(daily): username rules" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Leaderboard ranking

**Files:**
- Create: `server/daily/leaderboard.ts`
- Test: `server/daily/leaderboard.test.ts`

**Interfaces:**
- Consumes: `streakOf`, `Play` from `server/daily/streak.ts`.
- Produces: `interface LbInput { userId: string; username: string; plays: Play[] }` (finished plays only); `interface LbRow { rank: number; userId: string; username: string; wins: number; played: number; winPct: number; avgGuesses: number | null; streak: number; reachedDay: number }`; `rankLeaderboard(inputs: LbInput[], today: number): LbRow[]`.

- [ ] **Step 1: Write the failing test**

```ts
// server/daily/leaderboard.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankLeaderboard, type LbInput } from './leaderboard.js';
import type { Play } from './streak.js';

const p = (day: number, won: boolean, guesses: number): Play => ({ day, won, guesses });
const u = (userId: string, plays: Play[], username = userId): LbInput => ({ userId, username, plays });

test('more wins rank higher', () => {
  const r = rankLeaderboard([u('a', [p(1, true, 3)]), u('b', [p(1, true, 4), p(2, true, 4)])], 2);
  assert.deepEqual(r.map((x) => [x.rank, x.userId]), [[1, 'b'], [2, 'a']]);
});

test('ties on wins: fewer average guesses first, then who reached it earlier, then name', () => {
  const r = rankLeaderboard([
    u('slow', [p(1, true, 5)]),
    u('late', [p(3, true, 2)]),
    u('early', [p(2, true, 2)]),
    u('Bee', [p(2, true, 2)]),
    u('ant', [p(2, true, 2)]),
  ], 3);
  assert.deepEqual(r.map((x) => x.userId), ['ant', 'Bee', 'early', 'late', 'slow']);
});

test('row values: played, win %, avg on wins only (1 decimal), current streak, reachedDay', () => {
  const [row] = rankLeaderboard([u('a', [p(1, true, 2), p(2, false, 5), p(3, true, 3), p(4, true, 4)])], 4);
  assert.deepEqual(row, { rank: 1, userId: 'a', username: 'a', wins: 3, played: 4, winPct: 75, avgGuesses: 3, streak: 2, reachedDay: 4 });
  const [r2] = rankLeaderboard([u('b', [p(1, true, 1), p(2, true, 2)])], 2);
  assert.equal(r2.avgGuesses, 1.5);
});

test('users with no finished game are left out; only losses rank below any win', () => {
  const r = rankLeaderboard([u('none', []), u('lost', [p(1, false, 5)]), u('won', [p(1, true, 5)])], 1);
  assert.deepEqual(r.map((x) => x.userId), ['won', 'lost']);
  assert.equal(r[1].avgGuesses, null);
  assert.equal(r[1].winPct, 0);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test server/daily/leaderboard.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// server/daily/leaderboard.ts
// All-time Daily leaderboard: wins, then fewer guesses, then who got there first. Pure; the DB layer
// passes only opted-in users (public) or everyone (admin).
import { streakOf, type Play } from './streak.js';

export interface LbInput { userId: string; username: string; plays: Play[] }
export interface LbRow {
  rank: number; userId: string; username: string; wins: number; played: number; winPct: number;
  avgGuesses: number | null; streak: number; reachedDay: number;
}

export function rankLeaderboard(inputs: LbInput[], today: number): LbRow[] {
  const rows = inputs.flatMap((i) => {
    if (!i.plays.length) return [];
    const won = i.plays.filter((x) => x.won);
    const wins = won.length;
    const avgGuesses = wins ? Math.round((won.reduce((s, x) => s + x.guesses, 0) / wins) * 10) / 10 : null;
    return [{
      rank: 0, userId: i.userId, username: i.username, wins, played: i.plays.length,
      winPct: Math.round((wins / i.plays.length) * 100), avgGuesses,
      streak: streakOf(i.plays, today).current,
      reachedDay: wins ? Math.max(...won.map((x) => x.day)) : Number.MAX_SAFE_INTEGER,
    }];
  });
  rows.sort((a, b) =>
    b.wins - a.wins ||
    (a.avgGuesses ?? 99) - (b.avgGuesses ?? 99) ||
    a.reachedDay - b.reachedDay ||
    a.username.toLowerCase().localeCompare(b.username.toLowerCase()));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
```

Note: for a user with no win `reachedDay` is `Number.MAX_SAFE_INTEGER` internally; the test for 'lost' does not assert it. The API layer (Task 5) does not expose `reachedDay` publicly.

- [ ] **Step 4: Run it, it passes**

Run: `node --import tsx --test server/daily/leaderboard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/daily/leaderboard.ts server/daily/leaderboard.test.ts
git commit -m "feat(daily): all-time leaderboard ranking" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Per-day admin summary

**Files:**
- Create: `server/daily/summary.ts`
- Test: `server/daily/summary.test.ts`

**Interfaces:**
- Produces: `interface AnonDay { finished: number; won: number; dist: number[] }` (dist length 5); `interface SignedGame { won: boolean; guesses: number[] }` (asset ids, finished games only); `interface DaySummary { finished: number; won: number; winPct: number; dist: number[]; signedIn: { finished: number; won: number }; anon: { finished: number; won: number } }`; `daySummary(signed: SignedGame[], anon: AnonDay | null): DaySummary`; `topGuessed(signed: { guesses: number[] }[], anonCounts: { assetId: number; count: number }[], limit = 10): { assetId: number; count: number }[]` (signed-in counts include unfinished games' guesses; ties by assetId asc).

- [ ] **Step 1: Write the failing test**

```ts
// server/daily/summary.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daySummary, topGuessed } from './summary.js';

test('signed-in and anonymous games add up', () => {
  const s = daySummary(
    [{ won: true, guesses: [1, 2, 9] }, { won: false, guesses: [1, 2, 3, 4, 5] }],
    { finished: 3, won: 2, dist: [0, 1, 1, 0, 0] },
  );
  assert.deepEqual(s, {
    finished: 5, won: 3, winPct: 60, dist: [0, 1, 2, 0, 0],
    signedIn: { finished: 2, won: 1 }, anon: { finished: 3, won: 2 },
  });
});

test('no games: zeros, no division by zero', () => {
  assert.deepEqual(daySummary([], null), {
    finished: 0, won: 0, winPct: 0, dist: [0, 0, 0, 0, 0], signedIn: { finished: 0, won: 0 }, anon: { finished: 0, won: 0 },
  });
});

test('top guessed merges signed-in guesses and anonymous counts', () => {
  const t = topGuessed([{ guesses: [10, 20] }, { guesses: [10] }], [{ assetId: 20, count: 5 }, { assetId: 30, count: 1 }], 2);
  assert.deepEqual(t, [{ assetId: 20, count: 6 }, { assetId: 10, count: 2 }]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test server/daily/summary.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// server/daily/summary.ts
// Admin view of one Daily day: signed-in games (daily_plays) plus anonymous aggregate counters.
export interface AnonDay { finished: number; won: number; dist: number[] }
export interface SignedGame { won: boolean; guesses: number[] }
export interface DaySummary {
  finished: number; won: number; winPct: number; dist: number[];
  signedIn: { finished: number; won: number }; anon: { finished: number; won: number };
}

export function daySummary(signed: SignedGame[], anon: AnonDay | null): DaySummary {
  const dist = [0, 0, 0, 0, 0];
  for (const g of signed) if (g.won && g.guesses.length >= 1 && g.guesses.length <= 5) dist[g.guesses.length - 1]++;
  if (anon) anon.dist.forEach((n, i) => (dist[i] += n));
  const signedIn = { finished: signed.length, won: signed.filter((g) => g.won).length };
  const a = { finished: anon?.finished ?? 0, won: anon?.won ?? 0 };
  const finished = signedIn.finished + a.finished;
  const won = signedIn.won + a.won;
  return { finished, won, winPct: finished ? Math.round((won / finished) * 100) : 0, dist, signedIn, anon: a };
}

export function topGuessed(signed: { guesses: number[] }[], anonCounts: { assetId: number; count: number }[], limit = 10) {
  const counts = new Map<number, number>();
  for (const g of signed) for (const id of g.guesses) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const c of anonCounts) counts.set(c.assetId, (counts.get(c.assetId) ?? 0) + c.count);
  return [...counts].map(([assetId, count]) => ({ assetId, count }))
    .sort((a, b) => b.count - a.count || a.assetId - b.assetId)
    .slice(0, limit);
}
```

- [ ] **Step 4: Run it, it passes**

Run: `node --import tsx --test server/daily/summary.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add server/daily/summary.ts server/daily/summary.test.ts
git commit -m "feat(daily): per-day admin summary" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Schema, migration and DB access

**Files:**
- Modify: `server/db/schema.ts` (users columns; two tables), `server/db/daily.ts`
- Create: `server/db/dailyProfile.ts`
- Generated: `server/db/migrations/0011_*.sql`

**Interfaces:**
- Consumes: `normalizeUsername`, `usernameKey` (Task 1); `Play` (streak.ts).
- Produces:
  - `dailyProfile.ts`: `interface DailyProfile { username: string | null; leaderboard: boolean; asked: boolean }`; `profileOf(userId: string): Promise<DailyProfile>`; `updateProfile(userId: string, p: { username?: string; leaderboard?: boolean; asked?: boolean }): Promise<DailyProfile | 'usernameTaken' | 'usernameRequired'>`; `leaderboardSource(all: boolean): Promise<{ userId: string; username: string | null; email: string; leaderboard: boolean; plays: Play[] }[]>` (`all=false`: only `leaderboard = true AND username IS NOT NULL`); `clearUsername(userId: string): Promise<boolean>`.
  - `daily.ts`: `recordAnonGuess(day: number, assetId: number, finish: { won: boolean; guesses: number } | null): Promise<void>`; `anonDay(day: number): Promise<AnonDay | null>`; `anonGuessCounts(day: number): Promise<{ assetId: number; count: number }[]>`; `signedGamesOf(day: number): Promise<{ userId: string; email: string; username: string | null; guesses: number[]; won: boolean; finishedAt: number | null }[]>`; `answerDays(): Promise<{ day: number; date: string; assetId: number }[]>`.

- [ ] **Step 1: Schema**

In `server/db/schema.ts`, add to `users` (keep the existing comment style):

```ts
  // FC Solver Daily leaderboard: public name (unique ignoring case), opt-in, and when we asked (asked once)
  username: text('username'),
  leaderboard: boolean('leaderboard').notNull().default(false),
  leaderboardAskedAt: timestamp('leaderboard_asked_at', { withTimezone: true }),
```

and extend its index list: `uniqueIndex('users_username_lower').on(sql\`lower(${t.username})\`)` (keep the existing founder index). Append:

```ts
/** Daily game: signed-out games, aggregate only (no IP, no id). Signed-in games are in daily_plays. */
export const dailyAnonStats = pgTable('daily_anon_stats', {
  day: integer('day').primaryKey(),
  finished: integer('finished').notNull().default(0),
  won: integer('won').notNull().default(0),
  d1: integer('d1').notNull().default(0),
  d2: integer('d2').notNull().default(0),
  d3: integer('d3').notNull().default(0),
  d4: integer('d4').notNull().default(0),
  d5: integer('d5').notNull().default(0),
});

/** Daily game: how often each player was tried in signed-out games, per day. */
export const dailyGuessCounts = pgTable(
  'daily_guess_counts',
  { day: integer('day').notNull(), assetId: integer('asset_id').notNull(), count: integer('count').notNull().default(0) },
  (t) => [primaryKey({ columns: [t.day, t.assetId] })],
);
```

Run `npm run db:generate`; read the generated `0011_*.sql`: only `ALTER TABLE users ADD COLUMN …`, `CREATE UNIQUE INDEX users_username_lower …`, two `CREATE TABLE`; no DROP. Apply locally the way the server does (start `npm run dev:api` once, `initDb()` migrates) and check `\d users`.

- [ ] **Step 2: Profile + leaderboard source (`server/db/dailyProfile.ts`)**

```ts
// Daily leaderboard profile of a user (username, opt-in, asked once) and the leaderboard's source rows.
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from './index.js';
import { dailyPlays, users } from './schema.js';
import type { Play } from '../daily/streak.js';

export interface DailyProfile { username: string | null; leaderboard: boolean; asked: boolean }

export async function profileOf(userId: string): Promise<DailyProfile> {
  const [r] = await db.select({ username: users.username, leaderboard: users.leaderboard, askedAt: users.leaderboardAskedAt })
    .from(users).where(eq(users.id, userId));
  return { username: r?.username ?? null, leaderboard: !!r?.leaderboard, asked: !!r?.askedAt };
}

/** Any update also marks the prompt as answered. A taken username maps the unique-index error. */
export async function updateProfile(userId: string, p: { username?: string; leaderboard?: boolean; asked?: boolean }):
  Promise<DailyProfile | 'usernameTaken' | 'usernameRequired'> {
  const cur = await profileOf(userId);
  const username = p.username ?? cur.username;
  if (p.leaderboard && !username) return 'usernameRequired';
  try {
    await db.update(users).set({
      ...(p.username !== undefined ? { username: p.username } : {}),
      ...(p.leaderboard !== undefined ? { leaderboard: p.leaderboard } : {}),
      leaderboardAskedAt: sql`coalesce(${users.leaderboardAskedAt}, now())`,
    }).where(eq(users.id, userId));
  } catch (e) {
    if ((e as { code?: string }).code === '23505') return 'usernameTaken';
    throw e;
  }
  return profileOf(userId);
}

export async function clearUsername(userId: string): Promise<boolean> {
  const r = await db.update(users).set({ username: null, leaderboard: false }).where(eq(users.id, userId)).returning({ id: users.id });
  return r.length > 0;
}

/** Finished plays per user; public = opted in with a username, admin = everyone who played. */
export async function leaderboardSource(all: boolean) {
  const rows = await db.select({
    userId: dailyPlays.userId, day: dailyPlays.day, won: dailyPlays.won, guesses: dailyPlays.guesses,
    username: users.username, email: users.email, leaderboard: users.leaderboard,
  }).from(dailyPlays).innerJoin(users, eq(users.id, dailyPlays.userId))
    .where(all ? isNotNull(dailyPlays.finishedAt) : and(isNotNull(dailyPlays.finishedAt), eq(users.leaderboard, true), isNotNull(users.username)));
  const by = new Map<string, { userId: string; username: string | null; email: string; leaderboard: boolean; plays: Play[] }>();
  for (const r of rows) {
    let u = by.get(r.userId);
    if (!u) by.set(r.userId, (u = { userId: r.userId, username: r.username, email: r.email, leaderboard: r.leaderboard, plays: [] }));
    u.plays.push({ day: r.day, won: r.won, guesses: r.guesses.length });
  }
  return [...by.values()];
}
```

The Drizzle error for a unique violation may wrap the postgres error (`e.cause.code`); check both `e.code` and `(e as { cause?: { code?: string } }).cause?.code` and verify with the race check in Task 5.

- [ ] **Step 3: Anonymous counters + admin reads (`server/db/daily.ts`)**

Append (merge imports):

```ts
import { dailyAnonStats, dailyGuessCounts, users } from './schema.js';
import type { AnonDay } from '../daily/summary.js';

/** A signed-out daily guess: count the tried player; when it finished the game, count the game. */
export async function recordAnonGuess(day: number, assetId: number, finish: { won: boolean; guesses: number } | null): Promise<void> {
  await db.insert(dailyGuessCounts).values({ day, assetId, count: 1 })
    .onConflictDoUpdate({ target: [dailyGuessCounts.day, dailyGuessCounts.assetId], set: { count: sql`${dailyGuessCounts.count} + 1` } });
  if (!finish) return;
  const d = finish.won && finish.guesses >= 1 && finish.guesses <= 5 ? (`d${finish.guesses}` as const) : null;
  await db.insert(dailyAnonStats).values({ day, finished: 1, won: finish.won ? 1 : 0, ...(d ? { [d]: 1 } : {}) })
    .onConflictDoUpdate({
      target: dailyAnonStats.day,
      set: {
        finished: sql`${dailyAnonStats.finished} + 1`,
        won: sql`${dailyAnonStats.won} + ${finish.won ? 1 : 0}`,
        ...(d ? { [d]: sql`${dailyAnonStats[d]} + 1` } : {}),
      },
    });
}

export async function anonDay(day: number): Promise<AnonDay | null> {
  const [r] = await db.select().from(dailyAnonStats).where(eq(dailyAnonStats.day, day));
  return r ? { finished: r.finished, won: r.won, dist: [r.d1, r.d2, r.d3, r.d4, r.d5] } : null;
}

export async function anonGuessCounts(day: number) {
  return db.select({ assetId: dailyGuessCounts.assetId, count: dailyGuessCounts.count }).from(dailyGuessCounts).where(eq(dailyGuessCounts.day, day));
}

export async function signedGamesOf(day: number) {
  const rows = await db.select({
    userId: dailyPlays.userId, email: users.email, username: users.username, guesses: dailyPlays.guesses,
    won: dailyPlays.won, finishedAt: dailyPlays.finishedAt,
  }).from(dailyPlays).innerJoin(users, eq(users.id, dailyPlays.userId)).where(eq(dailyPlays.day, day));
  return rows.map((r) => ({ ...r, finishedAt: r.finishedAt ? r.finishedAt.getTime() : null }));
}

export async function answerDays() {
  return db.select({ day: dailyAnswers.day, date: dailyAnswers.date, assetId: dailyAnswers.assetId }).from(dailyAnswers).orderBy(desc(dailyAnswers.day));
}
```

(`desc` from drizzle-orm; keep existing imports deduplicated.)

- [ ] **Step 4: Verify and commit**

Run: `npm test && npm run typecheck`
Expected: pass, clean.

```bash
git add server/db/schema.ts server/db/migrations server/db/dailyProfile.ts server/db/daily.ts
git commit -m "feat(daily): leaderboard profile and anonymous counters schema" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Public and admin API

**Files:**
- Modify: `server/daily/service.ts`, `server/daily/routes.ts`, `server/admin/routes.ts`, `docs/api.md`
- Create: `server/admin/daily.ts`

**Interfaces:**
- Consumes: Tasks 1–4; `requireAdmin` (`server/admin/auth.ts`); `playerById`, `namesList` (store.ts); `createLimiter`.
- Produces (HTTP, documented in `docs/api.md`):
  - `GET /api/daily` adds `players: number` (size of the autocomplete list) always, and `me: DailyProfile` when signed in.
  - `GET /api/daily/leaderboard` (public; optional auth) → `{ rows: PublicLbRow[]; me: (PublicLbRow & { inTop: boolean }) | null; total: number }` where `PublicLbRow = { rank, username, wins, played, winPct, avgGuesses, streak }` (no userId, no reachedDay). Top 50. `me` only when signed in, opted in and ranked. `Cache-Control: no-store`.
  - `PUT /api/me/daily-profile` (signed in) body `{ username?: string; leaderboard?: boolean; asked?: true }` → `DailyProfile`. Errors `usernameInvalid` 400 (normalizeUsername null), `usernameTaken` 409, `usernameRequired` 400. Per-IP limit 20/min.
  - `GET /api/admin/daily?day=N` → `{ days: { day; date }[]; day: number; date: string; answer: { id; name; fullName; rating; position; club; league; nation; rareflag; cardType } | null; summary: DaySummary; topGuessed: { id; name; count }[]; games: { userId; email; username; guesses: { id; name }[]; won; used; finishedAt }[] }` (default day = latest).
  - `GET /api/admin/daily/leaderboard` → `{ rows: (LbRow & { email: string; hidden: boolean; username: string | null })[] }` (all users with a finished game; `username` falls back to null, `hidden = !leaderboard || !username`).
  - `POST /api/admin/daily/users/:id/clear-username` → `{ ok: true }` (404 unknown user).

- [ ] **Step 1: Leaderboard cache + public endpoints**

In `service.ts`:

```ts
let lbCache: { at: number; rows: LbRow[] } | null = null;
export const invalidateLeaderboard = () => { lbCache = null; };

export async function publicLeaderboard(userId: string | null) {
  const t = await todayGame();
  if (!lbCache || Date.now() - lbCache.at > 60_000)
    lbCache = { at: Date.now(), rows: rankLeaderboard((await leaderboardSource(false)).map((s) => ({ userId: s.userId, username: s.username!, plays: s.plays })), t.day) };
  const pub = (r: LbRow) => ({ rank: r.rank, username: r.username, wins: r.wins, played: r.played, winPct: r.winPct, avgGuesses: r.avgGuesses, streak: r.streak });
  const mine = userId ? lbCache.rows.find((r) => r.userId === userId) : undefined;
  return { rows: lbCache.rows.slice(0, 50).map(pub), me: mine ? { ...pub(mine), inTop: mine.rank <= 50 } : null, total: lbCache.rows.length };
}
```

In `dailyInfo`, add `players: namesList().players.length` (after `await loadPlayers()`) to `base`, and `me: await profileOf(userId)` for signed-in users.

In `guessToday`'s signed-out branch, after a successful `applyGuess` (`p` has no error), call `await recordAnonGuess(t.day, assetId, p.finished ? { won: p.won, guesses: p.guesses.length } : null).catch((e) => console.warn('[daily] anon count failed:', (e as Error).message))` — a counter failure never fails the guess. Never in the signed-in branch, never in practice.

In `routes.ts`:

```ts
const profileLimit = createLimiter({ windowMs: 60_000, max: 20 });

app.get('/api/daily/leaderboard', async (req, reply) => {
  reply.header('Cache-Control', 'no-store');
  return publicLeaderboard(await optionalSiteUser(req));
});

app.put<{ Body: { username?: unknown; leaderboard?: unknown; asked?: unknown } }>('/api/me/daily-profile', async (req) => {
  const userId = await siteUser(req);
  if (!profileLimit(req.ip)) throw tooMany();
  const b = req.body ?? {};
  let username: string | undefined;
  if (b.username !== undefined) {
    const n = normalizeUsername(b.username);
    if (!n) throw new SessionError('Pick 3-16 letters, digits, _ . or -.', 400, 'usernameInvalid');
    username = n;
  }
  const r = await updateProfile(userId, {
    username,
    leaderboard: typeof b.leaderboard === 'boolean' ? b.leaderboard : undefined,
    asked: b.asked === true ? true : undefined,
  });
  if (r === 'usernameTaken') throw new SessionError('That username is taken.', 409, 'usernameTaken');
  if (r === 'usernameRequired') throw new SessionError('Pick a username first.', 400, 'usernameRequired');
  invalidateLeaderboard();
  return r;
});
```

- [ ] **Step 2: Admin (`server/admin/daily.ts` + routes)**

`adminDay(dayParam)`: `answerDays()` → pick the requested day or the latest; `answer` from `playerById(assetId)` (full answer fields); `signedGamesOf(day)`; `anonDay(day)`, `anonGuessCounts(day)`; `daySummary(finishedSignedGames, anon)` where finished = `finishedAt !== null`; `topGuessed(signedGames (all), anonCounts)` mapped to `{ id, name: playerById(id)?.name ?? String(id), count }`; games mapped with guess names and `used = guesses.length`, sorted by `finishedAt` desc (unfinished last). `adminLeaderboard()`: `rankLeaderboard(leaderboardSource(true).map(s => ({ userId, username: s.username ?? s.email, plays })), today)` joined back to email / hidden / real username. Register in `server/admin/routes.ts` with `await requireAdmin(req)` first in each handler; clear-username calls `clearUsername` then `invalidateLeaderboard()`.

- [ ] **Step 3: curl checks (dev API running)**

```bash
curl -s localhost:5178/api/daily | head -c 300                      # has "players":N, no "me"
curl -s localhost:5178/api/daily/leaderboard                       # {"rows":[],"me":null,"total":0} or opted-in rows only
curl -s -X PUT localhost:5178/api/me/daily-profile -H 'content-type: application/json' -d '{"username":"x"}'   # 401 signIn
curl -s localhost:5178/api/admin/daily                              # 401/403
```

Plus a throwaway script (scratchpad, not committed) against the local DB with fake users `test-lb-a`, `test-lb-b`: `updateProfile` both to "Mario" / "mario" concurrently → one profile, one `usernameTaken`; opt one in, add finished plays, `publicLeaderboard(null)` shows only the opted-in one; `clearUsername` removes them; `recordAnonGuess` finishing twice → `finished = 2`. Delete every row created for those ids at the end and verify 0 remain.

- [ ] **Step 4: Docs and commit**

Document every new/changed endpoint in `docs/api.md` (shapes above, errors, limits, that anonymous counters can be inflated by replayed state tokens and hold no identifiers).

Run: `npm test && npm run typecheck`

```bash
git add server/daily server/admin docs/api.md
git commit -m "feat(daily): leaderboard, profile and admin day API" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Username prompt, leaderboard dialog, Settings card

Load `frontend-design:frontend-design` first. Read `web/src/daily/Daily.tsx`, `Sheets.tsx`, `EndPanel.tsx`, `daily.css`, `web/src/components/EmailAlertsCard.tsx` (Settings card pattern) before writing.

**Files:**
- Modify: `web/src/api.ts`, `web/src/daily/Daily.tsx`, `web/src/daily/EndPanel.tsx`, `web/src/daily/daily.css`, `web/src/App.tsx`, locales
- Create: `web/src/daily/ProfilePrompt.tsx`, `web/src/daily/Leaderboard.tsx`, `web/src/components/DailyProfileCard.tsx`

**Interfaces:**
- Consumes: Task 5 endpoints.
- Produces: `api.daily.leaderboard()`, `api.daily.saveProfile(p)`; types `DailyProfile`, `DailyLbRow`, `DailyLeaderboard`; `DailyInfo` gains `players: number` and `me?: DailyProfile`.

**Behaviour:**
- **Prompt** (`ProfilePrompt`): opens once when a signed-in daily game becomes finished (also when loading an already-finished game) and `info.me.asked === false`, ~1.2 s after the reveal (immediately with reduced motion), before the stats dialog on phones. Title "Want to appear on the leaderboard?", one-line explanation (public: username, wins, games, streak), username input (`maxLength=16`, `autocomplete="nickname"`, live format hint, server error shown under it via `errorText`), primary **Yes, show me** (`--go`), secondary **Not now**. Yes → `saveProfile({ username, leaderboard: true, asked: true })`; Not now → `saveProfile({ asked: true })`; both close it and update `info.me`. Closing with Esc / backdrop counts as Not now.
- **Leaderboard dialog** (`Leaderboard`): a **Leaderboard** button (Phosphor `Trophy`) next to Stats/How to play on `/daily`. Same dialog shell as the other sheets. Table: rank, username, wins, win %, avg guesses, streak (`Fire` icon + number). Top 3 ranks get a subtle gold / silver / bronze rank chip (not colour alone: the number stays). Signed-in & opted in & outside the top 50 → a separated "Your place" row; signed-in & not opted in → a line "You're not on the leaderboard" + button that opens the prompt; signed out → a line inviting sign-in. Empty → "No one on the leaderboard yet. Win a daily game and join." Loading / error states.
- **Settings card** (`DailyProfileCard`) in Settings next to `EmailAlertsCard`: username field + Save, a toggle "Show me on the Daily leaderboard" (disabled until a username exists), short note that it's public. Uses the same endpoint; reflects server errors.
- 390 px: table scrolls vertically only; columns collapse (hide played and avg under 420 px).
- Text (en / ro / it; exact strings):

| key | en | ro | it |
|---|---|---|---|
| `daily.lb.button` | `Leaderboard` | `Clasament` | `Classifica` |
| `daily.lb.title` | `All-time leaderboard` | `Clasament all-time` | `Classifica di sempre` |
| `daily.lb.rank` | `#` | `#` | `#` |
| `daily.lb.player` | `Player` | `Jucător` | `Giocatore` |
| `daily.lb.wins` | `Wins` | `Victorii` | `Vittorie` |
| `daily.lb.winPct` | `Win %` | `% victorii` | `% vittorie` |
| `daily.lb.avg` | `Avg guesses` | `Medie încercări` | `Media tentativi` |
| `daily.lb.streak` | `Streak` | `Serie` | `Serie` |
| `daily.lb.you` | `Your place` | `Locul tău` | `La tua posizione` |
| `daily.lb.notIn` | `You're not on the leaderboard.` | `Nu apari în clasament.` | `Non sei in classifica.` |
| `daily.lb.join` | `Join the leaderboard` | `Intră în clasament` | `Entra in classifica` |
| `daily.lb.signIn` | `Sign in, win daily games and join the leaderboard.` | `Autentifică-te, câștigă jocuri zilnice și intră în clasament.` | `Accedi, vinci le partite giornaliere ed entra in classifica.` |
| `daily.lb.empty` | `No one on the leaderboard yet. Win a daily game and join.` | `Nimeni în clasament încă. Câștigă un joc zilnic și intră.` | `Ancora nessuno in classifica. Vinci una partita giornaliera ed entra.` |
| `daily.prompt.title` | `Want to appear on the leaderboard?` | `Vrei să apari în clasament?` | `Vuoi comparire in classifica?` |
| `daily.prompt.text` | `Your username, wins, games and streak will be public. You can change this anytime in Settings.` | `Username-ul, victoriile, jocurile și seria ta vor fi publice. Poți schimba oricând din Setări.` | `Il tuo username, le vittorie, le partite e la serie saranno pubblici. Puoi cambiarlo quando vuoi nelle Impostazioni.` |
| `daily.prompt.username` | `Username` | `Username` | `Username` |
| `daily.prompt.hint` | `3-16 letters, digits, _ . or -` | `3-16 litere, cifre, _ . sau -` | `3-16 lettere, cifre, _ . o -` |
| `daily.prompt.yes` | `Yes, show me` | `Da, vreau să apar` | `Sì, mostrami` |
| `daily.prompt.no` | `Not now` | `Nu acum` | `Non ora` |
| `settings.daily.title` | `Daily leaderboard` | `Clasament Daily` | `Classifica Daily` |
| `settings.daily.text` | `Your username is public on the FC Solver Daily leaderboard when you're shown on it.` | `Username-ul tău e public în clasamentul FC Solver Daily când apari în el.` | `Il tuo username è pubblico nella classifica di FC Solver Daily quando ci compari.` |
| `settings.daily.show` | `Show me on the Daily leaderboard` | `Arată-mă în clasamentul Daily` | `Mostrami nella classifica Daily` |
| `settings.daily.save` | `Save` | `Salvează` | `Salva` |
| `settings.daily.saved` | `Saved` | `Salvat` | `Salvato` |
| `err.usernameInvalid` | `Use 3-16 letters, digits, _ . or -.` | `Folosește 3-16 litere, cifre, _ . sau -.` | `Usa 3-16 lettere, cifre, _ . o -.` |
| `err.usernameTaken` | `That username is taken. Try another one.` | `Username-ul e deja folosit. Încearcă altul.` | `Username già in uso. Provane un altro.` |
| `err.usernameRequired` | `Pick a username first.` | `Alege întâi un username.` | `Scegli prima un username.` |

- [ ] **Step 1: Build** the API helpers, the three components and the wiring.
- [ ] **Step 2: Browser check** (claude-in-chrome, new tab; dev server running; signed in with the local Clerk dev session): prompt appears after a finished game, "Not now" → never again (reload); Settings card sets a username and opt-in; leaderboard dialog shows the row; at 1280 and in a 390 px iframe; reduced-motion by CSS reading. Don't leave test usernames on the user's account: restore the profile to how it was (or tell the user what was set).
- [ ] **Step 3: Verify and commit**

Run: `npm test && npm run typecheck && npm run i18n:check && npm run build`

```bash
git add web/src locales
git commit -m "feat(daily): leaderboard dialog, username prompt and settings card" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Player-base visibility

**Files:**
- Modify: `web/src/daily/Daily.tsx`, `web/src/daily/Search.tsx`, `web/src/daily/daily.css`, `web/src/landing/DailyTeaser.tsx`, `web/src/landing/landing.css`, locales

**Behaviour:**
- `/daily`, under the title (both Today and Practice): a permanent info line, Phosphor `Database` icon, `--ink-2`, not dismissible, wraps on phones: `daily.base.line` with `{count}` = `players.length` of the autocomplete list (formatted with `toLocaleString(lang)`), hidden until the list is loaded.
- Search empty state: replace `daily.search.none` text with `daily.search.notInBase`.
- Landing teaser: under the demo, a small line `landing.daily.count` with `{count}` from `api.daily.info()` → `players` (the teaser already calls it); hidden when missing.
- Text (plurals by `{count}`):

| key | en | ro | it |
|---|---|---|---|
| `daily.base.line_one` | `{count} player in the FC Solver database so far. The game only uses players FC Solver has collected; the more people use FC Solver, the more players appear.` | `{count} jucător în baza FC Solver până acum. Jocul folosește doar jucătorii colectați de FC Solver; cu cât îl folosesc mai mulți oameni, cu atât apar mai mulți.` | `{count} giocatore nel database di FC Solver finora. Il gioco usa solo i giocatori raccolti da FC Solver; più persone usano FC Solver, più giocatori compaiono.` |
| `daily.base.line_few` | — | `{count} jucători în baza FC Solver până acum. Jocul folosește doar jucătorii colectați de FC Solver; cu cât îl folosesc mai mulți oameni, cu atât apar mai mulți.` | — |
| `daily.base.line_other` | `{count} players in the FC Solver database so far. The game only uses players FC Solver has collected; the more people use FC Solver, the more players appear.` | `{count} de jucători în baza FC Solver până acum. Jocul folosește doar jucătorii colectați de FC Solver; cu cât îl folosesc mai mulți oameni, cu atât apar mai mulți.` | `{count} giocatori nel database di FC Solver finora. Il gioco usa solo i giocatori raccolti da FC Solver; più persone usano FC Solver, più giocatori compaiono.` |
| `daily.search.notInBase` | `Not in the FC Solver database yet. It grows as more people use FC Solver.` | `Nu e încă în baza FC Solver. Baza crește pe măsură ce tot mai mulți oameni folosesc FC Solver.` | `Non è ancora nel database di FC Solver. Cresce man mano che più persone usano FC Solver.` |
| `landing.daily.count_one` | `{count} player collected so far, and growing` | `{count} jucător colectat până acum, și tot mai mulți` | `{count} giocatore raccolto finora, e in crescita` |
| `landing.daily.count_few` | — | `{count} jucători colectați până acum, și tot mai mulți` | — |
| `landing.daily.count_other` | `{count} players collected so far, and growing` | `{count} de jucători colectați până acum, și tot mai mulți` | `{count} giocatori raccolti finora, e in crescita` |

Remove the now-unused `daily.search.none` key if nothing else uses it (i18n:check reports unused keys).

- [ ] **Step 1: Build**, **Step 2: browser check** at 1280 and 390 (line wraps cleanly, no overflow; empty search shows the new text; teaser line shows the number), **Step 3: verify + commit**

Run: `npm test && npm run typecheck && npm run i18n:check && npm run build`

```bash
git add web/src
git commit -m "feat(daily): show how many players the game knows" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Admin "Daily" tab

Load `frontend-design:frontend-design` first. Read `web/src/components/admin/AdminLayout.tsx`, `Overview.tsx`, `DataTable.tsx`, `BarChart.tsx`, `KpiCard.tsx`, `useLoad.ts`, `web/src/route.ts` (`AdminPage`, `ADMIN_TABS`, `parseRoute`, `routePath`).

**Files:**
- Modify: `web/src/route.ts` (+ `route.test.ts`), `web/src/components/admin/AdminLayout.tsx`, `web/src/api.ts`, locales
- Create: `web/src/components/admin/DailyAdmin.tsx`

**Behaviour:**
- `AdminPage` gains `'daily'`; `ADMIN_TABS` gains `{ page: 'daily', key: 'admin.tab.daily' }`; path `/dashboard/admin/daily` with query `day=N&view=day|leaderboard`. Route test: `parseRoute('/dashboard/admin/daily')` → `{ view: 'admin', page: 'daily', … }` and back.
- **Day view:** day selector (prev / next buttons + select of `days`), the answer as a small `Card` (it's admin, revealing today's answer is fine), KPI cards (finished, won, win %, signed-in vs anonymous), guess distribution via `BarChart`, "Most tried" list (name + count), and a `DataTable` of signed-in games: user (username or email, link to the user detail page), guesses as player names joined by " → ", result (won n/5 / lost), finished time (local). Empty day → an empty state line.
- **Leaderboard view:** `DataTable` of all ranked users: rank, username (or "—"), email, wins, played, win %, avg, streak, a "hidden" badge, and a **Clear username** button (confirm with an inline second click, not a browser `confirm()`), which refreshes the list.
- Text (en / ro / it):

| key | en | ro | it |
|---|---|---|---|
| `admin.tab.daily` | `Daily` | `Daily` | `Daily` |
| `admin.daily.day` | `Day #{n}` | `Ziua #{n}` | `Giorno #{n}` |
| `admin.daily.answer` | `Answer` | `Răspuns` | `Risposta` |
| `admin.daily.finished` | `Finished` | `Terminate` | `Finite` |
| `admin.daily.won` | `Won` | `Câștigate` | `Vinte` |
| `admin.daily.winPct` | `Win %` | `% câștigate` | `% vinte` |
| `admin.daily.signedIn` | `Signed in` | `Autentificați` | `Con accesso` |
| `admin.daily.anon` | `Anonymous` | `Anonimi` | `Anonimi` |
| `admin.daily.dist` | `Guess distribution` | `Distribuția încercărilor` | `Distribuzione dei tentativi` |
| `admin.daily.mostTried` | `Most tried` | `Cei mai încercați` | `I più provati` |
| `admin.daily.games` | `Signed-in games` | `Jocuri autentificate` | `Partite con accesso` |
| `admin.daily.user` | `User` | `Utilizator` | `Utente` |
| `admin.daily.guesses` | `Guesses` | `Încercări` | `Tentativi` |
| `admin.daily.result` | `Result` | `Rezultat` | `Risultato` |
| `admin.daily.resultWon` | `Won {n}/5` | `Câștigat {n}/5` | `Vinto {n}/5` |
| `admin.daily.resultLost` | `Lost` | `Pierdut` | `Perso` |
| `admin.daily.resultPlaying` | `Playing` | `În joc` | `In corso` |
| `admin.daily.finishedAt` | `Finished at` | `Terminat la` | `Finito alle` |
| `admin.daily.empty` | `No games this day yet.` | `Niciun joc în ziua asta încă.` | `Nessuna partita in questo giorno.` |
| `admin.daily.viewDay` | `Day` | `Zi` | `Giorno` |
| `admin.daily.viewLb` | `Leaderboard` | `Clasament` | `Classifica` |
| `admin.daily.hidden` | `hidden` | `ascuns` | `nascosto` |
| `admin.daily.clear` | `Clear username` | `Șterge username` | `Cancella username` |
| `admin.daily.clearConfirm` | `Click again to clear` | `Apasă din nou ca să ștergi` | `Clicca di nuovo per cancellare` |

- [ ] **Step 1: Build**, **Step 2: browser check** as admin (the user's dev account is admin) at 1280 and 390, **Step 3: verify + commit**

Run: `node --import tsx --test web/src/route.test.ts && npm test && npm run typecheck && npm run i18n:check && npm run build`

```bash
git add web/src
git commit -m "feat(admin): daily tab with day stats and leaderboard" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Privacy text, docs, final verification and review

**Files:**
- Modify: `web/src/legal/docs.ts` (privacy `data` section, all languages; `UPDATED`), `CLAUDE.md`

- [ ] **Step 1: Privacy line** (one more list item in the privacy `data` section, same paragraph count in every language):
  - EN: `'- FC Solver Daily leaderboard, only if you choose to appear: your username, wins, games played and streak are public on /daily. You can hide yourself or change the username in Settings at any time. Signed-out games are counted only as anonymous totals.'`
  - RO: `'- Clasamentul FC Solver Daily, doar dacă alegi să apari: username-ul, victoriile, jocurile și seria ta sunt publice pe /daily. Te poți ascunde sau poți schimba username-ul oricând din Setări. Jocurile fără cont sunt numărate doar ca totaluri anonime.'`
  - IT: `'- Classifica di FC Solver Daily, solo se scegli di comparire: il tuo username, le vittorie, le partite giocate e la serie sono pubblici su /daily. Puoi nasconderti o cambiare username in qualsiasi momento nelle Impostazioni. Le partite senza accesso sono contate solo come totali anonimi.'`
  Set `UPDATED` to the commit date. Run `node --import tsx --test web/src/legal/docs.test.ts`.
- [ ] **Step 2: CLAUDE.md** Layout: add `username.ts`, `leaderboard.ts`, `summary.ts` to the `daily/` line; `admin/daily.ts`; `components/admin/` mentions the Daily tab.
- [ ] **Step 3: Full checks with real output:** `npm test`, `npm run typecheck`, `npm run i18n:check`, `npm run build`.
- [ ] **Step 4: Browser pass:** `/daily` (info line, empty search text, leaderboard dialog, prompt), Settings card, landing teaser count, admin Daily tab (day + leaderboard), at 1280 and 390; no `[csp]` warnings.
- [ ] **Step 5: Whole-branch review** (superpowers:requesting-code-review) with the Review Focus list; one fix wave; then superpowers:finishing-a-development-branch. Production deploy needs only `git pull && docker compose up -d --build` (migration runs on start); no import step. Never push or deploy without asking.

```bash
git add web/src/legal/docs.ts CLAUDE.md
git commit -m "docs(daily): leaderboard privacy and layout" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```
