# FC Solver Daily (guess the player) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public `/daily` "guess the player" game (5 guesses, 6 compared tiles, silhouette after 3 misses, unlimited Practice), fed by a `players` table built from cache writes, with server-verified streak points for signed-in users, a landing teaser and a dashboard entry.

**Architecture:** All rules are pure modules under `server/daily/` (players merge, pool, tiles, streak/points, day numbering, tokens, game progress), unit tested with `node:test`. A thin DB layer (`server/db/daily.ts`) and a service (`server/daily/service.ts`) wire them to Postgres, the `onCacheWrite` listener and Fastify routes (`server/daily/routes.ts`). The web game is its own lazy chunk (`web/src/daily/`), rendered by `Root.tsx` outside the dashboard, with pure helpers (search, share text, local stats) tested on their own.

**Tech Stack:** Fastify 5, Drizzle 0.45 + Postgres, `node:crypto` (HKDF, HMAC-SHA256, AES-256-GCM), node:test via `tsx`, React 19 + Vite 8, plain CSS with OKLCH tokens, Phosphor icons, i18n en/ro/it.

**Spec:** `docs/superpowers/specs/2026-10-08-daily-player-guess-design.md`

## Global Constraints

- Read-only toward EA: no new EA call, no new job recipe. Players come only from cache writes (`onCacheWrite`) and the one-off backfill from `data/accounts`.
- The answer of a game (asset id, name, portrait URL) never reaches the browser before that game is finished. The silhouette carries only `rating`, `position`, `rareflag`, `cardType`; it never loads the portrait.
- Points only from server-verified daily wins of signed-in users: streak 7 → +1, 14 → +1, 30 → +2, repeating every 30 (37 → +1, 44 → +1, 60 → +2 …). One grant per `(userId, day)`: `point_ledger` reason `daily_streak`, `ref` = day number, unique partial index. Practice and anonymous games: no streak, no points, not stored.
- Streak = consecutive daily games **won**; a lost or a missed day resets it to 0.
- 5 guesses (`MAX_GUESSES = 5`); silhouette after the 3rd wrong guess (`SILHOUETTE_AFTER = 3`).
- Pool: league ∈ {13, 53, 31, 19, 16}; base rating ≥ `DAILY_MIN_RATING` (default 82); not in transfer (two different base clubs within 14 days); base card seen within 30 days; not a daily answer in the last 60 days. Base card = `rareflag` 0 or 1. Popularity by rating only.
- Pool size target ≥ 150 (`DAILY_MIN_POOL`, default 150): when the pool at `DAILY_MIN_RATING` is smaller, the threshold steps down by 1 to `DAILY_RATING_FLOOR` (default 75). The tuned default is set in Task 7 from real data.
- Daily reset at the SBC drop (`lastSbcDrop()` from `server/sync.ts`, `SBC_DROP_TZ` / `SBC_DROP_TIME`, 20:01 Europe/Bucharest). Day `#1` = the first stored answer.
- Tile order everywhere (API, grid, share text): nation, league, club, position, rating, cardType.
- Every user-facing string through `t()`, keys in `web/src/locales/en.ts`, `ro.ts`, `it.ts` (RO `_one`/`_few`/`_other`, IT `_one`/`_other`, placeholder `{count}`); `npm run i18n:check`. Player / club / league / nation names stay as EA sends them.
- Server errors carry `code` (+ `params`) through `SessionError(msg, status, code)`; the site shows them via `errorText()` (`web/src/messages.ts`) → `t('err.<code>')`. New codes: `dailyFinished`, `dailyRepeat`, `dailyUnknownPlayer`, `dailyNoPool`, `dailyExpired`.
- UI per `DESIGN.md`: dark teal, `--go` only for primary action / hit / selected, `--pos` only for position pills, a new `--near` amber token for "close" tiles, controls 8px, containers 14px, Barlow Condensed numbers, Geist UI. State never by colour alone (icon ✓ ≈ ✕ + sr-only text). WCAG AA. All motion off under `prefers-reduced-motion` with the final state shown. No horizontal scroll at 390px.
- Load the `frontend-design:frontend-design` skill before any UI task (Tasks 10–12).
- `localStorage` keys use the `sbc-daily-*` prefix and every access is wrapped in try/catch.
- New endpoints → `docs/api.md`. New external origins → none expected (EA content CDN images are already allowed); watch the `[csp]` log.
- Commits: `git pull --rebase`, then `type(scope): subject`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push or deploy without asking.

## Review Focus

1. **Answer leak through the silhouette or the network tab.** A player opening DevTools after 3 misses must not find a portrait URL, an asset id or a name. Pinned by the `gameView` test in Task 6 (silhouette has exactly `rating, position, rareflag, cardType`) and by the browser network check in Task 13.
2. **Anonymous state token tampering / replay across days.** Editing the token or reusing yesterday's token must be refused with `dailyExpired`, never answered with today's answer. Pinned by `verifyState` tests (wrong key `k`, flipped byte, extra segment, too many guesses) in Task 5. Replaying an earlier same-day token only buys extra tries and no points (accepted; documented in `docs/api.md`).
3. **Double submit / two tabs for a signed-in user.** Two guesses at once must not create 6 guesses or two point grants. Pinned by the `select … for update` transaction in Task 8 and the unique partial index in Task 7; `applyGuess` tests (finished, repeat) in Task 6.
4. **Player seen at two clubs by two accounts (stale cache vs transfer).** Must not flip the answer mid-transfer and must settle after 14 days. Pinned by `inTransfer` / `mergePlayer` tests in Task 2 and the pool test in Task 3.
5. **Accents and odd names in search** ("Ødegaard", "Gündoğan", "Mbappé", "Vinícius Jr."). Typing plain ASCII must find them. Pinned by `fold` / `searchNames` tests in Task 9.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/daily/types.ts` (new) | Shared types: `CardType`, `BaseClub`, `PlayerRow`, `Hidden`, `Tile`, `Tiles` |
| `server/daily/regions.ts` (+test) | Nation → confederation, league → country, position → line |
| `server/daily/players.ts` (+test) | `observe`, `cardTypeOf`, `mergePlayer`, `inTransfer`, `baseSeen` |
| `server/daily/pool.ts` (+test) | `eligible`, `poolOf` (adaptive threshold) |
| `server/daily/compare.ts` (+test) | `compareTiles` |
| `server/daily/streak.ts` (+test) | `pointsFor`, `streakOf`, `statsOf`, `nextMilestone` |
| `server/daily/day.ts` (+test) | `dayFor`, `dropDate`, `nextDropAfter` |
| `server/daily/tokens.ts` (+test) | `signState` / `verifyState`, `sealPractice` / `openPractice` |
| `server/daily/game.ts` (+test) | `progressOf`, `applyGuess`, `gameView`, `toPublic` |
| `server/daily/ingest.ts` (+test) | `itemsFromCache`, `collectRewardItems` (pure) |
| `server/daily/store.ts` (new) | In-memory players map, DB upsert queue, `installDailyIngest()`, names list + version |
| `server/daily/service.ts` (new) | Secret, today's answer (lazy pick + scheduler), signed-in / anon / practice flows |
| `server/daily/routes.ts` (new) | `registerDailyRoutes(app)` |
| `server/db/schema.ts`, `server/db/migrations/0010_*.sql` | `players`, `daily_answers`, `daily_plays`, daily index on `point_ledger` |
| `server/db/daily.ts` (new) | Drizzle queries + the guess transaction |
| `server/meta.ts` (modify) | Keep players.json base rating `r` in `Meta['players']` |
| `server/auth.ts` (modify) | `optionalSiteUser(req)` |
| `server/index.ts`, `server/seo.ts` (modify) | Install ingest + scheduler + routes; `/daily` page meta |
| `scripts/daily-import.ts` (new) | Backfill `players` from `data/accounts` + print pool sizes per threshold |
| `web/src/route.ts` (+test), `web/src/Root.tsx`, `web/src/api.ts` | `daily` route, lazy chunk, API types + helpers |
| `web/src/daily/search.ts`, `share.ts`, `stats.ts`, `store.ts` (+tests) | Pure client helpers |
| `web/src/daily/Daily.tsx`, `Search.tsx`, `Grid.tsx`, `MysteryCard.tsx`, `Silhouette.tsx`, `Sheets.tsx`, `Countdown.tsx`, `daily.css` | The page |
| `web/src/landing/DailyTeaser.tsx`, `Landing.tsx`, `landing.css` | Teaser + header link |
| `web/src/App.tsx` | Sidebar "Daily" entry |
| `web/src/locales/{en,ro,it}.ts` | Text |
| `web/src/legal/docs.ts` | Terms section `daily` + privacy line, `UPDATED` |
| `docs/api.md`, `docs/architecture.md`, `DESIGN.md`, `CLAUDE.md`, `.env.example`, `package.json` | Docs, env, `daily:import` script |

---

### Task 1: Types and regions

**Files:**
- Create: `server/daily/types.ts`, `server/daily/regions.ts`
- Test: `server/daily/regions.test.ts`

**Interfaces:**
- Produces: `CardType`, `BaseClub`, `PlayerRow`, `Hidden`, `TileState`, `Tile`, `Tiles`, `TILE_KEYS`; `confederationOf(nation: number): Confed | undefined`, `leagueCountry(league: number): string | undefined`, `positionLine(pos: string): Line | undefined`.

- [ ] **Step 1: Write the types**

```ts
// server/daily/types.ts
// Shapes shared by the Daily game modules. Times are epoch ms.
export type CardType = 'normal' | 'icon' | 'hero';

/** A club the player's base card was seen at, and when (newest first in PlayerRow.baseClubs). */
export interface BaseClub { club: number; league: number; lastSeen: number }

export interface PlayerRow {
  assetId: number;
  name: string; // stage name (players.json `c`, else `f l`)
  fullName: string;
  nation: number;
  league: number;
  club: number; // current: most recent base club, else whatever card we saw first
  position: string;
  rating: number; // base card rating
  rareflag: number; // base card rarity (card art); special-only rows keep the special's
  cardType: CardType;
  baseClubs: BaseClub[];
  firstSeen: number;
  lastSeen: number;
}

/** What a guess is compared on. */
export type Hidden = Pick<PlayerRow, 'nation' | 'league' | 'club' | 'position' | 'rating' | 'cardType'>;

export type TileState = 'hit' | 'near' | 'miss';
export interface Tile { state: TileState; dir?: 'up' | 'down' }
export const TILE_KEYS = ['nation', 'league', 'club', 'position', 'rating', 'cardType'] as const;
export type Tiles = Record<(typeof TILE_KEYS)[number], Tile>;
```

- [ ] **Step 2: Write the failing test**

```ts
// server/daily/regions.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confederationOf, leagueCountry, positionLine } from './regions.js';

test('nations map to football confederations', () => {
  assert.equal(confederationOf(14), 'UEFA'); // England
  assert.equal(confederationOf(26), 'UEFA'); // Israel
  assert.equal(confederationOf(165), 'UEFA'); // Kazakhstan
  assert.equal(confederationOf(219), 'UEFA'); // Kosovo
  assert.equal(confederationOf(54), 'CONMEBOL'); // Brazil
  assert.equal(confederationOf(95), 'CONCACAF'); // United States
  assert.equal(confederationOf(207), 'CONCACAF'); // Dominican Republic
  assert.equal(confederationOf(108), 'CAF'); // Ivory Coast
  assert.equal(confederationOf(218), 'CAF'); // South Sudan
  assert.equal(confederationOf(167), 'AFC'); // Korea Republic
  assert.equal(confederationOf(195), 'AFC'); // Australia
  assert.equal(confederationOf(198), 'OFC'); // New Zealand
  assert.equal(confederationOf(75), undefined); // International
  assert.equal(confederationOf(211), undefined); // Rest of World
});

test('leagues map to countries; same country = same code', () => {
  assert.equal(leagueCountry(13), 'ENG');
  assert.equal(leagueCountry(14), 'ENG');
  assert.equal(leagueCountry(53), leagueCountry(54));
  assert.equal(leagueCountry(31), leagueCountry(32));
  assert.equal(leagueCountry(19), leagueCountry(2076));
  assert.equal(leagueCountry(16), leagueCountry(17));
  assert.notEqual(leagueCountry(13), leagueCountry(50)); // England vs Scotland
  assert.equal(leagueCountry(2118), undefined); // Icons
});

test('positions map to lines; GK alone', () => {
  assert.equal(positionLine('GK'), 'gk');
  for (const p of ['CB', 'LB', 'RB', 'LWB', 'RWB']) assert.equal(positionLine(p), 'def', p);
  for (const p of ['CDM', 'CM', 'CAM', 'LM', 'RM']) assert.equal(positionLine(p), 'mid', p);
  for (const p of ['LW', 'RW', 'CF', 'ST']) assert.equal(positionLine(p), 'att', p);
  assert.equal(positionLine('SUB'), undefined);
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `node --import tsx --test server/daily/regions.test.ts`
Expected: FAIL, cannot find module `./regions.js`.

- [ ] **Step 4: Implement**

```ts
// server/daily/regions.ts
// Static football geography for the Daily tiles: "near" nation = same confederation, "near" league =
// same country, "near" position = same line. EA ids from players' nation / leagueId (names in
// data/static.json loc: search.nationName.nation<id>, global.leagueFull.2027.league<id>). Unknown → no "near".
export type Confed = 'UEFA' | 'CONMEBOL' | 'CONCACAF' | 'CAF' | 'AFC' | 'OFC';
export type Line = 'gk' | 'def' | 'mid' | 'att';

const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const CONFED = new Map<number, Confed>();
const put = (c: Confed, ids: number[]) => ids.forEach((id) => CONFED.set(id, c));
put('UEFA', [...range(1, 51), 165, 205, 208, 219]);
put('CONMEBOL', range(52, 61));
put('CONCACAF', [...range(62, 96).filter((id) => id !== 75), 207]);
put('CAF', [...range(97, 148), 214, 218]);
put('AFC', [...range(149, 193).filter((id) => id !== 165), 195, 212, 213]);
put('OFC', [194, ...range(196, 204), 215]);

export const confederationOf = (nation: number) => CONFED.get(nation);

const COUNTRY: Record<string, number[]> = {
  ENG: [13, 14, 60, 61, 2208, 10061, 2216],
  ESP: [53, 54, 10054, 2222],
  ITA: [31, 32, 2179, 10032, 2236],
  GER: [19, 20, 2076, 10020, 2215],
  FRA: [16, 17, 10017, 2218],
  NED: [10, 10010, 2229],
  BEL: [4, 10004],
  POR: [308, 10308, 2228],
  SCO: [50, 51, 371, 10050, 2233],
  USA: [39, 390, 2221],
  MEX: [84, 85, 341, 10341],
  ARG: [353, 1008, 1009, 10353],
  DEN: [1, 10001],
  NOR: [41, 10041, 2272],
  SWE: [56, 10056, 2232],
  AUT: [80, 10080],
  SUI: [189, 10189, 2231],
  POL: [66, 10066],
  IRL: [65, 10065],
  KOR: [83, 10083],
  KSA: [350, 10350],
  COL: [2209, 1005, 10336],
  CHI: [2249, 10335],
  RUS: [3006, 10067],
  CZE: [319, 2230],
  THA: [2070, 2271],
  TUR: [68], GRE: [63], CRO: [317], FIN: [322], ROU: [330], UKR: [332], EGY: [343], RSA: [347],
  AUS: [351], CHN: [2012], IND: [2149], UAE: [2172], CYP: [2210], HUN: [2211], AZE: [2244],
  BRA: [2267], BUL: [2274], ISL: [2273],
};
const LEAGUE = new Map<number, string>(Object.entries(COUNTRY).flatMap(([c, ids]) => ids.map((id) => [id, c] as [number, string])));
export const leagueCountry = (league: number) => LEAGUE.get(league);

const LINES: Record<Line, string[]> = {
  gk: ['GK'],
  def: ['CB', 'LB', 'RB', 'LWB', 'RWB'],
  mid: ['CDM', 'CM', 'CAM', 'LM', 'RM'],
  att: ['LW', 'RW', 'CF', 'ST'],
};
const LINE = new Map<string, Line>(Object.entries(LINES).flatMap(([l, ps]) => ps.map((p) => [p, l as Line] as [string, Line])));
export const positionLine = (pos: string) => LINE.get(pos);
```

- [ ] **Step 5: Run the test, it passes**

Run: `node --import tsx --test server/daily/regions.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git pull --rebase && git add server/daily/types.ts server/daily/regions.ts server/daily/regions.test.ts
git commit -m "feat(daily): types and football regions" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Players merge and transfer detection

**Files:**
- Create: `server/daily/players.ts`
- Modify: `server/meta.ts:49,129-132` (keep players.json `r`)
- Test: `server/daily/players.test.ts`

**Interfaces:**
- Consumes: `PlayerRow`, `BaseClub`, `CardType` (Task 1); `LEGENDS_CLUB_ID`, `LEGENDS_LEAGUE_ID`, `HERO_CLUB_ID` from `server/meta.ts`.
- Produces: `DAY`, `SEEN_STEP`, `TRANSFER_WINDOW`; `interface Observation { assetId; rareflag; rating; nation; league; club; position }`; `interface PlayerName { name: string; full: string; rating?: number }`; `observe(v: unknown): Observation | null`; `cardTypeOf(o: { club: number; league: number }): CardType`; `isBase(o: { rareflag: number }): boolean`; `mergePlayer(prev: PlayerRow | undefined, o: Observation, names: PlayerName | undefined, now: number): PlayerRow | null` (null = no change / unknown name); `inTransfer(r: PlayerRow, now: number): boolean`; `baseSeen(r: PlayerRow): number | null`. `Meta['players'][id]` gains `rating: number`.

- [ ] **Step 1: Write the failing test**

```ts
// server/daily/players.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, SEEN_STEP, baseSeen, cardTypeOf, inTransfer, mergePlayer, observe, type Observation } from './players.js';
import { HERO_CLUB_ID, LEGENDS_CLUB_ID, LEGENDS_LEAGUE_ID } from '../meta.js';

const ob = (p: Partial<Observation> = {}): Observation => ({ assetId: 10, rareflag: 1, rating: 84, nation: 14, league: 13, club: 1, position: 'CM', ...p });
const names = { name: 'Rice', full: 'Declan Rice', rating: 84 };
const T = 1_000 * DAY;

test('observe reads club items, objective rewards (teamId) and rejects junk', () => {
  const item = { itemType: 'player', assetId: 10, rareflag: 0, rating: 80, nation: 14, leagueId: 13, teamid: 1, preferredPosition: 'ST' };
  assert.deepEqual(observe(item), { assetId: 10, rareflag: 0, rating: 80, nation: 14, league: 13, club: 1, position: 'ST' });
  assert.equal(observe({ ...item, teamid: undefined, teamId: 7 })?.club, 7);
  assert.equal(observe({ ...item, itemType: 'training' }), null);
  assert.equal(observe({ ...item, assetId: 0 }), null);
  assert.equal(observe({ ...item, rareflag: -1 }), null);
  assert.equal(observe(null), null);
});

test('cardTypeOf: icons by club or league, heroes by club', () => {
  assert.equal(cardTypeOf({ club: LEGENDS_CLUB_ID, league: 1 }), 'icon');
  assert.equal(cardTypeOf({ club: 1, league: LEGENDS_LEAGUE_ID }), 'icon');
  assert.equal(cardTypeOf({ club: HERO_CLUB_ID, league: 13 }), 'hero');
  assert.equal(cardTypeOf({ club: 1, league: 13 }), 'normal');
});

test('a new base card creates the row with its club as base club', () => {
  const r = mergePlayer(undefined, ob(), names, T)!;
  assert.equal(r.name, 'Rice');
  assert.equal(r.fullName, 'Declan Rice');
  assert.deepEqual(r.baseClubs, [{ club: 1, league: 13, lastSeen: T }]);
  assert.equal(baseSeen(r), T);
  assert.equal(r.cardType, 'normal');
});

test('unknown name: no row', () => {
  assert.equal(mergePlayer(undefined, ob(), undefined, T), null);
});

test('a special card first: row exists, base rating from players.json, no base club', () => {
  const r = mergePlayer(undefined, ob({ rareflag: 3, rating: 89, club: 5 }), names, T)!;
  assert.equal(r.rating, 84);
  assert.equal(r.club, 5);
  assert.deepEqual(r.baseClubs, []);
  assert.equal(baseSeen(r), null);
});

test('a special card never changes club / rating of a known row', () => {
  const r = mergePlayer(undefined, ob(), names, T)!;
  assert.equal(mergePlayer(r, ob({ rareflag: 3, rating: 89, club: 5 }), names, T + 1000), null);
  const later = mergePlayer(r, ob({ rareflag: 3, rating: 89, club: 5 }), names, T + SEEN_STEP)!;
  assert.equal(later.club, 1);
  assert.equal(later.rating, 84);
  assert.equal(later.lastSeen, T + SEEN_STEP);
});

test('the same base card again within SEEN_STEP is no change', () => {
  const r = mergePlayer(undefined, ob(), names, T)!;
  assert.equal(mergePlayer(r, ob(), names, T + 1000), null);
});

test('base rating and club follow the most recent base card', () => {
  const r = mergePlayer(undefined, ob(), names, T)!;
  const moved = mergePlayer(r, ob({ club: 2, league: 53, rating: 85 }), names, T + DAY)!;
  assert.equal(moved.club, 2);
  assert.equal(moved.league, 53);
  assert.equal(moved.rating, 85);
  assert.deepEqual(moved.baseClubs.map((c) => c.club), [2, 1]);
});

test('two base clubs within 14 days = in transfer; settles after', () => {
  const r = mergePlayer(undefined, ob(), names, T)!;
  const moved = mergePlayer(r, ob({ club: 2 }), names, T + DAY)!;
  assert.equal(inTransfer(moved, T + DAY), true);
  assert.equal(inTransfer(moved, T + 14 * DAY + 1), false);
  // a stale account still reporting the old club keeps it in transfer
  const stale = mergePlayer(moved, ob({ club: 1 }), names, T + 3 * DAY)!;
  assert.equal(stale.club, 1);
  assert.equal(inTransfer(stale, T + 3 * DAY), true);
});

test('a special card first, then the base card, sets the base club', () => {
  const r = mergePlayer(undefined, ob({ rareflag: 3, club: 5 }), names, T)!;
  const b = mergePlayer(r, ob({ club: 1 }), names, T + 1)!;
  assert.equal(b.club, 1);
  assert.deepEqual(b.baseClubs.map((c) => c.club), [1]);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test server/daily/players.test.ts`
Expected: FAIL, cannot find module `./players.js`.

- [ ] **Step 3: Keep the base rating in meta**

In `server/meta.ts`, change the `players` type (line ~49) to `players: Record<string, { name: string; full: string; rating: number }>;` and the loop (line ~131) to:

```ts
    playerNames[p.id] = { name: p.c || p.l || p.f, full: `${p.f} ${p.l}`.trim(), rating: p.r };
```

and add `r: number` to the local `P` type used for players.json if it does not already have it. Run `npm run typecheck`; fix any spot that builds `Meta['players']` entries by hand (tests / fixtures) by adding `rating`.

- [ ] **Step 4: Implement**

```ts
// server/daily/players.ts
// One row per player (assetId) for the Daily game, merged from every EA item the server caches.
// Only base cards (rareflag 0 / 1) move club, league and rating; special cards only prove the player
// exists. Pure: the store (store.ts) feeds it and writes changed rows to Postgres.
import { HERO_CLUB_ID, LEGENDS_CLUB_ID, LEGENDS_LEAGUE_ID } from '../meta.js';
import type { CardType, PlayerRow } from './types.js';

export const DAY = 86_400_000;
/** A row is rewritten for a mere "seen again" at most this often (keeps cache writes from churning the DB). */
export const SEEN_STEP = 12 * 3_600_000;
export const TRANSFER_WINDOW = 14 * DAY;
const MAX_BASE_CLUBS = 6;

export interface Observation { assetId: number; rareflag: number; rating: number; nation: number; league: number; club: number; position: string }
export interface PlayerName { name: string; full: string; rating?: number }

const id = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

export function observe(v: unknown): Observation | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || o.itemType !== 'player') return null;
  const club = o.teamid ?? o.teamId; // club items say teamid, objective rewards teamId
  const { assetId, rareflag, rating, nation, leagueId, preferredPosition } = o;
  if (!id(assetId) || !Number.isInteger(rareflag) || (rareflag as number) < 0 || !id(rating) || !id(nation) || !id(leagueId) || !id(club)) return null;
  if (typeof preferredPosition !== 'string' || !preferredPosition) return null;
  return { assetId, rareflag: rareflag as number, rating, nation, league: leagueId, club, position: preferredPosition };
}

export const isBase = (o: { rareflag: number }) => o.rareflag === 0 || o.rareflag === 1;

export function cardTypeOf(o: { club: number; league: number }): CardType {
  if (o.club === LEGENDS_CLUB_ID || o.league === LEGENDS_LEAGUE_ID) return 'icon';
  return o.club === HERO_CLUB_ID ? 'hero' : 'normal';
}

export const baseSeen = (r: PlayerRow): number | null => (r.baseClubs.length ? Math.max(...r.baseClubs.map((c) => c.lastSeen)) : null);

export function inTransfer(r: PlayerRow, now: number): boolean {
  return new Set(r.baseClubs.filter((c) => now - c.lastSeen < TRANSFER_WINDOW).map((c) => c.club)).size >= 2;
}

export function mergePlayer(prev: PlayerRow | undefined, o: Observation, names: PlayerName | undefined, now: number): PlayerRow | null {
  const base = isBase(o);
  if (!prev) {
    if (!names) return null;
    return {
      assetId: o.assetId, name: names.name, fullName: names.full, nation: o.nation, league: o.league, club: o.club,
      position: o.position, rating: base ? o.rating : names.rating ?? o.rating, rareflag: o.rareflag, cardType: cardTypeOf(o),
      baseClubs: base ? [{ club: o.club, league: o.league, lastSeen: now }] : [], firstSeen: now, lastSeen: now,
    };
  }
  const seenStale = now - prev.lastSeen >= SEEN_STEP;
  if (!base) return seenStale ? { ...prev, lastSeen: now } : null;
  const old = prev.baseClubs.find((c) => c.club === o.club);
  const fresh = !old || old.league !== o.league || now - old.lastSeen >= SEEN_STEP;
  const baseClubs = fresh
    ? [{ club: o.club, league: o.league, lastSeen: now }, ...prev.baseClubs.filter((c) => c.club !== o.club)]
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .slice(0, MAX_BASE_CLUBS)
    : prev.baseClubs;
  const cur = baseClubs[0];
  const next: PlayerRow = {
    ...prev,
    ...(names ? { name: names.name, fullName: names.full } : {}),
    club: cur.club, league: cur.league, rating: o.rating, rareflag: o.rareflag, nation: o.nation, position: o.position,
    cardType: cardTypeOf(o), baseClubs, lastSeen: fresh || seenStale ? now : prev.lastSeen,
  };
  return JSON.stringify(next) === JSON.stringify(prev) ? null : next;
}
```

- [ ] **Step 5: Run the tests, they pass**

Run: `node --import tsx --test server/daily/players.test.ts && npm run typecheck`
Expected: PASS (10 tests), typecheck clean.

- [ ] **Step 6: Commit**

```bash
git pull --rebase && git add server/daily/players.ts server/daily/players.test.ts server/meta.ts
git commit -m "feat(daily): players merge and transfer detection" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Answer pool

**Files:**
- Create: `server/daily/pool.ts`
- Test: `server/daily/pool.test.ts`

**Interfaces:**
- Consumes: `PlayerRow` (Task 1); `DAY`, `baseSeen`, `inTransfer` (Task 2).
- Produces: `TOP5: readonly number[]`; `FRESH_MS`; `RECENT_DAYS = 60`; `interface PoolOpts { minRating: number; minPool: number; floor: number; recent: ReadonlySet<number>; now: number }`; `eligible(r: PlayerRow, now: number): boolean`; `poolOf(rows: Iterable<PlayerRow>, o: PoolOpts): { players: PlayerRow[]; minRating: number }`; `poolSizes(rows, now, from, to): Record<number, number>` (for the import script).

- [ ] **Step 1: Write the failing test**

```ts
// server/daily/pool.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY } from './players.js';
import { eligible, poolOf, poolSizes } from './pool.js';
import type { PlayerRow } from './types.js';

const NOW = 2_000 * DAY;
const row = (p: Partial<PlayerRow> = {}): PlayerRow => ({
  assetId: 1, name: 'A', fullName: 'A A', nation: 14, league: 13, club: 1, position: 'ST', rating: 85, rareflag: 1, cardType: 'normal',
  baseClubs: [{ club: 1, league: 13, lastSeen: NOW - DAY }], firstSeen: 0, lastSeen: NOW, ...p,
});
const opts = { minRating: 82, minPool: 2, floor: 75, recent: new Set<number>(), now: NOW };

test('eligible: top 5 league, fresh base card, not in transfer', () => {
  assert.equal(eligible(row(), NOW), true);
  assert.equal(eligible(row({ league: 10 }), NOW), false);
  assert.equal(eligible(row({ baseClubs: [] }), NOW), false); // special cards only
  assert.equal(eligible(row({ baseClubs: [{ club: 1, league: 13, lastSeen: NOW - 31 * DAY }] }), NOW), false);
  assert.equal(eligible(row({ baseClubs: [{ club: 2, league: 13, lastSeen: NOW - DAY }, { club: 1, league: 13, lastSeen: NOW - 2 * DAY }] }), NOW), false);
});

test('poolOf keeps ratings at or above the threshold and drops recent answers', () => {
  const rows = [row({ assetId: 1, rating: 90 }), row({ assetId: 2, rating: 82 }), row({ assetId: 3, rating: 81 }), row({ assetId: 4, rating: 88 })];
  const p = poolOf(rows, { ...opts, recent: new Set([4]) });
  assert.deepEqual(p.players.map((r) => r.assetId).sort(), [1, 2]);
  assert.equal(p.minRating, 82);
});

test('poolOf steps the threshold down until the pool is big enough, not below the floor', () => {
  const rows = [row({ assetId: 1, rating: 83 }), row({ assetId: 2, rating: 79 }), row({ assetId: 3, rating: 74 })];
  const p = poolOf(rows, opts);
  assert.equal(p.minRating, 79);
  assert.equal(p.players.length, 2);
  const floor = poolOf(rows, { ...opts, minPool: 10 });
  assert.equal(floor.minRating, 75);
  assert.equal(floor.players.length, 2);
});

test('poolOf on nothing is empty', () => {
  assert.deepEqual(poolOf([], opts).players, []);
});

test('poolSizes counts per threshold', () => {
  const rows = [row({ assetId: 1, rating: 83 }), row({ assetId: 2, rating: 79 })];
  assert.deepEqual(poolSizes(rows, NOW, 78, 84), { 78: 2, 79: 2, 80: 1, 81: 1, 82: 1, 83: 1, 84: 0 });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test server/daily/pool.test.ts`
Expected: FAIL, cannot find module `./pool.js`.

- [ ] **Step 3: Implement**

```ts
// server/daily/pool.ts
// Who can be the Daily / Practice answer: well-known players (top-5 leagues, high base rating) whose
// club we are sure of. Popularity is by rating only, never by how many clubs own the player.
import { DAY, baseSeen, inTransfer } from './players.js';
import type { PlayerRow } from './types.js';

export const TOP5 = [13, 53, 31, 19, 16] as const; // Premier League, LALIGA, Serie A, Bundesliga, Ligue 1
export const FRESH_MS = 30 * DAY;
export const RECENT_DAYS = 60;

export interface PoolOpts { minRating: number; minPool: number; floor: number; recent: ReadonlySet<number>; now: number }

export function eligible(r: PlayerRow, now: number): boolean {
  const seen = baseSeen(r);
  return (TOP5 as readonly number[]).includes(r.league) && seen !== null && now - seen <= FRESH_MS && !inTransfer(r, now);
}

/** Players at or above minRating; when fewer than minPool, the threshold steps down to the floor. */
export function poolOf(rows: Iterable<PlayerRow>, o: PoolOpts): { players: PlayerRow[]; minRating: number } {
  const ok = [...rows].filter((r) => eligible(r, o.now) && !o.recent.has(r.assetId));
  let minRating = o.minRating;
  let players = ok.filter((r) => r.rating >= minRating);
  while (players.length < o.minPool && minRating > o.floor) {
    minRating--;
    players = ok.filter((r) => r.rating >= minRating);
  }
  return { players, minRating };
}

export function poolSizes(rows: Iterable<PlayerRow>, now: number, from: number, to: number): Record<number, number> {
  const ok = [...rows].filter((r) => eligible(r, now));
  const out: Record<number, number> = {};
  for (let m = from; m <= to; m++) out[m] = ok.filter((r) => r.rating >= m).length;
  return out;
}
```

- [ ] **Step 4: Run the test, it passes**

Run: `node --import tsx --test server/daily/pool.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git pull --rebase && git add server/daily/pool.ts server/daily/pool.test.ts
git commit -m "feat(daily): answer pool with adaptive rating threshold" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Tile comparison, streak and points, day numbering

**Files:**
- Create: `server/daily/compare.ts`, `server/daily/streak.ts`, `server/daily/day.ts`
- Test: `server/daily/compare.test.ts`, `server/daily/streak.test.ts`, `server/daily/day.test.ts`

**Interfaces:**
- Consumes: `Hidden`, `Tiles` (Task 1); `confederationOf`, `leagueCountry`, `positionLine` (Task 1); `DAY` (Task 2).
- Produces: `compareTiles(guess: Hidden, answer: Hidden): Tiles`; `interface Play { day: number; won: boolean; guesses: number }`; `pointsFor(streak: number): number`; `streakOf(plays: Play[], today: number): { current: number; best: number }`; `interface Stats { played: number; won: number; current: number; best: number; dist: number[]; next: { target: number; points: number } }`; `statsOf(plays: Play[], today: number): Stats`; `nextMilestone(streak: number): { target: number; points: number }`; `dayFor(drop: number, first: { day: number; dropAt: number } | null): number`; `dropDate(drop: number, tz: string): string`; `nextDropAfter(lastDrop: (d: Date) => number, now: number): number`.

- [ ] **Step 1: Write the failing tests**

```ts
// server/daily/compare.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTiles } from './compare.js';
import type { Hidden } from './types.js';

const a: Hidden = { nation: 18, league: 13, club: 1, position: 'ST', rating: 86, cardType: 'normal' };

test('all hits', () => {
  const t = compareTiles(a, a);
  for (const k of Object.keys(t) as (keyof typeof t)[]) assert.equal(t[k].state, 'hit', k);
  assert.equal(t.rating.dir, undefined);
});

test('nation: same confederation is near, else miss, unknown never near', () => {
  assert.equal(compareTiles({ ...a, nation: 14 }, a).nation.state, 'near'); // England vs France
  assert.equal(compareTiles({ ...a, nation: 54 }, a).nation.state, 'miss'); // Brazil
  assert.equal(compareTiles({ ...a, nation: 75 }, { ...a, nation: 211 }).nation.state, 'miss');
});

test('league: same country is near', () => {
  assert.equal(compareTiles({ ...a, league: 14 }, a).league.state, 'near');
  assert.equal(compareTiles({ ...a, league: 53 }, a).league.state, 'miss');
});

test('club and card type: hit or miss only', () => {
  assert.equal(compareTiles({ ...a, club: 2 }, a).club.state, 'miss');
  assert.equal(compareTiles({ ...a, cardType: 'hero' }, a).cardType.state, 'miss');
});

test('position: same line is near, GK alone', () => {
  assert.equal(compareTiles({ ...a, position: 'LW' }, a).position.state, 'near');
  assert.equal(compareTiles({ ...a, position: 'CM' }, a).position.state, 'miss');
  assert.equal(compareTiles({ ...a, position: 'GK' }, { ...a, position: 'CB' }).position.state, 'miss');
});

test('rating: within 2 is near, arrows point to the answer', () => {
  assert.deepEqual(compareTiles({ ...a, rating: 84 }, a).rating, { state: 'near', dir: 'up' });
  assert.deepEqual(compareTiles({ ...a, rating: 88 }, a).rating, { state: 'near', dir: 'down' });
  assert.deepEqual(compareTiles({ ...a, rating: 83 }, a).rating, { state: 'miss', dir: 'up' });
  assert.deepEqual(compareTiles({ ...a, rating: 91 }, a).rating, { state: 'miss', dir: 'down' });
});
```

```ts
// server/daily/streak.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextMilestone, pointsFor, statsOf, streakOf, type Play } from './streak.js';

test('points at 7, 14, 30 and every 30 after', () => {
  const got = Object.fromEntries([0, 1, 6, 7, 8, 14, 29, 30, 31, 37, 44, 60, 67, 74, 90].map((s) => [s, pointsFor(s)]));
  assert.deepEqual(got, { 0: 0, 1: 0, 6: 0, 7: 1, 8: 0, 14: 1, 29: 0, 30: 2, 31: 0, 37: 1, 44: 1, 60: 2, 67: 1, 74: 1, 90: 2 });
});

const won = (from: number, to: number): Play[] => Array.from({ length: to - from + 1 }, (_, i) => ({ day: from + i, won: true, guesses: 3 }));

test('current streak counts back from today, or from yesterday when today is not finished', () => {
  assert.deepEqual(streakOf(won(1, 7), 7), { current: 7, best: 7 });
  assert.deepEqual(streakOf(won(1, 7), 8), { current: 7, best: 7 }); // today still open
  assert.deepEqual(streakOf(won(1, 7), 9), { current: 0, best: 7 }); // missed day 8
});

test('a lost day resets the streak', () => {
  const plays = [...won(1, 5), { day: 6, won: false, guesses: 5 }, ...won(7, 8)];
  assert.deepEqual(streakOf(plays, 8), { current: 2, best: 5 });
  assert.deepEqual(streakOf(plays.slice(0, 6), 6), { current: 0, best: 5 });
});

test('stats: played, won, distribution of winning guesses, next milestone', () => {
  const plays: Play[] = [{ day: 1, won: true, guesses: 1 }, { day: 2, won: true, guesses: 3 }, { day: 3, won: false, guesses: 5 }, { day: 4, won: true, guesses: 3 }];
  const s = statsOf(plays, 4);
  assert.equal(s.played, 4);
  assert.equal(s.won, 3);
  assert.deepEqual(s.dist, [1, 0, 2, 0, 0]);
  assert.equal(s.current, 1);
  assert.deepEqual(s.next, { target: 7, points: 1 });
});

test('next milestone after 7 is 14, after 14 is 30, after 30 is 37', () => {
  assert.deepEqual(nextMilestone(7), { target: 14, points: 1 });
  assert.deepEqual(nextMilestone(14), { target: 30, points: 2 });
  assert.deepEqual(nextMilestone(30), { target: 37, points: 1 });
});
```

```ts
// server/daily/day.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayFor, dropDate, nextDropAfter } from './day.js';
import { DAY } from './players.js';

test('day 1 is the first stored answer; later drops count on, DST hours round away', () => {
  const first = { day: 1, dropAt: Date.UTC(2026, 9, 9, 17, 1) };
  assert.equal(dayFor(first.dropAt, null), 1);
  assert.equal(dayFor(first.dropAt, first), 1);
  assert.equal(dayFor(first.dropAt + 3 * DAY, first), 4);
  assert.equal(dayFor(first.dropAt + 30 * DAY + 3_600_000, first), 31); // 25-hour day across DST
});

test('dropDate is the calendar date in the drop time zone', () => {
  assert.equal(dropDate(Date.UTC(2026, 9, 9, 17, 1), 'Europe/Bucharest'), '2026-10-09');
});

test('nextDropAfter asks lastDrop for a moment past the next drop', () => {
  const drops = [Date.UTC(2026, 9, 9, 17, 1), Date.UTC(2026, 9, 10, 17, 1)];
  const last = (d: Date) => [...drops].reverse().find((x) => x <= d.getTime()) ?? 0;
  assert.equal(nextDropAfter(last, drops[0] + 60_000), drops[1]);
  assert.equal(nextDropAfter(last, drops[1] - 60_000), drops[1]);
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --import tsx --test server/daily/compare.test.ts server/daily/streak.test.ts server/daily/day.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

```ts
// server/daily/compare.ts
// How close a guess is to the answer, tile by tile (see the spec table).
import { confederationOf, leagueCountry, positionLine } from './regions.js';
import type { Hidden, Tile, Tiles } from './types.js';

const hit: Tile = { state: 'hit' };
const miss: Tile = { state: 'miss' };
const near = (a: unknown, b: unknown): Tile => (a !== undefined && a === b ? { state: 'near' } : miss);

export function compareTiles(g: Hidden, a: Hidden): Tiles {
  const diff = a.rating - g.rating;
  const dir = diff > 0 ? 'up' : 'down';
  return {
    nation: g.nation === a.nation ? hit : near(confederationOf(g.nation), confederationOf(a.nation)),
    league: g.league === a.league ? hit : near(leagueCountry(g.league), leagueCountry(a.league)),
    club: g.club === a.club ? hit : miss,
    position: g.position === a.position ? hit : near(positionLine(g.position), positionLine(a.position)),
    rating: diff === 0 ? hit : { state: Math.abs(diff) <= 2 ? 'near' : 'miss', dir },
    cardType: g.cardType === a.cardType ? hit : miss,
  };
}
```

```ts
// server/daily/streak.ts
// Daily stats, win streaks and the streak points schedule (7 → +1, 14 → +1, 30 → +2, repeating every 30).
// The web keeps a copy of streakOf / statsOf for signed-out stats (web/src/daily/stats.ts).
export interface Play { day: number; won: boolean; guesses: number } // finished games only
export interface Stats { played: number; won: number; current: number; best: number; dist: number[]; next: { target: number; points: number } }

export function pointsFor(streak: number): number {
  if (streak <= 0) return 0;
  const m = streak % 30;
  return m === 0 ? 2 : m === 7 || m === 14 ? 1 : 0;
}

export function nextMilestone(streak: number): { target: number; points: number } {
  let s = Math.max(0, streak) + 1;
  while (pointsFor(s) === 0) s++;
  return { target: s, points: pointsFor(s) };
}

export function streakOf(plays: Play[], today: number): { current: number; best: number } {
  const byDay = new Map(plays.map((p) => [p.day, p.won]));
  let d = byDay.has(today) ? today : today - 1;
  let current = 0;
  while (byDay.get(d) === true) {
    current++;
    d--;
  }
  let best = 0;
  let run = 0;
  let prev = Number.NEGATIVE_INFINITY;
  for (const day of plays.filter((p) => p.won).map((p) => p.day).sort((x, y) => x - y)) {
    run = day === prev + 1 ? run + 1 : 1;
    prev = day;
    best = Math.max(best, run);
  }
  return { current, best };
}

export function statsOf(plays: Play[], today: number): Stats {
  const { current, best } = streakOf(plays, today);
  const dist = [0, 0, 0, 0, 0];
  for (const p of plays) if (p.won && p.guesses >= 1 && p.guesses <= 5) dist[p.guesses - 1]++;
  return { played: plays.length, won: plays.filter((p) => p.won).length, current, best, dist, next: nextMilestone(current) };
}
```

```ts
// server/daily/day.ts
// Daily numbering: #1 is the first stored answer, one more per SBC drop (20:01 Europe/Bucharest).
import { DAY } from './players.js';

export function dayFor(drop: number, first: { day: number; dropAt: number } | null): number {
  return first ? first.day + Math.round((drop - first.dropAt) / DAY) : 1;
}

export function dropDate(drop: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(drop));
}

/** The drop after `now`: 25 h past the last drop is always past the next one, also across DST. */
export function nextDropAfter(lastDrop: (d: Date) => number, now: number): number {
  return lastDrop(new Date(lastDrop(new Date(now)) + 25 * 3_600_000));
}
```

- [ ] **Step 4: Run them, they pass**

Run: `node --import tsx --test server/daily/compare.test.ts server/daily/streak.test.ts server/daily/day.test.ts`
Expected: PASS (6 + 5 + 3 tests).

- [ ] **Step 5: Commit**

```bash
git pull --rebase && git add server/daily/compare.* server/daily/streak.* server/daily/day.*
git commit -m "feat(daily): tile comparison, streak points and day numbering" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Signed state and encrypted practice tokens

**Files:**
- Create: `server/daily/tokens.ts`
- Test: `server/daily/tokens.test.ts`

**Interfaces:**
- Produces: `interface GameState { k: string; g: number[] }` (`k` = `d<day>` for the daily game, `p<id>` for a practice game); `signState(secret: string, s: GameState): string`; `verifyState(secret: string, token: unknown, k: string): GameState | null`; `interface Practice { id: string; a: number; exp: number }`; `sealPractice(secret: string, p: Practice): string`; `openPractice(secret: string, token: unknown, now: number): Practice | null`.

- [ ] **Step 1: Write the failing test**

```ts
// server/daily/tokens.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPractice, sealPractice, signState, verifyState } from './tokens.js';

const S = 'test-secret-0123456789abcdef';

test('state round-trips for its own game key only', () => {
  const tok = signState(S, { k: 'd42', g: [1, 2] });
  assert.deepEqual(verifyState(S, tok, 'd42'), { k: 'd42', g: [1, 2] });
  assert.equal(verifyState(S, tok, 'd43'), null); // yesterday's token today
  assert.equal(verifyState('other-secret-0123456789', tok, 'd42'), null);
});

test('tampered or malformed state is refused', () => {
  const tok = signState(S, { k: 'd42', g: [1] });
  const [body, mac] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ k: 'd42', g: [1, 2, 3] })).toString('base64url');
  assert.equal(verifyState(S, `${forged}.${mac}`, 'd42'), null);
  assert.equal(verifyState(S, `${body}.${mac}x`, 'd42'), null);
  assert.equal(verifyState(S, `${tok}.x`, 'd42'), null);
  assert.equal(verifyState(S, 'nope', 'd42'), null);
  assert.equal(verifyState(S, 42, 'd42'), null);
  assert.equal(verifyState(S, signState(S, { k: 'd42', g: [1, 2, 3, 4, 5, 6] }), 'd42'), null); // more than 5
  assert.equal(verifyState(S, signState(S, { k: 'd42', g: [1.5] }), 'd42'), null);
});

test('practice token hides the answer and expires', () => {
  const tok = sealPractice(S, { id: 'abc', a: 158023, exp: 1000 });
  assert.equal(tok.includes('158023'), false);
  assert.equal(Buffer.from(tok, 'base64url').toString('latin1').includes('158023'), false);
  assert.deepEqual(openPractice(S, tok, 999), { id: 'abc', a: 158023, exp: 1000 });
  assert.equal(openPractice(S, tok, 1000), null);
  assert.equal(openPractice('other-secret-0123456789', tok, 0), null);
  const bytes = Buffer.from(tok, 'base64url');
  bytes[bytes.length - 1] ^= 1;
  assert.equal(openPractice(S, bytes.toString('base64url'), 0), null);
  assert.equal(openPractice(S, 'short', 0), null);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test server/daily/tokens.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// server/daily/tokens.ts
// Signed-out games are stateless on the server: the guesses so far travel in an HMAC-signed state
// token (so they cannot be edited), and a Practice answer travels AES-256-GCM encrypted (so it cannot
// be read). Keys are derived from one server secret (service.ts dailySecret()).
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';

const MAX_GUESSES = 5;
export interface GameState { k: string; g: number[] }
export interface Practice { id: string; a: number; exp: number }

const keys = new Map<string, Buffer>();
function key(secret: string, info: 'state' | 'practice'): Buffer {
  const id = `${info}:${secret}`;
  let k = keys.get(id);
  if (!k) keys.set(id, (k = Buffer.from(hkdfSync('sha256', secret, 'fc-solver-daily', info, 32))));
  return k;
}

const mac = (secret: string, body: string) => createHmac('sha256', key(secret, 'state')).update(body).digest();

export function signState(secret: string, s: GameState): string {
  const body = Buffer.from(JSON.stringify({ k: s.k, g: s.g })).toString('base64url');
  return `${body}.${mac(secret, body).toString('base64url')}`;
}

export function verifyState(secret: string, token: unknown, k: string): GameState | null {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const want = mac(secret, body);
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<GameState>;
    if (s.k !== k || !Array.isArray(s.g) || s.g.length > MAX_GUESSES || !s.g.every((x) => Number.isInteger(x) && x > 0)) return null;
    return { k: s.k, g: s.g };
  } catch {
    return null;
  }
}

export function sealPractice(secret: string, p: Practice): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(secret, 'practice'), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(p), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64url');
}

export function openPractice(secret: string, token: unknown, now: number): Practice | null {
  if (typeof token !== 'string' || token.length > 512) return null;
  const buf = Buffer.from(token, 'base64url');
  if (buf.length < 29) return null;
  try {
    const d = createDecipheriv('aes-256-gcm', key(secret, 'practice'), buf.subarray(0, 12));
    d.setAuthTag(buf.subarray(12, 28));
    const p = JSON.parse(Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8')) as Partial<Practice>;
    if (typeof p.id !== 'string' || !Number.isInteger(p.a) || typeof p.exp !== 'number' || p.exp <= now) return null;
    return { id: p.id, a: p.a as number, exp: p.exp };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run it, it passes**

Run: `node --import tsx --test server/daily/tokens.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git pull --rebase && git add server/daily/tokens.ts server/daily/tokens.test.ts
git commit -m "feat(daily): signed state and encrypted practice tokens" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Game progress and the public view

**Files:**
- Create: `server/daily/game.ts`
- Test: `server/daily/game.test.ts`

**Interfaces:**
- Consumes: `PlayerRow`, `Tiles` (Task 1); `compareTiles` (Task 4).
- Produces: `MAX_GUESSES = 5`, `SILHOUETTE_AFTER = 3`; `type GuessError = 'dailyFinished' | 'dailyRepeat' | 'dailyUnknownPlayer'`; `interface Progress { guesses: number[]; won: boolean; finished: boolean }`; `progressOf(guesses: number[], answer: number): Progress`; `applyGuess(guesses: number[], guess: number, answer: number, known: (id: number) => boolean): Progress | { error: GuessError }`; `interface PublicPlayer { id: number; name: string; nation: number; league: number; club: number; position: string; rating: number; cardType: CardType }`; `interface Answer extends PublicPlayer { fullName: string; rareflag: number }`; `interface Silhouette { rating: number; position: string; rareflag: number; cardType: CardType }`; `interface GuessRow { player: PublicPlayer; tiles: Tiles }`; `interface GameView { rows: GuessRow[]; finished: boolean; won: boolean; silhouette?: Silhouette; answer?: Answer }`; `toPublic(r: PlayerRow): PublicPlayer`; `guessRow(guess: PlayerRow, answer: PlayerRow): GuessRow`; `gameView(p: Progress, answer: PlayerRow, lookup: (id: number) => PlayerRow | undefined): GameView`.

- [ ] **Step 1: Write the failing test**

```ts
// server/daily/game.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGuess, gameView, progressOf } from './game.js';
import type { PlayerRow } from './types.js';

const row = (assetId: number, p: Partial<PlayerRow> = {}): PlayerRow => ({
  assetId, name: `P${assetId}`, fullName: `Player ${assetId}`, nation: 18, league: 13, club: 1, position: 'ST', rating: 86, rareflag: 1,
  cardType: 'normal', baseClubs: [], firstSeen: 0, lastSeen: 0, ...p,
});
const ANSWER = row(100);
const rows = new Map([100, 1, 2, 3, 4, 5].map((id) => [id, id === 100 ? ANSWER : row(id, { club: id + 10 })]));
const known = (id: number) => rows.has(id);

test('a right guess wins and finishes', () => {
  assert.deepEqual(applyGuess([1], 100, 100, known), { guesses: [1, 100], won: true, finished: true });
});

test('five wrong guesses lose', () => {
  assert.deepEqual(progressOf([1, 2, 3, 4, 5], 100), { guesses: [1, 2, 3, 4, 5], won: false, finished: true });
});

test('guess errors: finished, unknown, repeat', () => {
  assert.deepEqual(applyGuess([1, 2, 3, 4, 5], 100, 100, known), { error: 'dailyFinished' });
  assert.deepEqual(applyGuess([100], 1, 100, known), { error: 'dailyFinished' });
  assert.deepEqual(applyGuess([1], 999, 100, known), { error: 'dailyUnknownPlayer' });
  assert.deepEqual(applyGuess([1], 1, 100, known), { error: 'dailyRepeat' });
});

test('no answer and no silhouette before 3 misses', () => {
  const v = gameView(progressOf([1, 2], 100), ANSWER, (id) => rows.get(id));
  assert.equal(v.rows.length, 2);
  assert.equal(v.answer, undefined);
  assert.equal(v.silhouette, undefined);
});

test('silhouette after 3 misses carries only rating, position, rarity, card type', () => {
  const v = gameView(progressOf([1, 2, 3], 100), ANSWER, (id) => rows.get(id));
  assert.deepEqual(v.silhouette, { rating: 86, position: 'ST', rareflag: 1, cardType: 'normal' });
  assert.equal(v.answer, undefined);
  assert.equal(JSON.stringify(v).includes('"P100"'), false);
  assert.equal(JSON.stringify(v).includes('100'), false);
});

test('the finished view reveals the answer and drops the silhouette', () => {
  const v = gameView(progressOf([1, 2, 3, 4, 5], 100), ANSWER, (id) => rows.get(id));
  assert.equal(v.silhouette, undefined);
  assert.equal(v.answer?.id, 100);
  assert.equal(v.answer?.fullName, 'Player 100');
  assert.equal(v.rows[0].tiles.club.state, 'miss');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test server/daily/game.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// server/daily/game.ts
// One game (daily or practice): which guesses are allowed and what the browser may see. Before the
// game ends the view never carries the answer's id, name or portrait, only tiles and, after 3 misses,
// the silhouette (rating, position, rarity, card type).
import { compareTiles } from './compare.js';
import type { CardType, PlayerRow, Tiles } from './types.js';

export const MAX_GUESSES = 5;
export const SILHOUETTE_AFTER = 3;
export type GuessError = 'dailyFinished' | 'dailyRepeat' | 'dailyUnknownPlayer';

export interface Progress { guesses: number[]; won: boolean; finished: boolean }
export interface PublicPlayer { id: number; name: string; nation: number; league: number; club: number; position: string; rating: number; cardType: CardType }
export interface Answer extends PublicPlayer { fullName: string; rareflag: number }
export interface Silhouette { rating: number; position: string; rareflag: number; cardType: CardType }
export interface GuessRow { player: PublicPlayer; tiles: Tiles }
export interface GameView { rows: GuessRow[]; finished: boolean; won: boolean; silhouette?: Silhouette; answer?: Answer }

export function progressOf(guesses: number[], answer: number): Progress {
  const won = guesses.includes(answer);
  return { guesses, won, finished: won || guesses.length >= MAX_GUESSES };
}

export function applyGuess(guesses: number[], guess: number, answer: number, known: (id: number) => boolean): Progress | { error: GuessError } {
  if (progressOf(guesses, answer).finished) return { error: 'dailyFinished' };
  if (!known(guess)) return { error: 'dailyUnknownPlayer' };
  if (guesses.includes(guess)) return { error: 'dailyRepeat' };
  return progressOf([...guesses, guess], answer);
}

export const toPublic = (r: PlayerRow): PublicPlayer => ({
  id: r.assetId, name: r.name, nation: r.nation, league: r.league, club: r.club, position: r.position, rating: r.rating, cardType: r.cardType,
});

export const guessRow = (g: PlayerRow, a: PlayerRow): GuessRow => ({ player: toPublic(g), tiles: compareTiles(g, a) });

export function gameView(p: Progress, answer: PlayerRow, lookup: (id: number) => PlayerRow | undefined): GameView {
  const rows = p.guesses.flatMap((id) => {
    const g = lookup(id);
    return g ? [guessRow(g, answer)] : [];
  });
  const view: GameView = { rows, finished: p.finished, won: p.won };
  if (p.finished) view.answer = { ...toPublic(answer), fullName: answer.fullName, rareflag: answer.rareflag };
  else if (p.guesses.length >= SILHOUETTE_AFTER)
    view.silhouette = { rating: answer.rating, position: answer.position, rareflag: answer.rareflag, cardType: answer.cardType };
  return view;
}
```

- [ ] **Step 4: Run it, it passes**

Run: `node --import tsx --test server/daily/game.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git pull --rebase && git add server/daily/game.ts server/daily/game.test.ts
git commit -m "feat(daily): game progress and answer-safe view" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Schema, ingest from cache writes, backfill and pool tuning on real data

**Files:**
- Create: `server/daily/ingest.ts` (+ `ingest.test.ts`), `server/daily/store.ts`, `server/db/daily.ts` (player + answer queries only here; plays in Task 8), `scripts/daily-import.ts`
- Modify: `server/db/schema.ts` (append tables, `pointLedger` index), `server/index.ts:851` (install), `package.json` (`daily:import`), `.env.example`, `docs/architecture.md`
- Generated: `server/db/migrations/0010_*.sql`

**Interfaces:**
- Consumes: `observe`, `mergePlayer` (Task 2); `poolSizes` (Task 3); `collectSquadItems` from `server/gallery/ledger.ts`; `onCacheWrite` from `server/store.ts`; `loadMeta()` from `server/meta.ts` (players names); `db` from `server/db/index.ts`.
- Produces:
  - `itemsFromCache(key: string, data: unknown): unknown[]`, `collectRewardItems(v: unknown): unknown[]` (pure).
  - `store.ts`: `loadPlayers(): Promise<void>`, `playerRows(): Iterable<PlayerRow>`, `playerById(id: number): PlayerRow | undefined`, `ingestItems(items: unknown[], now?: number): Promise<number>` (rows written), `namesList(): { v: number; players: { i: number; n: string; f: string; c: number }[] }`, `installDailyIngest(): void`.
  - `db/daily.ts`: `allPlayers(): Promise<PlayerRow[]>`, `upsertPlayers(rows: PlayerRow[]): Promise<void>`, `firstAnswer(): Promise<{ day: number; dropAt: number } | null>`, `answerFor(day: number): Promise<{ day: number; date: string; assetId: number } | null>`, `insertAnswer(a: { day: number; date: string; dropAt: number; assetId: number }): Promise<void>`, `answersSince(day: number): Promise<number[]>`.
  - Tables `players`, `dailyAnswers`, `dailyPlays`; index `point_ledger_daily`.

- [ ] **Step 1: Write the failing ingest test**

```ts
// server/daily/ingest.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectRewardItems, itemsFromCache } from './ingest.js';

const p = (assetId: number) => ({ itemType: 'player', assetId });

test('club, storage and unassigned lists pass through', () => {
  assert.deepEqual(itemsFromCache('accounts/7/club', [p(1), p(2)]), [p(1), p(2)]);
  assert.deepEqual(itemsFromCache('accounts/7/storage', [p(3)]), [p(3)]);
  assert.deepEqual(itemsFromCache('accounts/7/unassigned', [p(4)]), [p(4)]);
});

test('other keys are ignored', () => {
  assert.deepEqual(itemsFromCache('accounts/7/sets', [p(1)]), []);
  assert.deepEqual(itemsFromCache('accounts/7/gallery', [p(1)]), []);
  assert.deepEqual(itemsFromCache('static', [p(1)]), []);
  assert.deepEqual(itemsFromCache('accounts/7/club', { not: 'a list' }), []);
});

test('objective rewards: player items anywhere in the tree', () => {
  const data = { categories: [{ groupsList: [{ awardsList: [{ itemDataReduced: p(5) }], objectives: [{ awards: [{ itemDataReduced: p(6) }, { itemDataReduced: { itemType: 'pack' } }] }] }] }] };
  assert.deepEqual(itemsFromCache('accounts/7/objectives', data).map((x) => (x as { assetId: number }).assetId).sort(), [5, 6]);
  assert.deepEqual(collectRewardItems(null), []);
});
```

(SBC squad captures go through `collectSquadItems`, already tested in `server/gallery/ledger.test.ts`; the key `accounts/7/challengeSquads/39` must route there.)

- [ ] **Step 2: Run it to verify it fails**

Run: `node --import tsx --test server/daily/ingest.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement the pure ingest**

```ts
// server/daily/ingest.ts
// Which cache writes carry EA player items for the Daily players table, and where they sit.
import { collectSquadItems } from '../gallery/ledger.js';

const WATCHED = /^accounts\/\d+\/(club|storage|unassigned|objectives|challengeSquads\/\d+)$/;

export function collectRewardItems(v: unknown, out: unknown[] = [], depth = 0): unknown[] {
  if (depth > 12 || !v || typeof v !== 'object') return out;
  if (Array.isArray(v)) {
    for (const x of v) collectRewardItems(x, out, depth + 1);
    return out;
  }
  const o = v as Record<string, unknown>;
  if (o.itemType === 'player') out.push(o);
  else for (const x of Object.values(o)) collectRewardItems(x, out, depth + 1);
  return out;
}

export function itemsFromCache(key: string, data: unknown): unknown[] {
  const kind = WATCHED.exec(key)?.[1];
  if (!kind) return [];
  if (kind.startsWith('challengeSquads/')) return collectSquadItems(data);
  if (kind === 'objectives') return collectRewardItems(data);
  return Array.isArray(data) ? data : [];
}
```

Run: `node --import tsx --test server/daily/ingest.test.ts` → PASS (3 tests).

- [ ] **Step 4: Schema**

Append to `server/db/schema.ts` (import `PlayerRow`-free: keep schema self-contained, the `BaseClub` shape inline):

```ts
/** Daily game: every player seen in any cached EA item (server/daily/players.ts merges them). */
export const players = pgTable(
  'players',
  {
    assetId: integer('asset_id').primaryKey(),
    name: text('name').notNull(),
    fullName: text('full_name').notNull(),
    nation: integer('nation').notNull(),
    league: integer('league').notNull(),
    club: integer('club').notNull(),
    position: text('position').notNull(),
    rating: integer('rating').notNull(),
    rareflag: integer('rareflag').notNull(),
    cardType: text('card_type').notNull(), // 'normal' | 'icon' | 'hero'
    baseClubs: jsonb('base_clubs').$type<{ club: number; league: number; lastSeen: number }[]>().notNull().default([]),
    firstSeen: timestamp('first_seen', { withTimezone: true }).notNull(),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull(),
  },
  (t) => [index('players_league_rating').on(t.league, t.rating)],
);

/** Daily game: one secret player per drop; day 1 = the first row. */
export const dailyAnswers = pgTable(
  'daily_answers',
  {
    day: integer('day').primaryKey(),
    date: text('date').notNull(), // YYYY-MM-DD in the drop time zone
    dropAt: timestamp('drop_at', { withTimezone: true }).notNull(),
    assetId: integer('asset_id').notNull(),
    pickedAt: timestamp('picked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('daily_answers_drop').on(t.dropAt)],
);

/** Daily game: a signed-in user's game of one day (guesses = asset ids in order). */
export const dailyPlays = pgTable(
  'daily_plays',
  {
    userId: text('user_id').notNull(),
    day: integer('day').notNull(),
    guesses: jsonb('guesses').$type<number[]>().notNull().default([]),
    won: boolean('won').notNull().default(false),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);
```

In `pointLedger`'s index list add `uniqueIndex('point_ledger_daily').on(t.userId, t.ref).where(sql\`reason = 'daily_streak'\`)` and extend the `reason` comment with `| 'daily_streak'`.

Run: `npm run db:generate` → a new `server/db/migrations/0010_*.sql` creating the three tables and the index. Read it; it must contain no DROP. Start `npm run dev` if it is not running (migrations apply on start) or apply as the project does; check with `docker exec postgresql psql -U postgres -d fcsolver -c '\d players'`.

- [ ] **Step 5: DB queries**

```ts
// server/db/daily.ts
// Postgres side of the Daily game (rules live in server/daily/*).
import { asc, eq, gte, sql } from 'drizzle-orm';
import { db } from './index.js';
import { dailyAnswers, players } from './schema.js';
import type { PlayerRow } from '../daily/types.js';

const toRow = (r: typeof players.$inferSelect): PlayerRow => ({
  ...r, cardType: r.cardType as PlayerRow['cardType'], firstSeen: r.firstSeen.getTime(), lastSeen: r.lastSeen.getTime(),
});

export async function allPlayers(): Promise<PlayerRow[]> {
  return (await db.select().from(players)).map(toRow);
}

export async function upsertPlayers(rows: PlayerRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, firstSeen: new Date(r.firstSeen), lastSeen: new Date(r.lastSeen) }));
    await db.insert(players).values(chunk).onConflictDoUpdate({
      target: players.assetId,
      set: {
        name: sql`excluded.name`, fullName: sql`excluded.full_name`, nation: sql`excluded.nation`, league: sql`excluded.league`,
        club: sql`excluded.club`, position: sql`excluded.position`, rating: sql`excluded.rating`, rareflag: sql`excluded.rareflag`,
        cardType: sql`excluded.card_type`, baseClubs: sql`excluded.base_clubs`, lastSeen: sql`excluded.last_seen`,
      },
    });
  }
}

export async function firstAnswer(): Promise<{ day: number; dropAt: number } | null> {
  const [r] = await db.select({ day: dailyAnswers.day, dropAt: dailyAnswers.dropAt }).from(dailyAnswers).orderBy(asc(dailyAnswers.day)).limit(1);
  return r ? { day: r.day, dropAt: r.dropAt.getTime() } : null;
}

export async function answerFor(day: number): Promise<{ day: number; date: string; assetId: number } | null> {
  const [r] = await db.select({ day: dailyAnswers.day, date: dailyAnswers.date, assetId: dailyAnswers.assetId }).from(dailyAnswers).where(eq(dailyAnswers.day, day));
  return r ?? null;
}

export async function insertAnswer(a: { day: number; date: string; dropAt: number; assetId: number }): Promise<void> {
  await db.insert(dailyAnswers).values({ ...a, dropAt: new Date(a.dropAt) }).onConflictDoNothing();
}

export async function answersSince(day: number): Promise<number[]> {
  return (await db.select({ a: dailyAnswers.assetId }).from(dailyAnswers).where(gte(dailyAnswers.day, day))).map((r) => r.a);
}
```

- [ ] **Step 6: The store (memory + write queue + listener)**

```ts
// server/daily/store.ts
// The players table, kept in memory (a few thousand rows) and written through to Postgres. Fed by
// every cache write that carries EA player items; never calls EA.
import { loadMeta } from '../meta.js';
import { onCacheWrite } from '../store.js';
import { allPlayers, upsertPlayers } from '../db/daily.js';
import { itemsFromCache } from './ingest.js';
import { mergePlayer, observe } from './players.js';
import type { PlayerRow } from './types.js';

const rows = new Map<number, PlayerRow>();
let loaded: Promise<void> | null = null;
let version = 0;
let queue: Promise<unknown> = Promise.resolve();
let names: { v: number; players: { i: number; n: string; f: string; c: number }[] } | null = null;

export function loadPlayers(): Promise<void> {
  return (loaded ??= allPlayers().then((all) => {
    for (const r of all) rows.set(r.assetId, r);
    version++;
  }));
}

export const playerRows = (): Iterable<PlayerRow> => rows.values();
export const playerById = (id: number) => rows.get(id);

/** Merges items into the table; resolves to the number of rows written. One run at a time. */
export function ingestItems(items: unknown[], now = Date.now()): Promise<number> {
  const run = queue.then(async () => {
    await loadPlayers();
    const meta = await loadMeta();
    const changed = new Map<number, PlayerRow>();
    for (const item of items) {
      const o = observe(item);
      if (!o) continue;
      const next = mergePlayer(changed.get(o.assetId) ?? rows.get(o.assetId), o, meta.players[o.assetId], now);
      if (next) changed.set(o.assetId, next);
    }
    if (!changed.size) return 0;
    await upsertPlayers([...changed.values()]);
    for (const r of changed.values()) rows.set(r.assetId, r);
    version++;
    return changed.size;
  });
  queue = run.catch(() => {});
  return run;
}

/** Autocomplete list (every player), rebuilt only when the table changed. */
export function namesList() {
  if (names?.v !== version) names = { v: version, players: [...rows.values()].map((r) => ({ i: r.assetId, n: r.name, f: r.fullName, c: r.club })) };
  return names;
}

export function installDailyIngest() {
  onCacheWrite((key, data) => {
    const items = itemsFromCache(key, data);
    if (items.length) ingestItems(items).catch((err) => console.warn('[daily] players write failed:', err));
  });
}
```

Check `loadMeta`'s exact export name/signature in `server/meta.ts` (it is what `/api/meta` uses when signed out) and use that. In `server/index.ts` next to `installLedger();` add `installDailyIngest();` (import from `./daily/store.js`).

- [ ] **Step 7: Backfill + pool report script**

```ts
// scripts/daily-import.ts
// One-off: fill the Daily players table from what data/accounts already holds, then print the
// answer pool size per rating threshold (to tune DAILY_MIN_RATING). Reads the cache only; no EA call.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { initDb, closeDb } from '../server/db/index.js';
import { DATA_DIR, readCache } from '../server/store.js';
import { itemsFromCache } from '../server/daily/ingest.js';
import { ingestItems, loadPlayers, playerRows } from '../server/daily/store.js';
import { poolSizes } from '../server/daily/pool.js';

await initDb();
await loadPlayers();
const root = join(DATA_DIR, 'accounts');
let written = 0;
for (const persona of await readdir(root).catch(() => [] as string[])) {
  const keys = ['club', 'storage', 'unassigned', 'objectives'].map((n) => `accounts/${persona}/${n}`);
  const squads = await readdir(join(root, persona, 'challengeSquads')).catch(() => [] as string[]);
  keys.push(...squads.filter((f) => f.endsWith('.json')).map((f) => `accounts/${persona}/challengeSquads/${f.slice(0, -5)}`));
  for (const key of keys) {
    const c = await readCache<unknown>(key);
    if (c) written += await ingestItems(itemsFromCache(key, c.data), c.fetchedAt);
  }
}
const all = [...playerRows()];
console.log(`players: ${all.length} rows (${written} written)`);
console.log('pool size by min rating:', poolSizes(all, Date.now(), 75, 86));
await closeDb();
```

Note: the backfill passes each file's `fetchedAt` as `now`, so `lastSeen` / transfer windows reflect when the data was fetched. Add `"daily:import": "tsx scripts/daily-import.ts"` to `package.json` scripts.

- [ ] **Step 8: Run it on real data and tune**

Run: `npm run daily:import`
Expected: `players: N rows`, then a `{ 75: …, …, 86: … }` map. Pick the highest threshold whose pool is ≥ 150 as the default of `DAILY_MIN_RATING` in `service.ts` (Task 8) and `.env.example`. If no threshold reaches 150 on local data (the local cache has one account: on 2026-10-08 club + storage gave only ~53 top-5 base players at 82 and ~121 at 75), keep the default 82 and rely on the adaptive step-down to the floor 75; write the real numbers in the commit body and report them, so the operator can run `npm run daily:import` on the server (with their go-ahead) and set `DAILY_MIN_RATING` there.

Append to `.env.example`:

```
# Daily game: answer pool threshold (steps down to DAILY_RATING_FLOOR until the pool has DAILY_MIN_POOL players)
DAILY_MIN_RATING=82
DAILY_MIN_POOL=150
DAILY_RATING_FLOOR=75
# Daily game token secret (HMAC + AES keys). Optional: without it one is generated into data/daily-secret
DAILY_SECRET=
```

Add a short "Daily game" paragraph to `docs/architecture.md`: players table fed by `onCacheWrite` (club, storage, unassigned, SBC squads, objectives), base vs special cards, transfer rule, pool, daily pick at the drop.

- [ ] **Step 9: Verify and commit**

Run: `npm test && npm run typecheck`
Expected: all tests pass, typecheck clean.

```bash
git pull --rebase && git add server/daily/ingest.* server/daily/store.ts server/db/daily.ts server/db/schema.ts server/db/migrations scripts/daily-import.ts server/index.ts package.json .env.example docs/architecture.md
git commit -m "feat(daily): players table from cache writes and pool backfill" -m "<pool sizes printed by npm run daily:import>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Service, plays transaction, API routes and docs

**Files:**
- Create: `server/daily/service.ts`, `server/daily/routes.ts`
- Modify: `server/db/daily.ts` (plays + guess transaction), `server/auth.ts` (`optionalSiteUser`), `server/index.ts` (register routes, scheduler), `server/seo.ts` (`/daily` page meta), `docs/api.md`

**Interfaces:**
- Consumes: everything above; `lastSbcDrop` from `server/sync.ts`; `SessionError` from `server/ea.ts`; `createLimiter` from `server/limits.ts`; `publicOrigin` from `server/origins.ts`; `pointLedger`, `dailyPlays` tables.
- Produces (HTTP, documented in `docs/api.md`):
  - `GET /api/daily` → `DailyInfo = { day: number; date: string; nextAt: number; maxGuesses: 5; share: string; signedIn: boolean; game?: GameView & { stats: Stats } }` (`game` only when signed in; `share` = host + `/daily` without protocol, from `publicOrigin()`).
  - `GET /api/daily/players` → `{ v: number; players: { i: number; n: string; f: string; c: number }[] }`, `ETag: "<v>"`, `Cache-Control: public, max-age=300`, 304 on `If-None-Match`.
  - `POST /api/daily/guess` body `{ assetId: number; state?: string }` → `GuessResult = { row: GuessRow; finished: boolean; won: boolean; silhouette?: Silhouette; answer?: Answer; state?: string; stats?: Stats; points?: { added: number; streak: number } }`.
  - `POST /api/daily/practice` → `{ token: string }`.
  - `POST /api/daily/practice/guess` body `{ token: string; assetId: number; state?: string }` → `GuessResult` (no `stats`, no `points`).
  - Errors: `dailyFinished` 409, `dailyRepeat` 409, `dailyUnknownPlayer` 400, `dailyNoPool` 503, `dailyExpired` 409, `rateLimited` 429.
- `db/daily.ts` adds: `playsOf(userId: string): Promise<Play[]>` (finished only), `playOf(userId: string, day: number): Promise<number[]>`, `guessDaily(userId: string, day: number, answer: number, guess: number, known: (id: number) => boolean): Promise<{ progress: Progress; points: { added: number; streak: number } | null } | { error: GuessError }>`.

- [ ] **Step 1: Plays and the guess transaction**

Append to `server/db/daily.ts`:

```ts
import { and, isNotNull } from 'drizzle-orm';
import { dailyPlays, pointLedger } from './schema.js';
import { applyGuess, type GuessError, type Progress } from '../daily/game.js';
import { pointsFor, streakOf, type Play } from '../daily/streak.js';

// `tx`: the guess transaction passes itself; type it as the Drizzle transaction type if this alias does not fit
export async function playsOf(userId: string, tx: Pick<typeof db, 'select'> = db): Promise<Play[]> {
  const rows = await tx.select({ day: dailyPlays.day, won: dailyPlays.won, guesses: dailyPlays.guesses }).from(dailyPlays)
    .where(and(eq(dailyPlays.userId, userId), isNotNull(dailyPlays.finishedAt)));
  return rows.map((r) => ({ day: r.day, won: r.won, guesses: r.guesses.length }));
}

export async function playOf(userId: string, day: number): Promise<number[]> {
  const [r] = await db.select({ g: dailyPlays.guesses }).from(dailyPlays).where(and(eq(dailyPlays.userId, userId), eq(dailyPlays.day, day)));
  return r?.g ?? [];
}

/** One guess of a signed-in user, under a row lock: two tabs cannot add two guesses or two point grants. */
export async function guessDaily(userId: string, day: number, answer: number, guess: number, known: (id: number) => boolean):
  Promise<{ progress: Progress; points: { added: number; streak: number } | null } | { error: GuessError }> {
  return db.transaction(async (tx) => {
    await tx.insert(dailyPlays).values({ userId, day }).onConflictDoNothing();
    const [cur] = await tx.select({ g: dailyPlays.guesses }).from(dailyPlays)
      .where(and(eq(dailyPlays.userId, userId), eq(dailyPlays.day, day))).for('update');
    const res = applyGuess(cur?.g ?? [], guess, answer, known);
    if ('error' in res) return res;
    await tx.update(dailyPlays).set({ guesses: res.guesses, won: res.won, finishedAt: res.finished ? new Date() : null })
      .where(and(eq(dailyPlays.userId, userId), eq(dailyPlays.day, day)));
    if (!res.won) return { progress: res, points: null };
    const streak = streakOf(await playsOf(userId, tx), day).current;
    const added = pointsFor(streak);
    if (added > 0)
      await tx.insert(pointLedger).values({ userId, delta: added, reason: 'daily_streak', ref: String(day) }).onConflictDoNothing();
    return { progress: res, points: { added, streak } };
  });
}
```

(Merge the imports with the ones from Task 7 at the top of the file.)

- [ ] **Step 2: `optionalSiteUser`**

In `server/auth.ts` after `siteUser`:

```ts
/** For public endpoints that do more when signed in (/api/daily): a missing or bad token is just "signed out". */
export async function optionalSiteUser(req: FastifyRequest): Promise<string | null> {
  if (!req.headers.authorization) return null;
  try {
    return await siteUser(req);
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Service**

```ts
// server/daily/service.ts
// Today's answer (picked at the drop, or lazily on the first request after it) and the three game
// flows: signed in (state in daily_plays, points), signed out (signed state token), Practice (encrypted
// answer + signed state). The answer never leaves the server before its game is finished.
import { randomBytes, randomInt } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SessionError } from '../ea.js';
import { DATA_DIR } from '../store.js';
import { lastSbcDrop } from '../sync.js';
import { answerFor, answersSince, firstAnswer, guessDaily, insertAnswer, playOf, playsOf } from '../db/daily.js';
import { dayFor, dropDate, nextDropAfter } from './day.js';
import { applyGuess, gameView, guessRow, progressOf, type GameView, type GuessRow, type Silhouette, type Answer } from './game.js';
import { RECENT_DAYS, poolOf } from './pool.js';
import { loadPlayers, playerById, playerRows } from './store.js';
import { statsOf, type Stats } from './streak.js';
import { openPractice, sealPractice, signState, verifyState } from './tokens.js';
import type { PlayerRow } from './types.js';

const TZ = process.env.SBC_DROP_TZ ?? 'Europe/Bucharest';
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
const POOL = {
  minRating: num(process.env.DAILY_MIN_RATING, 82), // tuned in Task 7
  minPool: num(process.env.DAILY_MIN_POOL, 150),
  floor: num(process.env.DAILY_RATING_FLOOR, 75),
};
const PRACTICE_TTL = 24 * 3_600_000;

let secret: Promise<string> | null = null;
export function dailySecret(): Promise<string> {
  return (secret ??= (async () => {
    if (process.env.DAILY_SECRET && process.env.DAILY_SECRET.length >= 16) return process.env.DAILY_SECRET;
    const file = join(DATA_DIR, 'daily-secret');
    const have = (await readFile(file, 'utf8').catch(() => '')).trim();
    if (have.length >= 32) return have;
    const fresh = randomBytes(32).toString('hex');
    await writeFile(file, fresh, { mode: 0o600 });
    return fresh;
  })());
}

const known = (id: number) => playerById(id) !== undefined;
const err = (code: string, status: number, msg: string) => new SessionError(msg, status, code);

export interface Today { day: number; date: string; nextAt: number; answer: PlayerRow }
let today: { drop: number; p: Promise<Today> } | null = null;

/** Today's game; picks and stores the answer once per drop (single flight per process). */
export function todayGame(now = Date.now()): Promise<Today> {
  const drop = lastSbcDrop(new Date(now));
  if (today?.drop === drop) return today.p;
  const p = pick(drop, now);
  today = { drop, p };
  p.catch(() => { if (today?.p === p) today = null; }); // a failed pick (empty pool) is retried next request
  return p;
}

async function pick(drop: number, now: number): Promise<Today> {
  await loadPlayers();
  const day = dayFor(drop, await firstAnswer());
  let row = await answerFor(day);
  if (!row) {
    const recent = new Set(await answersSince(day - RECENT_DAYS));
    const { players } = poolOf(playerRows(), { ...POOL, recent, now });
    if (!players.length) throw err('dailyNoPool', 503, 'The daily game is not ready yet.');
    await insertAnswer({ day, date: dropDate(drop, TZ), dropAt: drop, assetId: players[randomInt(players.length)].assetId });
    row = await answerFor(day); // another process may have won the insert: the stored one counts
  }
  const answer = row && playerById(row.assetId);
  if (!row || !answer) throw err('dailyNoPool', 503, 'The daily game is not ready yet.');
  return { day, date: row.date, nextAt: nextDropAfter((d) => lastSbcDrop(d), now), answer };
}

/** Picks the next answer right after each drop, so the first visitor does not wait. */
export function scheduleDaily() {
  const arm = () => {
    const wait = Math.max(5_000, nextDropAfter((d) => lastSbcDrop(d), Date.now()) - Date.now() + 5_000);
    setTimeout(() => { todayGame().catch((e) => console.warn('[daily] pick failed:', (e as Error).message)).finally(arm); }, Math.min(wait, 2 ** 31 - 1)).unref();
  };
  arm();
}

export interface GuessResult { row: GuessRow; finished: boolean; won: boolean; silhouette?: Silhouette; answer?: Answer; state?: string; stats?: Stats; points?: { added: number; streak: number } }

const result = (view: GameView, extra: Partial<GuessResult> = {}): GuessResult => ({
  row: view.rows[view.rows.length - 1], finished: view.finished, won: view.won,
  ...(view.silhouette ? { silhouette: view.silhouette } : {}), ...(view.answer ? { answer: view.answer } : {}), ...extra,
});

export async function dailyInfo(userId: string | null) {
  const t = await todayGame();
  const base = { day: t.day, date: t.date, nextAt: t.nextAt, maxGuesses: 5 as const, signedIn: !!userId };
  if (!userId) return base;
  const guesses = await playOf(userId, t.day);
  const view = gameView(progressOf(guesses, t.answer.assetId), t.answer, playerById);
  return { ...base, game: { ...view, stats: statsOf(await playsOf(userId), t.day) } };
}

export async function guessToday(userId: string | null, assetId: number, state: unknown): Promise<GuessResult> {
  const t = await todayGame();
  const a = t.answer.assetId;
  if (userId) {
    const r = await guessDaily(userId, t.day, a, assetId, known);
    if ('error' in r) throw guessError(r.error);
    const view = gameView(r.progress, t.answer, playerById);
    return result(view, {
      ...(r.progress.finished ? { stats: statsOf(await playsOf(userId), t.day) } : {}),
      ...(r.points ? { points: r.points } : {}),
    });
  }
  const k = `d${t.day}`;
  const s = state === undefined || state === null ? { k, g: [] } : verifyState(await dailySecret(), state, k);
  if (!s) throw err('dailyExpired', 409, 'This game has expired.');
  const p = applyGuess(s.g, assetId, a, known);
  if ('error' in p) throw guessError(p.error);
  return result(gameView(p, t.answer, playerById), { state: signState(await dailySecret(), { k, g: p.guesses }) });
}

export async function newPractice(now = Date.now()): Promise<{ token: string }> {
  await loadPlayers();
  const { players } = poolOf(playerRows(), { ...POOL, recent: new Set(), now });
  if (!players.length) throw err('dailyNoPool', 503, 'The daily game is not ready yet.');
  const a = players[randomInt(players.length)].assetId;
  return { token: sealPractice(await dailySecret(), { id: randomBytes(9).toString('base64url'), a, exp: now + PRACTICE_TTL }) };
}

export async function guessPractice(token: unknown, assetId: number, state: unknown, now = Date.now()): Promise<GuessResult> {
  const sec = await dailySecret();
  const pr = openPractice(sec, token, now);
  const answer = pr && playerById(pr.a);
  if (!pr || !answer) throw err('dailyExpired', 409, 'This game has expired.');
  const k = `p${pr.id}`;
  const s = state === undefined || state === null ? { k, g: [] } : verifyState(sec, state, k);
  if (!s) throw err('dailyExpired', 409, 'This game has expired.');
  const p = applyGuess(s.g, assetId, pr.a, known);
  if ('error' in p) throw guessError(p.error);
  return result(gameView(p, answer, playerById), { state: signState(sec, { k, g: p.guesses }) });
}

function guessError(code: 'dailyFinished' | 'dailyRepeat' | 'dailyUnknownPlayer') {
  if (code === 'dailyUnknownPlayer') return err(code, 400, 'Pick a player from the list.');
  return err(code, 409, code === 'dailyRepeat' ? 'You already guessed that player.' : 'This game is over.');
}

export { guessRow };
```

(Drop the trailing `export { guessRow }` and the `guessRow` import if unused after typecheck.)

- [ ] **Step 4: Routes**

```ts
// server/daily/routes.ts
// Public Daily game endpoints (docs/api.md). Signed in only adds saved state, stats and points.
import type { FastifyInstance } from 'fastify';
import { optionalSiteUser } from '../auth.js';
import { SessionError } from '../ea.js';
import { createLimiter } from '../limits.js';
import { publicOrigin } from '../origins.js';
import { dailyInfo, guessPractice, guessToday, newPractice } from './service.js';
import { loadPlayers, namesList } from './store.js';

const guessLimit = createLimiter({ windowMs: 60_000, max: 40 });
const tooMany = () => new SessionError('Too many requests, slow down a little.', 429, 'rateLimited');
const assetIdOf = (b: unknown) => {
  const v = (b as { assetId?: unknown } | null)?.assetId;
  if (!Number.isInteger(v) || (v as number) <= 0) throw new SessionError('Pick a player from the list.', 400, 'dailyUnknownPlayer');
  return v as number;
};

export function registerDailyRoutes(app: FastifyInstance) {
  app.get('/api/daily', async (req) => {
    const info = await dailyInfo(await optionalSiteUser(req));
    return { ...info, share: `${publicOrigin(req.headers.host ?? '').replace(/^https?:\/\//, '')}/daily` };
  });

  app.get('/api/daily/players', async (req, reply) => {
    await loadPlayers();
    const list = namesList();
    const etag = `"${list.v}"`;
    reply.header('ETag', etag).header('Cache-Control', 'public, max-age=300');
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    return list;
  });

  app.post<{ Body: { assetId?: unknown; state?: unknown } }>('/api/daily/guess', async (req) => {
    if (!guessLimit(req.ip)) throw tooMany();
    return guessToday(await optionalSiteUser(req), assetIdOf(req.body), req.body?.state);
  });

  app.post('/api/daily/practice', async (req) => {
    if (!guessLimit(req.ip)) throw tooMany();
    return newPractice();
  });

  app.post<{ Body: { token?: unknown; assetId?: unknown; state?: unknown } }>('/api/daily/practice/guess', async (req) => {
    if (!guessLimit(req.ip)) throw tooMany();
    return guessPractice(req.body?.token, assetIdOf(req.body), req.body?.state);
  });
}
```

Check `publicOrigin(claimed)`'s argument in `server/origins.ts` (it takes the claimed origin / host as other callers pass it: copy how robots/sitemap call it). In `server/index.ts` call `registerDailyRoutes(app);` next to `registerAdminRoutes(app);`, and `scheduleDaily();` next to `installDailyIngest();`.

- [ ] **Step 5: SEO page meta**

In `server/seo.ts` `PAGES` add:

```ts
  '/daily': {
    title: 'FC Solver Daily · Guess today\'s EA FC player',
    description:
      'A free daily EA FC guessing game: five tries to find the mystery player from nation, league, club, position, rating and card type. New player every evening, unlimited Practice.',
  },
```

- [ ] **Step 6: Smoke test with curl against the dev server**

Run (dev server running; `npm run daily:import` done):

```bash
curl -s localhost:5178/api/daily | head -c 300; echo
curl -s localhost:5178/api/daily/players | head -c 200; echo
curl -s -X POST localhost:5178/api/daily/guess -H 'content-type: application/json' -d '{"assetId":999999999}'; echo
ID=$(curl -s localhost:5178/api/daily/players | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).players[0].i))')
curl -s -X POST localhost:5178/api/daily/guess -H 'content-type: application/json' -d "{\"assetId\":$ID}" | head -c 400; echo
curl -s -X POST localhost:5178/api/daily/practice; echo
```

Expected: `{ day: 1, date, nextAt, maxGuesses: 5, signedIn: false, share: "localhost:5178/daily" }`; a `{ v, players: [...] }` list; `{"code":"dailyUnknownPlayer"…}`; a guess result with `row.tiles`, a `state` token and **no** `answer`; a `{ token }`. Confirm the guess response contains neither the answer's name nor id (compare with `docker exec postgresql psql -U postgres -d fcsolver -c 'select asset_id from daily_answers'`).

- [ ] **Step 7: Docs**

Add a "Daily game" section to `docs/api.md` with the five endpoints, request / response shapes from the Interfaces block, the error codes, the per-IP limit (40/min on guess and practice), the note that signed-out state is a signed token (replaying an older same-day token only buys extra tries, no points; anonymous games never earn points) and that the answer only appears once `finished`.

- [ ] **Step 8: Verify and commit**

Run: `npm test && npm run typecheck`
Expected: pass, clean.

```bash
git pull --rebase && git add server/daily server/db/daily.ts server/auth.ts server/index.ts server/seo.ts docs/api.md
git commit -m "feat(daily): game service and public API" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Web plumbing: route, API types, pure client helpers

**Files:**
- Modify: `web/src/route.ts` (+ `route.test.ts`), `web/src/Root.tsx`, `web/src/api.ts`
- Create: `web/src/daily/search.ts`, `web/src/daily/share.ts`, `web/src/daily/stats.ts`, `web/src/daily/store.ts`, `web/src/daily/Daily.tsx` (stub that renders the header + title so the route can be checked)
- Test: `web/src/daily/search.test.ts`, `web/src/daily/share.test.ts`, `web/src/daily/stats.test.ts`, `web/src/daily/store.test.ts`

**Interfaces:**
- Produces:
  - `Route` gains `{ view: 'daily'; practice: boolean }`; paths `/daily`, `/daily/practice`.
  - `api.ts` types `DailyTile`, `DailyTiles`, `DailyPlayer`, `DailyAnswer`, `DailySilhouette`, `DailyRow`, `DailyStats`, `DailyGame`, `DailyInfo`, `DailyGuess`, `DailyName` mirroring Task 8, and `api.daily = { info(), players(), guess(assetId, state?), practice(), practiceGuess(token, assetId, state?) }`.
  - `fold(s: string): string`; `indexNames(list: DailyName[]): Indexed[]`; `searchNames(idx: Indexed[], q: string, exclude: ReadonlySet<number>, limit?: number): DailyName[]`.
  - `shareText(o: { day: number; rows: DailyTiles[]; won: boolean; max: number; url: string }): string`.
  - `localStats(plays: LocalPlay[], today: number): DailyStats` (mirror of server `statsOf`).
  - `store.ts`: `loadGame(day: number): SavedGame | null`, `saveGame(g: SavedGame)`, `loadPlays(): LocalPlay[]`, `recordPlay(p: LocalPlay)`, `seenHelp(): boolean`, `markHelpSeen()`; keys `sbc-daily-game`, `sbc-daily-plays`, `sbc-daily-help`.

- [ ] **Step 1: Write the failing tests**

```ts
// web/src/daily/search.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, indexNames, searchNames } from './search';

const list = [
  { i: 1, n: 'Ødegaard', f: 'Martin Ødegaard', c: 1 },
  { i: 2, n: 'Gündoğan', f: 'İlkay Gündoğan', c: 2 },
  { i: 3, n: 'Mbappé', f: 'Kylian Mbappé Lottin', c: 3 },
  { i: 4, n: 'Vini Jr.', f: 'Vinícius José Paixão de Oliveira Júnior', c: 3 },
  { i: 5, n: 'Rodri', f: 'Rodrigo Hernández Cascante', c: 4 },
  { i: 6, n: 'Rodrygo', f: 'Rodrygo Silva de Goes', c: 3 },
];
const idx = indexNames(list);
const ids = (q: string, ex = new Set<number>()) => searchNames(idx, q, ex).map((p) => p.i);

test('fold strips accents and special letters', () => {
  assert.equal(fold('Ødegaard'), 'odegaard');
  assert.equal(fold('İlkay Gündoğan'), 'ilkay gundogan');
  assert.equal(fold('  Mbappé  Lottin '), 'mbappe lottin');
  assert.equal(fold('Straße Łukasz Æ'), 'strasse lukasz ae');
});

test('plain ASCII finds accented names, by stage or full name', () => {
  assert.deepEqual(ids('odeg'), [1]);
  assert.deepEqual(ids('gundo'), [2]);
  assert.deepEqual(ids('kylian'), [3]);
  assert.deepEqual(ids('vinicius'), [4]);
});

test('stage-name prefix ranks first, then word prefix, then substring', () => {
  assert.deepEqual(ids('rod'), [5, 6]);
  assert.deepEqual(ids('her'), [5]); // word prefix in the full name
});

test('short queries and already guessed players give nothing', () => {
  assert.deepEqual(ids('r'), []);
  assert.deepEqual(ids('rod', new Set([5])), [6]);
});
```

```ts
// web/src/daily/share.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareText } from './share';
import type { DailyTiles } from '../api';

const t = (s: string): DailyTiles => {
  const st = (c: string) => ({ state: c === 'g' ? 'hit' : c === 'y' ? 'near' : 'miss' }) as const;
  const [nation, league, club, position, rating, cardType] = [...s].map(st);
  return { nation, league, club, position, rating, cardType };
};

test('won: score, one emoji row per guess, link', () => {
  assert.equal(
    shareText({ day: 42, rows: [t('gy-y-g'), t('gggggg')], won: true, max: 5, url: 'fcsolver.app/daily' }),
    'FC Solver Daily #42 2/5\n🟩🟨⬜🟨⬜🟩\n🟩🟩🟩🟩🟩🟩\nfcsolver.app/daily',
  );
});

test('lost: X/5', () => {
  assert.match(shareText({ day: 7, rows: [t('------')], won: false, max: 5, url: 'x/daily' }), /^FC Solver Daily #7 X\/5\n/);
});
```

```ts
// web/src/daily/stats.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localStats } from './stats';

test('local stats follow the server rules: streak, best, distribution, next milestone', () => {
  const plays = [{ day: 1, won: true, guesses: 2 }, { day: 2, won: false, guesses: 5 }, { day: 3, won: true, guesses: 4 }, { day: 4, won: true, guesses: 1 }];
  assert.deepEqual(localStats(plays, 5), { played: 4, won: 3, current: 2, best: 2, dist: [1, 1, 0, 1, 0], next: { target: 7, points: 1 } });
  assert.equal(localStats(plays, 6).current, 0); // missed day 5
});
```

```ts
// web/src/daily/store.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, loadPlays, recordPlay, saveGame } from './store';

// Node 24 has its own (file-backed, flag-gated) localStorage global: replace it, don't assign over it
const setStorage = (v: unknown) => Object.defineProperty(globalThis, 'localStorage', { value: v, configurable: true, writable: true });

test('storage that throws never breaks the game', () => {
  setStorage({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
  assert.equal(loadGame(3), null);
  assert.deepEqual(loadPlays(), []);
  saveGame({ day: 3, state: 'x', rows: [], finished: false, won: false });
  recordPlay({ day: 3, won: true, guesses: 2 });
});

test('plays are recorded once per day and a saved game only loads for its day', () => {
  const mem = new Map<string, string>();
  setStorage({ getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) });
  recordPlay({ day: 3, won: true, guesses: 2 });
  recordPlay({ day: 3, won: false, guesses: 5 });
  assert.deepEqual(loadPlays(), [{ day: 3, won: true, guesses: 2 }]);
  saveGame({ day: 3, state: 's', rows: [], finished: false, won: false });
  assert.equal(loadGame(4), null);
  assert.equal(loadGame(3)?.state, 's');
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `node --import tsx --test web/src/daily/*.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: API types and helpers**

In `web/src/api.ts` add:

```ts
export type DailyTileState = 'hit' | 'near' | 'miss';
export interface DailyTile { state: DailyTileState; dir?: 'up' | 'down' }
export interface DailyTiles { nation: DailyTile; league: DailyTile; club: DailyTile; position: DailyTile; rating: DailyTile; cardType: DailyTile }
export type DailyCardType = 'normal' | 'icon' | 'hero';
export interface DailyPlayer { id: number; name: string; nation: number; league: number; club: number; position: string; rating: number; cardType: DailyCardType }
export interface DailyAnswer extends DailyPlayer { fullName: string; rareflag: number }
export interface DailySilhouette { rating: number; position: string; rareflag: number; cardType: DailyCardType }
export interface DailyRow { player: DailyPlayer; tiles: DailyTiles }
export interface DailyStats { played: number; won: number; current: number; best: number; dist: number[]; next: { target: number; points: number } }
export interface DailyGame { rows: DailyRow[]; finished: boolean; won: boolean; silhouette?: DailySilhouette; answer?: DailyAnswer; stats: DailyStats }
export interface DailyInfo { day: number; date: string; nextAt: number; maxGuesses: number; share: string; signedIn: boolean; game?: DailyGame }
export interface DailyGuess { row: DailyRow; finished: boolean; won: boolean; silhouette?: DailySilhouette; answer?: DailyAnswer; state?: string; stats?: DailyStats; points?: { added: number; streak: number } }
export interface DailyName { i: number; n: string; f: string; c: number }
```

and inside `export const api = { … }`:

```ts
  daily: {
    info: () => req<DailyInfo>('/api/daily'),
    players: () => req<{ v: number; players: DailyName[] }>('/api/daily/players'),
    guess: (assetId: number, state?: string) => req<DailyGuess>('/api/daily/guess', { method: 'POST', body: { assetId, state } }),
    practice: () => req<{ token: string }>('/api/daily/practice', { method: 'POST' }),
    practiceGuess: (token: string, assetId: number, state?: string) =>
      req<DailyGuess>('/api/daily/practice/guess', { method: 'POST', body: { token, assetId, state } }),
  },
```

Check `req()`: when signed out it must not redirect to sign-in on these public calls (it sends the Bearer token only when one exists; `/api/daily*` never answers 401). If `req` adds `X-Persona` that is harmless.

- [ ] **Step 4: Pure helpers**

```ts
// web/src/daily/search.ts
// Client-side autocomplete over every known player: accent- and case-insensitive, stage name first.
import type { DailyName } from '../api';

const SPECIAL: Record<string, string> = { ø: 'o', ß: 'ss', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i' };

export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[øßæœłđðþı]/g, (c) => SPECIAL[c])
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Indexed { p: DailyName; n: string; f: string; words: string[] }

export const indexNames = (list: DailyName[]): Indexed[] =>
  list.map((p) => {
    const n = fold(p.n);
    const f = fold(p.f);
    return { p, n, f, words: [...n.split(/[\s.'-]+/), ...f.split(/[\s.'-]+/)].filter(Boolean) };
  });

export function searchNames(idx: Indexed[], q: string, exclude: ReadonlySet<number>, limit = 8): DailyName[] {
  const k = fold(q);
  if (k.length < 2) return [];
  const scored: { p: DailyName; s: number; n: string }[] = [];
  for (const e of idx) {
    if (exclude.has(e.p.i)) continue;
    const s = e.n.startsWith(k) ? 0 : e.words.some((w) => w.startsWith(k)) || e.f.startsWith(k) ? 1 : e.n.includes(k) || e.f.includes(k) ? 2 : -1;
    if (s >= 0) scored.push({ p: e.p, s, n: e.n });
  }
  scored.sort((a, b) => a.s - b.s || a.n.length - b.n.length || a.n.localeCompare(b.n));
  return scored.slice(0, limit).map((x) => x.p);
}
```

```ts
// web/src/daily/share.ts
// The share text: no names, only the emoji grid (tile order: nation, league, club, position, rating, card).
import type { DailyTiles } from '../api';

const KEYS = ['nation', 'league', 'club', 'position', 'rating', 'cardType'] as const;
const EMOJI = { hit: '🟩', near: '🟨', miss: '⬜' } as const;

export function shareText(o: { day: number; rows: DailyTiles[]; won: boolean; max: number; url: string }): string {
  const score = o.won ? `${o.rows.length}/${o.max}` : `X/${o.max}`;
  const grid = o.rows.map((r) => KEYS.map((k) => EMOJI[r[k].state]).join(''));
  return [`FC Solver Daily #${o.day} ${score}`, ...grid, o.url].join('\n');
}
```

```ts
// web/src/daily/stats.ts
// Signed-out stats in the browser; same rules as server/daily/streak.ts (keep them in step).
import type { DailyStats } from '../api';

export interface LocalPlay { day: number; won: boolean; guesses: number }

const pointsFor = (s: number) => (s <= 0 ? 0 : s % 30 === 0 ? 2 : s % 30 === 7 || s % 30 === 14 ? 1 : 0);

export function localStats(plays: LocalPlay[], today: number): DailyStats {
  const byDay = new Map(plays.map((p) => [p.day, p.won]));
  let d = byDay.has(today) ? today : today - 1;
  let current = 0;
  while (byDay.get(d) === true) { current++; d--; }
  let best = 0, run = 0, prev = Number.NEGATIVE_INFINITY;
  for (const day of plays.filter((p) => p.won).map((p) => p.day).sort((a, b) => a - b)) {
    run = day === prev + 1 ? run + 1 : 1;
    prev = day;
    best = Math.max(best, run);
  }
  const dist = [0, 0, 0, 0, 0];
  for (const p of plays) if (p.won && p.guesses >= 1 && p.guesses <= 5) dist[p.guesses - 1]++;
  let target = current + 1;
  while (pointsFor(target) === 0) target++;
  return { played: plays.length, won: plays.filter((p) => p.won).length, current, best, dist, next: { target, points: pointsFor(target) } };
}
```

```ts
// web/src/daily/store.ts
// Signed-out Daily state in localStorage: today's game (rows + signed state token) and finished plays.
import type { DailyAnswer, DailyRow, DailySilhouette } from '../api';
import type { LocalPlay } from './stats';

export interface SavedGame { day: number; state: string; rows: DailyRow[]; finished: boolean; won: boolean; silhouette?: DailySilhouette; answer?: DailyAnswer }

const GAME = 'sbc-daily-game';
const PLAYS = 'sbc-daily-plays';
const HELP = 'sbc-daily-help';

function read<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  } catch {
    /* private mode / blocked storage: the game still works, it just forgets */
  }
}

export const loadGame = (day: number): SavedGame | null => {
  const g = read<SavedGame>(GAME);
  return g && g.day === day && Array.isArray(g.rows) ? g : null;
};
export const saveGame = (g: SavedGame) => write(GAME, g);
export const loadPlays = (): LocalPlay[] => {
  const p = read<LocalPlay[]>(PLAYS);
  return Array.isArray(p) ? p : [];
};
export function recordPlay(p: LocalPlay) {
  const all = loadPlays();
  if (all.some((x) => x.day === p.day)) return;
  write(PLAYS, [...all, p].slice(-400));
}
export const seenHelp = () => read<string>(HELP) !== null;
export const markHelpSeen = () => write(HELP, '1');
```

Note: `seenHelp` reads with `JSON.parse('1')` → `1`, non-null: fine.

- [ ] **Step 5: Route + Root**

`web/src/route.ts`: add `| { view: 'daily'; practice: boolean }` to `Route`; in `parseRoute` before the `dashboard` handling: `if (a === 'daily') return { view: 'daily', practice: b === 'practice' };`; in `routePath`: `case 'daily': return r.practice ? '/daily/practice' : '/daily';`. Add to `web/src/route.test.ts`:

```ts
test('daily routes', () => {
  assert.deepEqual(parseRoute('/daily'), { view: 'daily', practice: false });
  assert.deepEqual(parseRoute('/daily/practice'), { view: 'daily', practice: true });
  assert.equal(routePath({ view: 'daily', practice: false }), '/daily');
  assert.equal(routePath({ view: 'daily', practice: true }), '/daily/practice');
});
```

`web/src/Root.tsx`: `const Daily = lazy(() => import('./daily/Daily'));`; add `route.view === 'daily'` to `publicView`; add `'daily'` to the `titled` check so the tab reads `t('meta.daily')`; render right after the landing branch:

```tsx
  // the Daily game is public; it waits for Clerk only to know whether stats are saved to an account
  if (route.view === 'daily')
    return (
      <Suspense fallback={<div className="boot" aria-busy="true" />}>
        <Daily signedIn={!!isSignedIn} authReady={isLoaded} practice={route.practice} navigate={navigate} />
      </Suspense>
    );
```

`web/src/daily/Daily.tsx` stub (replaced in Task 10):

```tsx
import type { Route } from '../route';
import { useI18n } from '../i18n';
import './daily.css';

export default function Daily(_: { signedIn: boolean; authReady: boolean; practice: boolean; navigate: (r: Route) => void }) {
  const { t } = useI18n();
  return <main className="dg"><h1>{t('daily.name')}</h1></main>;
}
```

Create an empty `web/src/daily/daily.css` and add to all three locales: `'meta.daily'` (EN `FC Solver Daily · Guess today's EA FC player`, RO `FC Solver Daily · Ghicește jucătorul EA FC al zilei`, IT `FC Solver Daily · Indovina il giocatore EA FC di oggi`) and `'daily.name': 'FC Solver Daily'` (same in all three).

- [ ] **Step 6: Verify**

Run: `node --import tsx --test web/src/daily/*.test.ts web/src/route.test.ts && npm run typecheck && npm run i18n:check`
Expected: PASS; clean. Open `http://localhost:5173/daily` → the stub heading renders signed out (no redirect to /signin).

- [ ] **Step 7: Commit**

```bash
git pull --rebase && git add web/src/route.ts web/src/route.test.ts web/src/Root.tsx web/src/api.ts web/src/daily web/src/locales
git commit -m "feat(daily): web route, API client and pure helpers" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: The /daily page (game, motion, sheets)

Load `frontend-design:frontend-design` first. Read `DESIGN.md`, `web/src/styles.css` tokens, `web/src/components/Card.tsx`, an existing modal (e.g. `web/src/components/ClubSyncModal.tsx`) and `web/src/landing/Landing.tsx` header before writing.

**Files:**
- Modify: `web/src/daily/Daily.tsx` (full page), `web/src/daily/daily.css`, `DESIGN.md` (`--near`), `web/src/locales/{en,ro,it}.ts`
- Create: `web/src/daily/Search.tsx`, `Grid.tsx`, `MysteryCard.tsx`, `Silhouette.tsx`, `Sheets.tsx`, `Countdown.tsx`

**Interfaces:**
- Consumes: `api.daily.*`, `api.meta()`, types (Task 9); `searchNames`, `indexNames`, `shareText`, `localStats`, `store.ts` (Task 9); `Card`, `cardArt` (`web/src/components/Card.tsx`); `LangMenu`; `errorText` (`web/src/messages.ts`); `useI18n`.
- Produces: `Silhouette` component `({ className?: string }) => JSX` (an inline SVG head-and-shoulders shape, `aria-hidden`), reused by the landing teaser (Task 11); `MysteryCard` props `{ meta: Meta | null; silhouette?: DailySilhouette; answer?: DailyAnswer; won: boolean; reveal: boolean }`.

**Behaviour (must all be true):**
- Header: logo → `/`, `LangMenu`, then "Sign in" (signed out) or "Dashboard" (signed in) links via `routePath`. Tabs "Today" / "Practice" (links to `/daily` and `/daily/practice`, `aria-current`).
- Title "FC Solver Daily #N" (Practice: "Practice") + date; "How to play" and "Stats" icon buttons (Phosphor `Question`, `ChartBar`), 8px radius.
- Load order: wait for `authReady`, then `api.daily.info()`, `api.daily.players()` and `api.meta()` in parallel. Signed in → render `info.game`. Signed out → `loadGame(info.day)` or a fresh game. Practice → `api.daily.practice()` for a token, state in component memory only.
- Search: one combobox (`role="combobox"`, `aria-expanded`, `aria-controls`, listbox options with `aria-selected`), ↑ ↓ move, Enter guesses the highlighted option, Esc closes; each option shows the club badge (`${contentBase}/items/images/mobile/clubs/dark/${c}.png`, alt = club name from meta) + stage name + full name in `--ink-3`. Already guessed players excluded. Disabled while a guess is in flight and once finished. A refused guess (`dailyRepeat`, `dailyUnknownPlayer`) shakes the field and shows the translated error under it (`role="alert"`).
- Grid: column header row (flag / league / club / position / rating / card icons with sr-only labels), one row per guess with the guessed player's name above it, then empty dashed rows up to 5. Tile = image or value + state glyph (✓ hit, ≈ near, ✕ miss) + sr-only `t('daily.state.*')`; rating tile shows the number and ↑/↓ (`ArrowUp`/`ArrowDown`) with sr-only `t('daily.dir.*')`. Colours: hit `--go` background + dark ink, near `--near` + dark ink, miss `--surface-2` + `--ink-2`. `grid-template-columns: repeat(6, minmax(0, 1fr))`; at ≤ 420px tiles show the image / value + glyph only, never horizontal scroll.
- MysteryCard slot (beside the grid on desktop, above it on phones): before 3 misses a card back with "?"; after 3 misses the silhouette (rarity background from `cardArt`, rating + position text, `<Silhouette />` instead of a portrait; no `<img>` with a portrait URL); at the end the full `Card` (adapter below). Won: the silhouette brightens into the card with a gold sheen sweep; lost: the card flips (rotateY) to reveal.
- End panel: "Got it! n/5" or "Not this time. It was: <name>", Share button (`navigator.clipboard.writeText(shareText(...))`, then "Copied" for 2s; fall back to selecting a `<textarea>` if clipboard is denied), countdown to `nextAt` (`Countdown` ticking each second, `aria-live="off"`, reloads `info` when it hits 0), "Play Practice" (daily) / "Another one" (practice). Signed out: a line inviting sign-in to save stats and earn points.
- Stats sheet (bottom sheet, `role="dialog"`, `aria-modal`, focus trapped, Esc closes): played, win %, current / best streak (Barlow Condensed numbers), guess distribution bars (today's bar uses `--go`), and when signed in "Next reward: +p at streak N"; opens automatically ~1.2s after the end (immediately with reduced motion). When `points.added > 0`, a small burst (8 CSS particles) and the `daily.points.won_*` line.
- How-to sheet: same sheet component; opens on the first visit (`seenHelp()` false → open, `markHelpSeen()` on close); content from the `daily.how.*` keys including the data source and points rules.
- Signed out daily: after each guess `saveGame({ day, state, rows, finished, won, silhouette, answer })`; when finished `recordPlay({ day, won, guesses: rows.length })`; stats sheet uses `localStats(loadPlays(), day)`. If a guess returns `dailyExpired` (day rolled over), clear the saved game and reload `info`. Practice `dailyExpired` → start a new practice.
- Motion (CSS only, all inside `@media (prefers-reduced-motion: no-preference)`): tile flip `rotateX(90deg) → 0` 450ms with `--i * 110ms` stagger, only on the newest row (`.dg-row.fresh`); shake 380ms; silhouette rise (translateY 24px + opacity) 500ms; reveal sheen (`linear-gradient` sweep on `::after`) 900ms; lose flip 700ms; sheet slide-up 280ms; burst 700ms. Without motion the final states show at once.

- [ ] **Step 1: Card adapter and Silhouette**

```tsx
// web/src/daily/Silhouette.tsx
// A generic player silhouette for the mystery card: never the real portrait (that would give the answer away).
export function Silhouette({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" aria-hidden="true" focusable="false">
      <path d="M60 14c-14 0-24 11-24 25 0 9 4 17 10 22-15 5-27 15-31 30-1 4 2 7 6 7h78c4 0 7-3 6-7-4-15-16-25-31-30 6-5 10-13 10-22 0-14-10-25-24-25z" fill="currentColor" />
    </svg>
  );
}
```

In `MysteryCard.tsx`:

```tsx
import type { DailyAnswer, Meta, Player } from '../api';

/** The revealed answer as a Card player (gold tier; Card only reads these fields). */
export const toCardPlayer = (a: DailyAnswer): Player => ({
  id: a.id, assetId: a.id, resourceId: a.id, name: a.name, fullName: a.fullName, rating: a.rating, rareflag: a.rareflag, tier: 3,
  preferredPosition: a.position, possiblePositions: [a.position], club: a.club, league: a.league, nation: a.nation,
  untradeable: true, state: 'free', isLoan: false, rarityName: '', attributes: [], skillMoves: 0, weakFoot: 0, foot: 'Right',
});
```

The silhouette background: `cardArt({ ...toCardPlayer({ id: 0, name: '', fullName: '', nation: 0, league: 0, club: 0, position: s.position, rating: s.rating, rareflag: s.rareflag, cardType: s.cardType }), }, meta).bg` (only `bg` and `text` are used; never render `portrait`).

- [ ] **Step 2: Build the components and page** following the behaviour list above (Search, Grid, MysteryCard, Sheets, Countdown, Daily). Keep each file focused; state lives in `Daily.tsx` (`info`, `rows`, `state`, `finished`, `won`, `silhouette`, `answer`, `stats`, `points`, `token` for practice, `busy`, `error`, `sheet: 'help' | 'stats' | null`, `fresh` row index).

- [ ] **Step 3: Styles** in `web/src/daily/daily.css` (prefix `dg-`), using the existing tokens; add `--near: oklch(0.78 0.14 62);` on `.dg` and document it in `DESIGN.md` under Color: "`--near` oklch(0.78 0.14 62): Daily 'close' tiles only (amber, distinct from `--pos`)". Check contrast: dark ink on `--go` and on `--near` ≥ 4.5:1, `--ink-2` on `--surface-2` ≥ 4.5:1.

- [ ] **Step 4: Text** — add to `en.ts`, `ro.ts`, `it.ts` (exact strings):

| key | en | ro | it |
|---|---|---|---|
| `daily.title` | `FC Solver Daily #{n}` | `FC Solver Daily #{n}` | `FC Solver Daily #{n}` |
| `daily.tab.today` | `Today` | `Azi` | `Oggi` |
| `daily.tab.practice` | `Practice` | `Antrenament` | `Allenamento` |
| `daily.search.label` | `Guess a player` | `Ghicește un jucător` | `Indovina un giocatore` |
| `daily.search.placeholder` | `Type a player name…` | `Scrie numele unui jucător…` | `Scrivi il nome di un giocatore…` |
| `daily.search.none` | `No player found` | `Niciun jucător găsit` | `Nessun giocatore trovato` |
| `daily.left_one` | `{count} guess left` | `{count} încercare rămasă` | `{count} tentativo rimasto` |
| `daily.left_few` | — | `{count} încercări rămase` | — |
| `daily.left_other` | `{count} guesses left` | `{count} de încercări rămase` | `{count} tentativi rimasti` |
| `daily.col.nation` | `Nation` | `Națiune` | `Nazione` |
| `daily.col.league` | `League` | `Ligă` | `Campionato` |
| `daily.col.club` | `Club` | `Club` | `Club` |
| `daily.col.position` | `Position` | `Poziție` | `Ruolo` |
| `daily.col.rating` | `Rating` | `Rating` | `Valutazione` |
| `daily.col.cardType` | `Card` | `Card` | `Carta` |
| `daily.state.hit` | `match` | `potrivire` | `esatto` |
| `daily.state.near` | `close` | `aproape` | `vicino` |
| `daily.state.miss` | `no match` | `nu se potrivește` | `diverso` |
| `daily.dir.up` | `the answer is higher` | `răspunsul e mai mare` | `la risposta è più alta` |
| `daily.dir.down` | `the answer is lower` | `răspunsul e mai mic` | `la risposta è più bassa` |
| `daily.card.normal` | `Player` | `Jucător` | `Giocatore` |
| `daily.card.icon` | `Icon` | `Icon` | `Icon` |
| `daily.card.hero` | `Hero` | `Hero` | `Hero` |
| `daily.mystery` | `Mystery player` | `Jucătorul misterios` | `Giocatore misterioso` |
| `daily.mysteryHint` | `After 3 misses you see the silhouette.` | `După 3 greșeli vezi silueta.` | `Dopo 3 errori vedi la sagoma.` |
| `daily.won` | `Got it! {n}/{max}` | `Ai ghicit! {n}/{max}` | `Indovinato! {n}/{max}` |
| `daily.lost` | `Not this time. It was:` | `Nu de data asta. Era:` | `Non stavolta. Era:` |
| `daily.next` | `Next player in` | `Următorul jucător în` | `Prossimo giocatore tra` |
| `daily.share` | `Share` | `Distribuie` | `Condividi` |
| `daily.copied` | `Copied` | `Copiat` | `Copiato` |
| `daily.playPractice` | `Play Practice` | `Joacă Antrenament` | `Gioca Allenamento` |
| `daily.another` | `Another one` | `Încă unul` | `Un altro` |
| `daily.practiceNote` | `Practice: unlimited players, no streak or points.` | `Antrenament: jucători nelimitați, fără serie sau puncte.` | `Allenamento: giocatori illimitati, niente serie né punti.` |
| `daily.help` | `How to play` | `Cum se joacă` | `Come si gioca` |
| `daily.stats` | `Stats` | `Statistici` | `Statistiche` |
| `daily.close` | `Close` | `Închide` | `Chiudi` |
| `daily.signIn` | `Sign in to keep your stats on every device and earn invite points from streaks.` | `Autentifică-te ca să-ți păstrezi statisticile pe orice dispozitiv și să câștigi puncte de invitație din serii.` | `Accedi per avere le statistiche su ogni dispositivo e guadagnare punti invito con le serie.` |
| `daily.stats.played` | `Played` | `Jucate` | `Giocate` |
| `daily.stats.winPct` | `Win %` | `% câștigate` | `% vinte` |
| `daily.stats.current` | `Current streak` | `Seria curentă` | `Serie attuale` |
| `daily.stats.best` | `Best streak` | `Cea mai bună serie` | `Serie migliore` |
| `daily.stats.dist` | `Guess distribution` | `Distribuția încercărilor` | `Distribuzione dei tentativi` |
| `daily.stats.next` | `Next reward: +{points} at a {target}-win streak` | `Următoarea recompensă: +{points} la seria {target}` | `Prossimo premio: +{points} alla serie {target}` |
| `daily.points.won_one` | `+{count} invite point for your {streak}-win streak!` | `+{count} punct de invitație pentru seria ta de {streak}!` | `+{count} punto invito per la tua serie di {streak}!` |
| `daily.points.won_few` | — | `+{count} puncte de invitație pentru seria ta de {streak}!` | — |
| `daily.points.won_other` | `+{count} invite points for your {streak}-win streak!` | `+{count} de puncte de invitație pentru seria ta de {streak}!` | `+{count} punti invito per la tua serie di {streak}!` |
| `daily.how.goal` | `Guess today's EA FC player in 5 tries. Everyone gets the same player.` | `Ghicește jucătorul EA FC al zilei din 5 încercări. Toată lumea are același jucător.` | `Indovina il giocatore EA FC di oggi in 5 tentativi. Il giocatore è lo stesso per tutti.` |
| `daily.how.tiles` | `Every guess shows 6 tiles compared with the mystery player:` | `Fiecare încercare arată 6 căsuțe comparate cu jucătorul misterios:` | `Ogni tentativo mostra 6 caselle confrontate con il giocatore misterioso:` |
| `daily.how.hit` | `✓ Green: the same.` | `✓ Verde: la fel.` | `✓ Verde: uguale.` |
| `daily.how.near` | `≈ Amber: close. Nation from the same confederation, league in the same country, position in the same line (defence, midfield, attack), rating within 2.` | `≈ Portocaliu: aproape. Națiune din aceeași confederație, ligă din aceeași țară, poziție pe aceeași linie (apărare, mijloc, atac), rating la cel mult 2 diferență.` | `≈ Ambra: vicino. Nazione della stessa confederazione, campionato dello stesso paese, ruolo nella stessa linea (difesa, centrocampo, attacco), valutazione entro 2.` |
| `daily.how.miss` | `✕ Grey: different. Arrows show whether the answer's rating is higher or lower.` | `✕ Gri: diferit. Săgețile arată dacă ratingul răspunsului e mai mare sau mai mic.` | `✕ Grigio: diverso. Le frecce indicano se la valutazione della risposta è più alta o più bassa.` |
| `daily.how.silhouette` | `After 3 misses the mystery card appears as a silhouette, with its rating and position.` | `După 3 greșeli cardul misterios apare ca siluetă, cu rating și poziție.` | `Dopo 3 errori la carta misteriosa appare come sagoma, con valutazione e ruolo.` |
| `daily.how.reset` | `A new player every day at 20:01, Romania time.` | `Un jucător nou în fiecare zi la 20:01, ora României.` | `Un nuovo giocatore ogni giorno alle 20:01, ora della Romania.` |
| `daily.how.practice` | `Practice: unlimited random players, no streak and no points.` | `Antrenament: jucători aleși la întâmplare, nelimitat, fără serie și fără puncte.` | `Allenamento: giocatori casuali illimitati, niente serie e niente punti.` |
| `daily.how.points` | `Signed in, daily wins in a row build a streak: 7 wins +1 invite point, 14 wins +1, 30 wins +2, then again every 30 (37, 44, 60…). A lost or missed day resets it. Points can be withdrawn on abuse.` | `Autentificat, victoriile zilnice la rând fac o serie: 7 victorii +1 punct de invitație, 14 victorii +1, 30 de victorii +2, apoi din nou la fiecare 30 (37, 44, 60…). O zi pierdută sau ratată o resetează. Punctele pot fi retrase în caz de abuz.` | `Con l'accesso, le vittorie giornaliere di fila creano una serie: 7 vittorie +1 punto invito, 14 vittorie +1, 30 vittorie +2, poi di nuovo ogni 30 (37, 44, 60…). Un giorno perso o saltato la azzera. I punti possono essere ritirati in caso di abuso.` |
| `daily.how.source` | `Players come from FC Solver's own database, built from the EA FC data the FC Solver extension sees. A very recent transfer can show the old club for a while.` | `Jucătorii vin din baza de date proprie FC Solver, construită din datele EA FC pe care le vede extensia FC Solver. Un transfer foarte recent poate arăta o vreme clubul vechi.` | `I giocatori vengono dal database di FC Solver, costruito con i dati EA FC che vede l'estensione FC Solver. Un trasferimento molto recente può mostrare per un po' il vecchio club.` |
| `err.dailyFinished` | `This game is over. Come back for the next player.` | `Jocul s-a terminat. Revino pentru următorul jucător.` | `La partita è finita. Torna per il prossimo giocatore.` |
| `err.dailyRepeat` | `You already guessed that player.` | `L-ai încercat deja pe acest jucător.` | `Hai già provato questo giocatore.` |
| `err.dailyUnknownPlayer` | `Pick a player from the list.` | `Alege un jucător din listă.` | `Scegli un giocatore dalla lista.` |
| `err.dailyNoPool` | `The daily game is not ready yet. Try again later.` | `Jocul zilei nu e gata încă. Încearcă mai târziu.` | `Il gioco del giorno non è ancora pronto. Riprova più tardi.` |
| `err.dailyExpired` | `This game has expired. Starting a fresh one.` | `Jocul a expirat. Începem unul nou.` | `La partita è scaduta. Ne iniziamo una nuova.` |

Reuse existing keys for "Sign in" (`landing.signIn`) and the home link (`top.home`); add `'daily.dashboard'`: `Dashboard` / `Panou` / `Dashboard` only if no existing key says it (grep `'Dashboard'` in `en.ts` first).

- [ ] **Step 5: Verify in the browser** (dev server running; `npm run daily:import` done). Use the `claude-in-chrome` skill. At 1280px and 390px, signed out and signed in, with and without reduced motion (DevTools rendering emulation):
  1. `/daily`: the how-to sheet opens on first visit; search "odeg"/"mbap" etc. works with keyboard only; 3 wrong guesses → silhouette rises; the Network tab shows no portrait request and no answer name/id in any response before the end; finish (lose on purpose, then check the answer appears, the card flips, share copies the exact format, countdown ticks).
  2. Reload mid-game signed out → same rows; signed in → same rows from the server on a second browser profile.
  3. `/daily/practice`: "Another one" starts a new player; no stats change.
  4. 390px: no horizontal scroll (`document.documentElement.scrollWidth === 390`), tiles readable, sheet usable.
  5. Reduced motion: no animation, final states shown.
  Fix what fails before moving on. Save screenshots to the scratchpad and mention them in the report.

- [ ] **Step 6: Verify and commit**

Run: `npm test && npm run typecheck && npm run i18n:check && npm run build`
Expected: all pass; build prints a separate `Daily-*.js` chunk.

```bash
git pull --rebase && git add web/src/daily web/src/locales DESIGN.md
git commit -m "feat(daily): guess-the-player page with animated tiles and reveal" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Landing teaser and dashboard entry

Load `frontend-design:frontend-design` first.

**Files:**
- Create: `web/src/landing/DailyTeaser.tsx`
- Modify: `web/src/landing/Landing.tsx:77-101`, `web/src/landing/landing.css`, `web/src/App.tsx:~823` (sidebar), `web/src/locales/{en,ro,it}.ts`

**Interfaces:**
- Consumes: `Silhouette` (Task 10), `api.daily.info()` (Task 9), `routePath`, the landing `link()` helper pattern, `DEMO_META` art from `web/src/landing/demo.ts`.

**Behaviour:**
- `<DailyTeaser />` right after `<Hero />`, `id="daily"`: kicker, title, one sentence, CTA link "Play today's game" → `/daily` (`lp-btn`), and an animated mystery card (gold rare background from the demo art, `<Silhouette />`, "?" in the name strip) with a demo row of 6 tiles (fixed example: ✓ nation, ≈ league, ✕ club, ≈ position, ↑ rating, ✓ card) flipping in when the section scrolls into view (use the landing's existing scroll / IntersectionObserver helper in `motion.ts`), a slow float + sheen on the card. Static under reduced motion. Day number "Daily #N" fetched with `api.daily.info()` after mount; hidden if the call fails.
- Landing header nav: a link "Daily game" to `/daily` (real link, not a hash), placed first in `lp-nav`.
- Dashboard sidebar in `App.tsx`: a "Daily" `nav-item` (Phosphor `SoccerBall`) after "Objectives", `onClick={() => navigate({ view: 'daily', practice: false })}` (full navigation to the public page). Check how `go()` vs `navigate` is used and that the hamburger menu (< 860px) shows it too.
- Text:

| key | en | ro | it |
|---|---|---|---|
| `nav.daily` | `Daily game` | `Jocul zilei` | `Gioco del giorno` |
| `landing.nav.daily` | `Daily game` | `Jocul zilei` | `Gioco del giorno` |
| `landing.daily.kicker` | `New · FC Solver Daily` | `Nou · FC Solver Daily` | `Novità · FC Solver Daily` |
| `landing.daily.title` | `Guess today's player` | `Ghicește jucătorul zilei` | `Indovina il giocatore di oggi` |
| `landing.daily.text` | `Five tries. Nation, league, club, position, rating and card type tell you how close you are. A new player every evening at 20:01.` | `Cinci încercări. Națiunea, liga, clubul, poziția, ratingul și tipul cardului îți arată cât de aproape ești. Un jucător nou în fiecare seară la 20:01.` | `Cinque tentativi. Nazione, campionato, club, ruolo, valutazione e tipo di carta ti dicono quanto sei vicino. Un nuovo giocatore ogni sera alle 20:01.` |
| `landing.daily.cta` | `Play today's game` | `Joacă jocul zilei` | `Gioca la partita di oggi` |
| `landing.daily.day` | `Daily #{n}` | `Daily #{n}` | `Daily #{n}` |
| `landing.daily.demo` | `Example guess` | `Exemplu de încercare` | `Esempio di tentativo` |

- [ ] **Step 1: Build the teaser, the nav link and the sidebar entry** per the behaviour above.
- [ ] **Step 2: Browser check** at 1280px and 390px: the teaser sits right after the hero, animates in once, CTA opens `/daily`; header link works (and is reachable in the landing's phone layout); dashboard sidebar and hamburger menu "Daily" open `/daily`; reduced motion shows the static final state; no horizontal scroll.
- [ ] **Step 3: Verify and commit**

Run: `npm test && npm run typecheck && npm run i18n:check && npm run build`

```bash
git pull --rebase && git add web/src/landing web/src/App.tsx web/src/locales
git commit -m "feat(landing): daily game teaser and dashboard entry" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Terms and privacy text

**Files:**
- Modify: `web/src/legal/docs.ts` (en / ro / it terms: new section `daily` after `use`; privacy `data` section: one more list item; `UPDATED`)
- Test: `web/src/legal/docs.test.ts` already enforces same section ids and paragraph counts in every language.

- [ ] **Step 1: Write the sections** (same section id and paragraph count in all three languages):

EN terms section:

```ts
      {
        id: 'daily',
        h: 'FC Solver Daily',
        p: [
          'FC Solver Daily is a free guessing game at /daily. Players come from FC Solver\'s own database, built from the EA FC data the FC Solver extension sees while people use it; it can be incomplete or out of date (a very recent transfer can show the old club for a while).',
          'Signed in, consecutive daily wins earn invite points: +1 at 7 wins in a row, +1 at 14, +2 at 30, then again every 30 wins. Practice games and games played while signed out earn nothing. Points are the same as invite points: they have no cash value, cannot be transferred, are granted at our discretion and can be withdrawn on abuse or cheating (for example automated guessing or several accounts).',
        ],
      },
```

RO:

```ts
      {
        id: 'daily',
        h: 'FC Solver Daily',
        p: [
          'FC Solver Daily este un joc gratuit de ghicit, la /daily. Jucătorii vin din baza de date proprie FC Solver, construită din datele EA FC pe care le vede extensia FC Solver când este folosită; poate fi incompletă sau neactualizată (un transfer foarte recent poate arăta o vreme clubul vechi).',
          'Autentificat, victoriile zilnice la rând aduc puncte de invitație: +1 la 7 victorii la rând, +1 la 14, +2 la 30, apoi din nou la fiecare 30 de victorii. Jocurile de antrenament și cele jucate neautentificat nu aduc nimic. Punctele sunt aceleași ca punctele de invitație: nu au valoare în bani, nu se pot transfera, sunt acordate la discreția noastră și pot fi retrase în caz de abuz sau trișare (de exemplu ghicit automatizat sau mai multe conturi).',
        ],
      },
```

IT:

```ts
      {
        id: 'daily',
        h: 'FC Solver Daily',
        p: [
          'FC Solver Daily è un gioco gratuito di indovinelli su /daily. I giocatori vengono dal database di FC Solver, costruito con i dati EA FC che vede l\'estensione FC Solver mentre viene usata; può essere incompleto o non aggiornato (un trasferimento molto recente può mostrare per un po\' il vecchio club).',
          'Con l\'accesso, le vittorie giornaliere di fila danno punti invito: +1 a 7 vittorie di fila, +1 a 14, +2 a 30, poi di nuovo ogni 30 vittorie. Le partite di allenamento e quelle giocate senza accesso non danno nulla. I punti sono gli stessi punti invito: non hanno valore in denaro, non sono trasferibili, sono concessi a nostra discrezione e possono essere ritirati in caso di abuso o imbrogli (per esempio tentativi automatizzati o più account).',
        ],
      },
```

Privacy `data` section, one more list item in each language:
- EN: `'- FC Solver Daily, when you play signed in: the day, your guesses and whether you won, to keep your stats and streak. Signed out, the game keeps its state only in your browser.'`
- RO: `'- FC Solver Daily, când joci autentificat: ziua, încercările tale și dacă ai câștigat, pentru statistici și serie. Neautentificat, jocul își păstrează starea doar în browserul tău.'`
- IT: `'- FC Solver Daily, quando giochi con l\'accesso: il giorno, i tuoi tentativi e se hai vinto, per statistiche e serie. Senza accesso, il gioco conserva lo stato solo nel tuo browser.'`

Set `UPDATED` to the commit date (`2026-10-08` if done today).

- [ ] **Step 2: Verify**

Run: `node --import tsx --test web/src/legal/docs.test.ts && npm run typecheck`
Expected: PASS. Open `/terms` and `/privacy` in each language and read the new text once.

- [ ] **Step 3: Commit**

```bash
git pull --rebase && git add web/src/legal/docs.ts
git commit -m "docs(legal): daily game terms and privacy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Final verification and whole-branch review

**Files:**
- Modify: `CLAUDE.md` (Layout: `server/daily/` and `web/src/daily/` one-liners, `npm run daily:import` in Commands), any fixes found.

- [ ] **Step 1: CLAUDE.md** — add to Layout: "`daily/` FC Solver Daily game (`players.ts` players table merge from cache writes, `pool.ts`, `compare.ts` tiles, `streak.ts` points 7/14/30, `tokens.ts` signed / encrypted game tokens, `service.ts`, `routes.ts`)" under `server/`, and "`daily/` public `/daily` game (lazy chunk)" under `web/src/`; add `npm run daily:import  # fill the Daily players table from data/accounts + pool sizes` to Commands.

- [ ] **Step 2: Full checks with real output**

```bash
npm test
npm run typecheck
npm run i18n:check
npm run build
npm run daily:import
```

Expected: every test passes (paste the summary line), no type errors, i18n check clean, build lists the `Daily` chunk, the import prints the pool table. Paste the real output in the report.

- [ ] **Step 3: Browser pass** (claude-in-chrome): `/daily`, `/daily/practice`, the landing teaser and header link, the dashboard sidebar entry, at 1280px and 390px, signed out and signed in, with reduced motion; the network check that no response before the end contains the answer's id or name and no portrait of the answer is requested before the end. Watch the server log for `[csp]` and `[daily]` warnings.

- [ ] **Step 4: Whole-branch review** with superpowers:requesting-code-review over `git diff dev...HEAD`, focused on the Review Focus list, the points transaction, and the answer-leak rule. Fix confirmed findings (one commit per fix).

- [ ] **Step 5: Commit**

```bash
git pull --rebase && git add CLAUDE.md
git commit -m "docs(daily): layout and commands" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

Then superpowers:finishing-a-development-branch. Do not push or deploy without asking.
