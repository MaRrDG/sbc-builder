# FUT Gallery Planner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For every FUT Gallery set, show the best lineup the user can field from every item that ever passed through their club, its score and grade (D–S), filterable and sortable, Premium only.

**Architecture:** A per-persona ledger (`data/accounts/<id>/gallery.json`) records every player item the server writes to the club / storage / unassigned cache, through one hook in `server/store.ts`, and keeps items after they leave. Pure modules score a set (`score.ts`) and pick a lineup (`optimize.ts`, greedy + tier-push + swap hill-climb) against a static set catalogue (`server/gallery/sets.json`, transcribed from fut.gg). `GET /api/gallery` serves the result; the web app adds `/dashboard/gallery` (list) and `/dashboard/gallery/:setId` (set).

**Tech Stack:** Node 24 + TypeScript via `tsx`, Fastify 5, `node:test`; React 19 + Vite 8, plain CSS with OKLCH tokens, Phosphor icons, `t()` i18n (en / ro / it).

**Spec:** `docs/superpowers/specs/2026-10-01-fut-gallery-design.md`

## Global Constraints

- Read-only toward EA: no new EA calls, no job recipe, no action button. The ledger fills only from cache writes that already happen.
- Premium only: `GET /api/gallery` answers 403 with `code: 'premiumOnly'` for free users; the UI shows the locked note instead of data.
- Item score = EA's `gradingScore` as sent. Never recompute it from rating.
- Loan items (`!!item.loansInfo`) never enter the ledger.
- First Owner = `(item.owners ?? 1) <= 1` the first time the item is seen (same rule as `toPlayer` in `server/squad.ts:63`); it never flips afterwards.
- Every tag bonus = `Math.floor(sum(matched item scores) * pct / 100)`, per tag.
- All UI strings through `t()`; keys added to `web/src/locales/en.ts`, `ro.ts`, `it.ts`; `npm run i18n:check` passes. Romanian plurals `_one`/`_few`/`_other`, Italian `_one`/`_other`.
- UI: `--go` only for met grades / primary action; grade always shown as a letter (never color only); "in club" vs "owned before" shown with icon + text; controls 8px radius, containers 14px; works at 390px; respects `prefers-reduced-motion`.
- New endpoint → `docs/api.md`. Never commit or print anything from `data/`.
- Work happens in the worktree `.claude/worktrees/gallery` on branch `feat/gallery` (from `dev`). Commits: `type(scope): subject`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. **Set eligibility wider than `teamid`.** fut.gg's Arsenal set ("20 Arsenal Mens or Womens players") counts only 13 items for Same Club, so some eligible items carry another `teamid` (Icons / Heroes / special cards whose real club is Arsenal). A filter on `teamid` alone will under-fill club sets. Task 4 records the observed rule; Task 1's `matchesFilter` supports `clubs` OR `assetIds` (explicit extra players), pinned by a test.
2. **Same player in several versions.** Multiples! counts the same `assetId` (Arsenal example: 6,875 + 4,100 → +10% = 1,097). Two versions must both be allowed in one lineup and both count. Test in Task 1.
3. **A set with fewer eligible items than slots.** Must return the partial lineup with `grade: null` and `missing > 0`, not throw and not be hidden. Tests in Task 1 (score) and Task 2 (optimize).
4. **Concurrent cache writes.** Club page merges, storage and unassigned writes can land at once; the ledger must not lose entries (read-modify-write race). Per-persona queue + test in Task 3.
5. **Empty ledger / brand new account.** No cache yet → `/api/gallery` returns every set with `filled: 0`, no crash. Test in Task 5.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/gallery/types.ts` | Shared types: `Grade`, `GallerySet`, `SetFilter`, `GalleryItem`, `ScoredSet`, `TagResult` |
| `server/gallery/tags.ts` | The 21 tags as data + match rules; `rarityKinds(names)` |
| `server/gallery/score.ts` | `matchesFilter`, `scoreSet`, `gradeFor`, `nextGrade` (pure) |
| `server/gallery/optimize.ts` | `bestLineup` (pure) |
| `server/gallery/ledger.ts` | `mergeLedger`, `collectItems` (pure) + `recordItems`, `readLedger`, `installLedger` (I/O) |
| `server/gallery/sets.json` | Static set catalogue |
| `server/gallery/catalogue.ts` | Loads and validates `sets.json` |
| `server/gallery/compute.ts` | `galleryFor(acc, meta)`: ledger + catalogue → API response, cached per ledger version |
| `scripts/gallery-catalogue.ts` | One-off: raw fut.gg dump + `data/static.json` names → `server/gallery/sets.json` |
| `server/store.ts` | + `onCacheWrite` listener hook |
| `server/ea.ts` | + `gender?: number` on `ClubItem` |
| `server/index.ts` | `installLedger()` at start; `GET /api/gallery` |
| `web/src/route.ts` | `gallery` view, `/dashboard/gallery[/:setId]` |
| `web/src/api.ts` | `GalleryResponse` types + `api.gallery()` |
| `web/src/components/gallery/GalleryList.tsx` | List with filters / sort |
| `web/src/components/gallery/GallerySet.tsx` | One set: lineup, tags, thresholds |
| `web/src/components/gallery/gallery.ts` | Pure list filter / sort helpers (tested) |
| `web/src/App.tsx` | Sidebar item, view switch, data load |
| `web/src/styles.css` | Gallery styles |
| `web/src/locales/{en,ro,it}.ts` | `gallery.*` keys |
| `docs/api.md`, `docs/architecture.md` | Endpoint + ledger docs |

---

### Task 1: Types, tags and set scoring

**Files:**
- Create: `server/gallery/types.ts`, `server/gallery/tags.ts`, `server/gallery/score.ts`
- Modify: `server/ea.ts:14-39` (add `gender?: number;` to `ClubItem`)
- Test: `server/gallery/score.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Grade = 'D' | 'C' | 'B' | 'A' | 'S'`, `GRADES: Grade[]` (ascending)
  - `interface SetFilter { clubs?: number[]; leagues?: number[]; nations?: number[]; rarities?: number[]; kinds?: RarityKind[]; gender?: number; assetIds?: number[]; minRating?: number }`
  - `interface GallerySet { id: string; name: string; category: 'league' | 'club' | 'nation' | 'rarity' | 'campaign'; size: number; filter: SetFilter; grades: Record<Grade, number>; rewards?: Partial<Record<Grade, string>> }`
  - `type RarityKind = 'icon' | 'hero' | 'totw' | 'holo'`
  - `interface GalleryItem { id: number; assetId: number; rating: number; rareflag: number; kind: RarityKind | null; score: number; nation: number; league: number; club: number; gender: number; position: string; weakFoot: number; skillMoves: number; firstOwner: boolean }` (`skillMoves` is EA's raw 0-based value: 4 = 5★)
  - `interface TagResult { id: TagId; count: number; pct: number; bonus: number }`
  - `interface ScoredSet { base: number; tags: TagResult[]; bonus: number; total: number; grade: Grade | null; filled: number; missing: number }`
  - `tags.ts`: `type TagId`, `TAGS: Tag[]`, `rarityKinds(names: Record<string, string>): Record<number, RarityKind>`
  - `score.ts`: `matchesFilter(f: SetFilter, i: GalleryItem): boolean`, `scoreSet(set: GallerySet, items: GalleryItem[]): ScoredSet`, `gradeFor(set: GallerySet, total: number): Grade | null`, `nextGrade(set: GallerySet, total: number): { grade: Grade; need: number } | null`

- [ ] **Step 1: Write the failing tests**

`server/gallery/score.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesFilter, scoreSet, gradeFor, nextGrade } from './score.js';
import { rarityKinds } from './tags.js';
import type { GalleryItem, GallerySet } from './types.js';

let nextId = 1;
const item = (p: Partial<GalleryItem> = {}): GalleryItem => ({
  id: nextId++, assetId: nextId * 100, rating: 84, rareflag: 1, kind: null, score: 830,
  nation: nextId, league: 13, club: nextId, gender: 0, position: 'CB', weakFoot: 3, skillMoves: 2, firstOwner: false, ...p,
});
const set = (p: Partial<GallerySet> = {}): GallerySet => ({
  id: 't', name: 'T', category: 'club', size: 5, filter: {},
  grades: { D: 10, C: 1000, B: 5000, A: 10000, S: 20000 }, ...p,
});
const tag = (r: ReturnType<typeof scoreSet>, id: string) => r.tags.find((t) => t.id === id);

test('base is the sum of item scores; grade from thresholds', () => {
  const r = scoreSet(set(), [1000, 1000, 1000, 1000, 1000].map((score) => item({ score, rating: 70 })));
  assert.equal(r.base, 5000);
  assert.equal(r.filled, 5);
  assert.equal(r.missing, 0);
  assert.equal(gradeFor(set(), 4999), 'C');
  assert.equal(gradeFor(set(), 5000), 'B');
  assert.equal(gradeFor(set(), 9), null);
  assert.deepEqual(nextGrade(set(), 5000), { grade: 'A', need: 5000 });
  assert.equal(nextGrade(set(), 20000), null);
});

test('incomplete set has no grade', () => {
  const r = scoreSet(set(), [item(), item()]);
  assert.equal(r.grade, null);
  assert.equal(r.missing, 3);
  assert.ok(r.total > 0);
});

test('Silver tier: 5 silver items +15%, floored', () => {
  const items = [101, 101, 101, 101, 101].map((score) => item({ score, rating: 70 }));
  const r = scoreSet(set(), items);
  assert.deepEqual(tag(r, 'silver'), { id: 'silver', count: 5, pct: 15, bonus: 75 }); // floor(505 * .15) = 75
});

test('below the first tier a tag pays nothing and is not listed', () => {
  const r = scoreSet(set(), [70, 70, 70, 70, 90].map((rating) => item({ rating, score: 100 })));
  assert.equal(tag(r, 'silver'), undefined); // 4 silver < 5
});

test('Same League pays on the largest group only', () => {
  const items = [...Array(5)].map(() => item({ league: 13, score: 1000 })).concat([item({ league: 53, score: 9999 })]);
  const r = scoreSet(set({ size: 6 }), items);
  assert.deepEqual(tag(r, 'sameLeague'), { id: 'sameLeague', count: 5, pct: 1, bonus: 50 });
});

test('Different Nation counts distinct nations, best item per nation', () => {
  const items = [1, 2, 3, 4, 5].map((nation) => item({ nation, score: 1000 })).concat([item({ nation: 1, score: 50 })]);
  const r = scoreSet(set({ size: 6 }), items);
  assert.deepEqual(tag(r, 'differentNation'), { id: 'differentNation', count: 5, pct: 1, bonus: 50 });
});

test('Multiples counts two versions of the same player (Arsenal: 6875 + 4100 → 1097)', () => {
  const r = scoreSet(set({ size: 2 }), [item({ assetId: 7, score: 6875 }), item({ assetId: 7, score: 4100 })]);
  assert.deepEqual(tag(r, 'multiples'), { id: 'multiples', count: 2, pct: 10, bonus: 1097 });
});

test('Golden 20 items +4% matches fut.gg Arsenal (base 92,790 → 3,711)', () => {
  const scores = [11000, 8300, 8300, 8300, 8300, 6875, 6875, 5500, 5500, 4100, 4100, 4100, 4100, 2100, 2100, 830, 830, 830, 410, 340];
  const r = scoreSet(set({ size: 20 }), scores.map((score) => item({ score, rating: 84 })));
  assert.equal(r.base, 92790);
  assert.equal(tag(r, 'golden')?.bonus, 3711);
});

test('First Owner 5 items +150%', () => {
  const r = scoreSet(set(), [...Array(5)].map(() => item({ firstOwner: true, score: 100 })));
  assert.deepEqual(tag(r, 'firstOwner'), { id: 'firstOwner', count: 5, pct: 150, bonus: 750 });
});

test('Iconic 2 items +10%, kind from rarity names', () => {
  const kinds = rarityKinds({ '3': 'Team of the Week', '12': 'Base Icon', '72': 'Base Hero', '1': 'Rare', '200': 'Holographic' });
  assert.deepEqual(kinds, { 3: 'totw', 12: 'icon', 72: 'hero', 200: 'holo' });
  const r = scoreSet(set({ size: 2 }), [item({ kind: 'icon', score: 1000 }), item({ kind: 'icon', score: 1000 })]);
  assert.deepEqual(tag(r, 'iconic'), { id: 'iconic', count: 2, pct: 10, bonus: 200 });
});

test('position, weak foot and skill tags', () => {
  const gk = [...Array(3)].map(() => item({ position: 'GK', score: 100 }));
  assert.equal(tag(scoreSet(set({ size: 3 }), gk), 'handsOnly')?.pct, 3);
  const wf = [...Array(3)].map(() => item({ weakFoot: 5, score: 100 }));
  assert.equal(tag(scoreSet(set({ size: 3 }), wf), 'ambidextrous')?.pct, 3);
  const sm = [...Array(3)].map(() => item({ skillMoves: 4, score: 100 })); // EA 0-based: 4 = 5★
  assert.equal(tag(scoreSet(set({ size: 3 }), sm), 'skilled')?.pct, 3);
  const mid = [...Array(5)].map(() => item({ position: 'CAM', score: 100 }));
  assert.equal(tag(scoreSet(set(), mid), 'midfieldControl')?.pct, 3);
});

test('matchesFilter: OR inside a key, AND between keys, assetIds widen clubs', () => {
  const a = item({ club: 1, league: 13 });
  assert.equal(matchesFilter({ clubs: [1, 2] }, a), true);
  assert.equal(matchesFilter({ clubs: [2] }, a), false);
  assert.equal(matchesFilter({ clubs: [1], leagues: [53] }, a), false);
  assert.equal(matchesFilter({ clubs: [2], assetIds: [a.assetId] }, a), true);
  assert.equal(matchesFilter({ kinds: ['icon'] }, item({ kind: 'icon' })), true);
  assert.equal(matchesFilter({ minRating: 85 }, a), false);
  assert.equal(matchesFilter({}, a), true);
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --import tsx --test server/gallery/score.test.ts`
Expected: FAIL, `Cannot find module './score.js'`.

- [ ] **Step 3: Implement**

`server/gallery/types.ts`:

```ts
// FUT Gallery shapes shared by the catalogue, scoring, optimizer and API.
export type Grade = 'D' | 'C' | 'B' | 'A' | 'S';
export const GRADES: Grade[] = ['D', 'C', 'B', 'A', 'S'];

export type RarityKind = 'icon' | 'hero' | 'totw' | 'holo';

/** AND between keys, OR inside one. `assetIds` adds players a club filter would miss (Icons / Heroes of that club). */
export interface SetFilter {
  clubs?: number[];
  leagues?: number[];
  nations?: number[];
  rarities?: number[];
  kinds?: RarityKind[];
  gender?: number;
  assetIds?: number[];
  minRating?: number;
}

export interface GallerySet {
  id: string;
  name: string;
  category: 'league' | 'club' | 'nation' | 'rarity' | 'campaign';
  size: number;
  filter: SetFilter;
  grades: Record<Grade, number>;
  rewards?: Partial<Record<Grade, string>>;
}

/** One ledger item, flattened for scoring. `skillMoves` is EA's 0-based value (4 = 5 stars). */
export interface GalleryItem {
  id: number;
  assetId: number;
  rating: number;
  rareflag: number;
  kind: RarityKind | null;
  score: number;
  nation: number;
  league: number;
  club: number;
  gender: number;
  position: string;
  weakFoot: number;
  skillMoves: number;
  firstOwner: boolean;
}

export interface TagResult {
  id: string;
  count: number;
  pct: number;
  bonus: number;
}

export interface ScoredSet {
  base: number;
  tags: TagResult[];
  bonus: number;
  total: number;
  grade: Grade | null;
  filled: number;
  missing: number;
}
```

`server/gallery/tags.ts`:

```ts
// The 21 Gallery bonus tags (fut.gg, 27 Sept 2026). Each pays its tier percent on the items it matches.
import type { GalleryItem, RarityKind } from './types.js';

type Tier = [min: number, pct: number];
type Rule =
  | { kind: 'filter'; test: (i: GalleryItem) => boolean } // every item that passes
  | { kind: 'same'; key: (i: GalleryItem) => number | string } // the largest group sharing a value
  | { kind: 'different'; key: (i: GalleryItem) => number | string }; // best item per distinct value

export interface Tag {
  id: string;
  rule: Rule;
  tiers: Tier[]; // ascending by min
}

const STD: Tier[] = [[5, 1], [10, 2], [20, 4]];
const POS: Tier[] = [[5, 3], [10, 6], [15, 10]];
const DEF = new Set(['CB', 'LB', 'RB']);
const MID = new Set(['CDM', 'CM', 'CAM', 'LM', 'RM']);
const ATT = new Set(['ST', 'RW', 'LW']);

export const TAGS: Tag[] = [
  { id: 'sameNation', rule: { kind: 'same', key: (i) => i.nation }, tiers: STD },
  { id: 'differentNation', rule: { kind: 'different', key: (i) => i.nation }, tiers: STD },
  { id: 'sameClub', rule: { kind: 'same', key: (i) => i.club }, tiers: STD },
  { id: 'differentClub', rule: { kind: 'different', key: (i) => i.club }, tiers: STD },
  { id: 'sameLeague', rule: { kind: 'same', key: (i) => i.league }, tiers: [[5, 1], [10, 2], [20, 8]] },
  { id: 'differentLeague', rule: { kind: 'different', key: (i) => i.league }, tiers: STD },
  { id: 'bronze', rule: { kind: 'filter', test: (i) => i.rating < 65 }, tiers: [[5, 20], [10, 40], [20, 80]] },
  { id: 'silver', rule: { kind: 'filter', test: (i) => i.rating >= 65 && i.rating < 75 }, tiers: [[5, 15], [10, 30], [20, 60]] },
  { id: 'golden', rule: { kind: 'filter', test: (i) => i.rating >= 75 }, tiers: STD },
  { id: 'holographic', rule: { kind: 'filter', test: (i) => i.kind === 'holo' }, tiers: [[2, 8], [4, 12], [6, 20]] },
  { id: 'iconic', rule: { kind: 'filter', test: (i) => i.kind === 'icon' }, tiers: [[2, 10], [4, 15], [6, 25]] },
  { id: 'heroic', rule: { kind: 'filter', test: (i) => i.kind === 'hero' }, tiers: [[2, 8], [4, 12], [6, 20]] },
  { id: 'totw', rule: { kind: 'filter', test: (i) => i.kind === 'totw' }, tiers: [[3, 4], [6, 8], [10, 15]] },
  { id: 'firstOwner', rule: { kind: 'filter', test: (i) => i.firstOwner }, tiers: [[5, 150], [10, 300], [20, 500]] },
  { id: 'handsOnly', rule: { kind: 'filter', test: (i) => i.position === 'GK' }, tiers: [[3, 3], [6, 6], [10, 15]] },
  { id: 'multiples', rule: { kind: 'same', key: (i) => i.assetId }, tiers: [[2, 10], [3, 15], [4, 20]] },
  { id: 'ambidextrous', rule: { kind: 'filter', test: (i) => i.weakFoot === 5 }, tiers: [[3, 3], [5, 6], [10, 12]] },
  { id: 'skilled', rule: { kind: 'filter', test: (i) => i.skillMoves === 4 }, tiers: [[3, 3], [5, 6], [10, 12]] },
  { id: 'defensiveWall', rule: { kind: 'filter', test: (i) => DEF.has(i.position) }, tiers: POS },
  { id: 'midfieldControl', rule: { kind: 'filter', test: (i) => MID.has(i.position) }, tiers: POS },
  { id: 'allOutAttack', rule: { kind: 'filter', test: (i) => ATT.has(i.position) }, tiers: POS },
];

/** The items a tag counts. */
export function tagMatches(tag: Tag, items: GalleryItem[]): GalleryItem[] {
  const r = tag.rule;
  if (r.kind === 'filter') return items.filter(r.test);
  const groups = new Map<number | string, GalleryItem[]>();
  for (const i of items) groups.set(r.key(i), [...(groups.get(r.key(i)) ?? []), i]);
  if (r.kind === 'different') return [...groups.values()].map((g) => g.reduce((a, b) => (b.score > a.score ? b : a)));
  let best: GalleryItem[] = [];
  for (const g of groups.values()) {
    const sum = (xs: GalleryItem[]) => xs.reduce((s, i) => s + i.score, 0);
    if (g.length > best.length || (g.length === best.length && sum(g) > sum(best))) best = g;
  }
  return best;
}

/** The tier percent for `count` matched items, 0 under the first tier. */
export function tierPct(tag: Tag, count: number): number {
  let pct = 0;
  for (const [min, p] of tag.tiers) if (count >= min) pct = p;
  return pct;
}

/** rareflag → kind, from EA's rarity names (meta.names.rarity). */
export function rarityKinds(names: Record<string, string>): Record<number, RarityKind> {
  const out: Record<number, RarityKind> = {};
  for (const [id, name] of Object.entries(names)) {
    const kind: RarityKind | null = /holo/i.test(name) ? 'holo'
      : /\bicon\b/i.test(name) ? 'icon'
      : /\bhero\b/i.test(name) ? 'hero'
      : /team of the week/i.test(name) ? 'totw'
      : null;
    if (kind) out[Number(id)] = kind;
  }
  return out;
}
```

`server/gallery/score.ts`:

```ts
// The one place a Gallery set's score and grade are computed. Pure.
import { TAGS, tagMatches, tierPct } from './tags.js';
import { GRADES, type GalleryItem, type GallerySet, type Grade, type ScoredSet, type SetFilter, type TagResult } from './types.js';

const any = <T>(list: T[] | undefined, v: T) => !list || list.includes(v);

export function matchesFilter(f: SetFilter, i: GalleryItem): boolean {
  if (f.minRating !== undefined && i.rating < f.minRating) return false;
  if (f.gender !== undefined && i.gender !== f.gender) return false;
  const club = !f.clubs || f.clubs.includes(i.club) || !!f.assetIds?.includes(i.assetId);
  return (
    club &&
    any(f.leagues, i.league) &&
    any(f.nations, i.nation) &&
    any(f.rarities, i.rareflag) &&
    (!f.kinds || (i.kind !== null && f.kinds.includes(i.kind)))
  );
}

export function gradeFor(set: GallerySet, total: number): Grade | null {
  let g: Grade | null = null;
  for (const grade of GRADES) if (total >= set.grades[grade]) g = grade;
  return g;
}

export function nextGrade(set: GallerySet, total: number): { grade: Grade; need: number } | null {
  const grade = GRADES.find((g) => total < set.grades[g]);
  return grade ? { grade, need: set.grades[grade] - total } : null;
}

export function scoreSet(set: GallerySet, items: GalleryItem[]): ScoredSet {
  const base = items.reduce((s, i) => s + i.score, 0);
  const tags: TagResult[] = [];
  for (const tag of TAGS) {
    const matched = tagMatches(tag, items);
    const pct = tierPct(tag, matched.length);
    if (!pct) continue;
    const sum = matched.reduce((s, i) => s + i.score, 0);
    tags.push({ id: tag.id, count: matched.length, pct, bonus: Math.floor((sum * pct) / 100) });
  }
  const bonus = tags.reduce((s, t) => s + t.bonus, 0);
  const total = base + bonus;
  const filled = items.length;
  const missing = Math.max(0, set.size - filled);
  return { base, tags, bonus, total, grade: missing ? null : gradeFor(set, total), filled, missing };
}
```

Add `gender?: number;` after `gradingScore` in `ClubItem` (`server/ea.ts`), comment `// 0 men, 1 women`.

- [ ] **Step 4: Run tests**

Run: `node --import tsx --test server/gallery/score.test.ts`
Expected: all PASS. If `nextGrade(set(), 5000)` fails, check `GRADES.find` uses ascending order.

- [ ] **Step 5: Typecheck and commit**

Run: `npm run typecheck` → no errors.

```bash
git add server/gallery server/ea.ts
git commit -m "feat(gallery): set scoring and bonus tags"
```

---

### Task 2: Lineup optimizer

**Files:**
- Create: `server/gallery/optimize.ts`
- Test: `server/gallery/optimize.test.ts`

**Interfaces:**
- Consumes: `matchesFilter`, `scoreSet` (Task 1), `TAGS`, `tagMatches`, `tierPct` (Task 1), `GallerySet`, `GalleryItem`.
- Produces: `bestLineup(set: GallerySet, pool: GalleryItem[]): GalleryItem[]` (at most `set.size` items, all matching the filter; fewer when the pool is short).

- [ ] **Step 1: Write the failing tests**

`server/gallery/optimize.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestLineup } from './optimize.js';
import { scoreSet } from './score.js';
import type { GalleryItem, GallerySet } from './types.js';

let n = 1;
const item = (p: Partial<GalleryItem> = {}): GalleryItem => ({
  id: n++, assetId: n * 100, rating: 84, rareflag: 1, kind: null, score: 830,
  nation: n, league: n, club: n, gender: 0, position: 'CB', weakFoot: 3, skillMoves: 2, firstOwner: false, ...p,
});
const set = (p: Partial<GallerySet> = {}): GallerySet => ({
  id: 't', name: 'T', category: 'club', size: 5, filter: {},
  grades: { D: 10, C: 1000, B: 5000, A: 10000, S: 20000 }, ...p,
});
const total = (s: GallerySet, xs: GalleryItem[]) => scoreSet(s, xs).total;
const greedy = (s: GallerySet, pool: GalleryItem[]) => [...pool].sort((a, b) => b.score - a.score).slice(0, s.size);

test('takes the top items when no tag changes anything', () => {
  const pool = [500, 400, 300, 200, 100, 50].map((score) => item({ score, rating: 70, position: 'GK' }));
  const s = set();
  assert.deepEqual(bestLineup(s, pool).map((i) => i.score).sort((a, b) => b - a), [500, 400, 300, 200, 100]);
});

test('only items matching the filter', () => {
  const pool = [item({ club: 1, score: 10 }), item({ club: 2, score: 9999 })];
  assert.deepEqual(bestLineup(set({ filter: { clubs: [1] } }), pool).map((i) => i.club), [1]);
});

test('short pool returns what there is', () => {
  const pool = [item(), item()];
  assert.equal(bestLineup(set(), pool).length, 2);
});

test('reaches the 5th First Owner when +150% beats a higher card', () => {
  // greedy picks the 1000 non-first-owner card; 5 first owners of 300 pay 1500 + 2250 bonus
  const fo = [...Array(5)].map(() => item({ score: 300, firstOwner: true }));
  const pool = [item({ score: 1000 }), ...fo];
  const s = set();
  const pick = bestLineup(s, pool);
  assert.equal(pick.filter((i) => i.firstOwner).length, 5);
  assert.ok(total(s, pick) > total(s, greedy(s, pool)));
});

test('reaches the 2nd Icon when +10% on both beats the swap cost', () => {
  const pool = [item({ score: 5000, kind: 'icon' }), item({ score: 2000 }), item({ score: 1990, kind: 'icon' })];
  const s = set({ size: 2 });
  const pick = bestLineup(s, pool);
  assert.equal(pick.filter((i) => i.kind === 'icon').length, 2); // 6990 + 699 > 7000
});

test('never worse than greedy', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const pool = [...Array(25)].map((_, k) => item({
      score: ((seed * 7919 + k * 104729) % 9000) + 20,
      rating: 60 + ((seed + k) % 35),
      league: (seed + k) % 3,
      nation: (seed * k) % 5,
      firstOwner: (seed + k) % 4 === 0,
      position: ['GK', 'CB', 'CM', 'ST'][k % 4],
    }));
    const s = set({ size: 11 });
    assert.ok(total(s, bestLineup(s, pool)) >= total(s, greedy(s, pool)), `seed ${seed}`);
  }
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test server/gallery/optimize.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`server/gallery/optimize.ts`:

```ts
// Best Gallery lineup from the ledger: greedy by score, then push tag tiers, then single swaps
// while the exact total (scoreSet) rises. Pure.
import { matchesFilter, scoreSet } from './score.js';
import { TAGS, tagMatches } from './tags.js';
import type { GalleryItem, GallerySet } from './types.js';

const MAX_ROUNDS = 40;

export function bestLineup(set: GallerySet, pool: GalleryItem[]): GalleryItem[] {
  const eligible = pool.filter((i) => matchesFilter(set.filter, i)).sort((a, b) => b.score - a.score);
  if (eligible.length <= set.size) return eligible;
  let cur = eligible.slice(0, set.size);
  let best = scoreSet(set, cur).total;
  const tryLineup = (next: GalleryItem[]) => {
    const t = scoreSet(set, next).total;
    if (t > best) {
      cur = next;
      best = t;
      return true;
    }
    return false;
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let improved = false;
    // 1. tier push: for each tag, bring in enough matching items to reach each higher tier
    for (const tag of TAGS) {
      const inLineup = new Set(tagMatches(tag, cur).map((i) => i.id));
      const outside = tagMatches(tag, eligible).filter((i) => !cur.some((c) => c.id === i.id));
      for (const [min] of tag.tiers) {
        const need = min - inLineup.size;
        if (need <= 0 || need > outside.length) continue;
        const drop = cur.filter((i) => !inLineup.has(i.id)).sort((a, b) => a.score - b.score).slice(0, need);
        if (drop.length < need) continue;
        const dropIds = new Set(drop.map((i) => i.id));
        if (tryLineup([...cur.filter((i) => !dropIds.has(i.id)), ...outside.slice(0, need)])) {
          improved = true;
          break;
        }
      }
    }
    // 2. single swaps: first one that raises the total
    const ids = new Set(cur.map((i) => i.id));
    swap: for (let k = 0; k < cur.length; k++) {
      for (const inn of eligible) {
        if (ids.has(inn.id)) continue;
        const next = cur.slice();
        next[k] = inn;
        if (tryLineup(next)) {
          improved = true;
          break swap;
        }
      }
    }
    if (!improved) break;
  }
  return cur;
}
```

- [ ] **Step 4: Run tests**

Run: `node --import tsx --test server/gallery/optimize.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add server/gallery/optimize.ts server/gallery/optimize.test.ts
git commit -m "feat(gallery): lineup optimizer"
```

---

### Task 3: Collected-items ledger

**Files:**
- Create: `server/gallery/ledger.ts`
- Modify: `server/store.ts:24-32` (listener hook), `server/index.ts` (call `installLedger()` once at startup, next to the other startup calls)
- Test: `server/gallery/ledger.test.ts`

**Interfaces:**
- Consumes: `ClubItem` (`server/ea.ts`), `readCache` / `writeCache` (`server/store.ts`), `RarityKind`, `GalleryItem` (Task 1).
- Produces:
  - `store.ts`: `onCacheWrite(fn: (key: string, data: unknown) => void): void`
  - `interface LedgerEntry { item: ClubItem; firstOwner: boolean; firstSeen: number }`
  - `type Ledger = Record<string, LedgerEntry>` (key = `String(item.id)`)
  - `mergeLedger(prev: Ledger, items: ClubItem[], now: number): { ledger: Ledger; changed: boolean }` (pure)
  - `collectItems(raw: unknown): ClubItem[]` (pure; finds player items anywhere in a raw EA response)
  - `toGalleryItem(e: LedgerEntry, kinds: Record<number, RarityKind>): GalleryItem` (pure)
  - `recordItems(personaId: number, items: ClubItem[]): Promise<void>` (serialized per persona)
  - `readLedger(personaId: number): Promise<{ ledger: Ledger; at: number }>` (backfills on first read)
  - `installLedger(): void`
  - `LEDGER_KEY(personaId)` = `accounts/<id>/gallery`

- [ ] **Step 1: Write the failing tests**

`server/gallery/ledger.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectItems, mergeLedger, toGalleryItem, type Ledger } from './ledger.js';
import type { ClubItem } from '../ea.js';

const ci = (p: Partial<ClubItem> = {}): ClubItem => ({
  id: 1, assetId: 10, resourceId: 10, rating: 84, rareflag: 1, preferredPosition: 'CM', possiblePositions: ['CM'],
  teamid: 1, leagueId: 13, nation: 14, untradeable: false, itemState: 'free', owners: 1, gradingScore: 830, ...p,
});

test('new items enter with firstOwner from owners', () => {
  const { ledger, changed } = mergeLedger({}, [ci({ id: 1, owners: 1 }), ci({ id: 2, owners: 3 })], 1000);
  assert.equal(changed, true);
  assert.equal(ledger['1'].firstOwner, true);
  assert.equal(ledger['2'].firstOwner, false);
  assert.equal(ledger['1'].firstSeen, 1000);
});

test('firstOwner never flips back; data refreshes; unchanged = no write', () => {
  const a = mergeLedger({}, [ci({ id: 1, owners: 1 })], 1000).ledger;
  const b = mergeLedger(a, [ci({ id: 1, owners: 2, rating: 85, gradingScore: 2100 })], 2000);
  assert.equal(b.ledger['1'].firstOwner, true);
  assert.equal(b.ledger['1'].item.gradingScore, 2100);
  assert.equal(b.ledger['1'].firstSeen, 1000);
  assert.equal(b.changed, true);
  assert.equal(mergeLedger(b.ledger, [ci({ id: 1, owners: 2, rating: 85, gradingScore: 2100 })], 3000).changed, false);
});

test('items not in the batch stay (sold items keep counting)', () => {
  const a = mergeLedger({}, [ci({ id: 1 }), ci({ id: 2 })], 1).ledger;
  const b = mergeLedger(a, [ci({ id: 1 })], 2).ledger;
  assert.deepEqual(Object.keys(b).sort(), ['1', '2']);
});

test('loans are skipped', () => {
  const { ledger } = mergeLedger({}, [ci({ id: 1, loansInfo: { loanType: 'x', loanValue: 5 } })], 1);
  assert.deepEqual(ledger, {} as Ledger);
});

test('collectItems finds player items anywhere in a raw response', () => {
  const raw = { squad: { players: [{ index: 0, itemData: ci({ id: 7 }) }, { index: 1, itemData: { id: 0 } }] }, x: [ci({ id: 8 })] };
  assert.deepEqual(collectItems(raw).map((i) => i.id).sort(), [7, 8]);
});

test('toGalleryItem maps fields', () => {
  const e = mergeLedger({}, [ci({ id: 1, rareflag: 12, weakfootabilitytypecode: 5, skillmoves: 4, gender: 1 })], 1).ledger['1'];
  const g = toGalleryItem(e, { 12: 'icon' });
  assert.deepEqual(
    [g.kind, g.score, g.club, g.league, g.nation, g.position, g.weakFoot, g.skillMoves, g.gender, g.firstOwner],
    ['icon', 830, 1, 13, 14, 'CM', 5, 4, 1, true],
  );
});
```

Add a concurrency test in the same file (Review Focus 4). It uses a temp data dir, so set it before importing the I/O part:

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// copy the `ci` helper and the node:test / assert imports from ledger.test.ts into this file
test('concurrent recordItems calls lose nothing', async () => {
  process.env.SBC_DATA_DIR = await mkdtemp(join(tmpdir(), 'ledger-'));
  const { recordItems, readLedgerRaw } = await import('./ledger.js');
  await Promise.all([...Array(20)].map((_, k) => recordItems(424242, [ci({ id: 100 + k })])));
  const led = await readLedgerRaw(424242);
  assert.equal(Object.keys(led).length, 20);
});
```

This needs `server/store.ts` to honor an override of the data dir. Change `export const DATA_DIR = join(ROOT, 'data');` to `export const DATA_DIR = process.env.SBC_DATA_DIR ?? join(ROOT, 'data');` (Step 3). Since `DATA_DIR` is read at import time, the env var must be set before `store.ts` is first imported in this test process: put this test in its own file `server/gallery/ledger-io.test.ts` with the env assignment at the very top, before any import of `./ledger.js` (use a dynamic `await import(...)` as shown).

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test server/gallery/ledger.test.ts server/gallery/ledger-io.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`server/store.ts`: replace `DATA_DIR` as above and add the hook:

```ts
type WriteListener = (key: string, data: unknown) => void;
const listeners: WriteListener[] = [];

/** Called after every cache write (the gallery ledger listens for club / storage / unassigned). */
export function onCacheWrite(fn: WriteListener) {
  listeners.push(fn);
}
```

and at the end of `writeCache`, before `return entry;`:

```ts
  for (const fn of listeners) fn(key, data);
```

`server/gallery/ledger.ts`:

```ts
// Every player item we have seen per persona, kept after it leaves the club: the FUT Gallery counts
// items that passed through the club, and EA does not expose that history to the web app.
// Fed from cache writes (club / storage / unassigned); never calls EA.
import type { ClubItem } from '../ea.js';
import { onCacheWrite, readCache, writeCache } from '../store.js';
import type { GalleryItem, RarityKind } from './types.js';

export interface LedgerEntry {
  item: ClubItem;
  firstOwner: boolean; // owners <= 1 when first seen; never flips back
  firstSeen: number;
}
export type Ledger = Record<string, LedgerEntry>;

export const LEDGER_KEY = (personaId: number) => `accounts/${personaId}/gallery`;
const WATCHED = /^accounts\/(\d+)\/(club|storage|unassigned)$/;

const isPlayerItem = (v: unknown): v is ClubItem => {
  const o = v as Partial<ClubItem> | null;
  return !!o && typeof o === 'object' && Number.isInteger(o.id) && (o.id ?? 0) > 0 &&
    Number.isInteger(o.assetId) && Number.isInteger(o.rating) && Number.isInteger(o.rareflag) && typeof o.preferredPosition === 'string';
};

/** Player items anywhere inside a raw EA response (SBC squads keep them under itemData). */
export function collectItems(raw: unknown): ClubItem[] {
  const out: ClubItem[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    if (isPlayerItem(v)) return void out.push(v);
    Object.values(v).forEach(walk);
  };
  walk(raw);
  return out;
}

const same = (a: ClubItem, b: ClubItem) =>
  a.rating === b.rating && a.rareflag === b.rareflag && (a.gradingScore ?? 0) === (b.gradingScore ?? 0) &&
  a.teamid === b.teamid && a.preferredPosition === b.preferredPosition;

export function mergeLedger(prev: Ledger, items: ClubItem[], now: number): { ledger: Ledger; changed: boolean } {
  const ledger = { ...prev };
  let changed = false;
  for (const item of items) {
    if (item.loansInfo) continue;
    const key = String(item.id);
    const old = ledger[key];
    if (old && same(old.item, item)) continue;
    ledger[key] = { item, firstOwner: old ? old.firstOwner : (item.owners ?? 1) <= 1, firstSeen: old?.firstSeen ?? now };
    changed = true;
  }
  return { ledger, changed };
}

export function toGalleryItem(e: LedgerEntry, kinds: Record<number, RarityKind>): GalleryItem {
  const i = e.item;
  return {
    id: i.id, assetId: i.assetId, rating: i.rating, rareflag: i.rareflag, kind: kinds[i.rareflag] ?? null,
    score: i.gradingScore ?? 0, nation: i.nation, league: i.leagueId, club: i.teamid, gender: i.gender ?? 0,
    position: i.preferredPosition, weakFoot: i.weakfootabilitytypecode ?? 0, skillMoves: i.skillmoves ?? 0,
    firstOwner: e.firstOwner,
  };
}

// one write at a time per persona, so concurrent cache writes never drop entries
const queues = new Map<number, Promise<unknown>>();
function serial<T>(personaId: number, fn: () => Promise<T>): Promise<T> {
  const run = (queues.get(personaId) ?? Promise.resolve()).then(fn, fn);
  queues.set(personaId, run.catch(() => {}));
  return run;
}

export async function readLedgerRaw(personaId: number): Promise<Ledger> {
  return (await readCache<Ledger>(LEDGER_KEY(personaId)))?.data ?? {};
}

export function recordItems(personaId: number, items: ClubItem[]): Promise<void> {
  return serial(personaId, async () => {
    const { ledger, changed } = mergeLedger(await readLedgerRaw(personaId), items, Date.now());
    if (changed) await writeCache(LEDGER_KEY(personaId), ledger);
  });
}

/** First read per persona backfills from what the cache already holds (club, storage, unassigned, SBC squads). */
export function readLedger(personaId: number): Promise<{ ledger: Ledger; at: number }> {
  return serial(personaId, async () => {
    let entry = await readCache<Ledger>(LEDGER_KEY(personaId));
    if (!entry) {
      const acc = (n: string) => `accounts/${personaId}/${n}`;
      const lists = await Promise.all(['club', 'storage', 'unassigned'].map(async (n) => (await readCache<ClubItem[]>(acc(n)))?.data ?? []));
      const squads = await readSquadCaches(personaId);
      const { ledger } = mergeLedger({}, [...lists.flat(), ...squads], Date.now());
      entry = await writeCache(LEDGER_KEY(personaId), ledger);
    }
    return { ledger: entry.data, at: entry.fetchedAt };
  });
}

async function readSquadCaches(personaId: number): Promise<ClubItem[]> {
  const { readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const { DATA_DIR } = await import('../store.js');
  const dir = join(DATA_DIR, 'accounts', String(personaId), 'challengeSquads');
  const files = await readdir(dir).catch(() => [] as string[]);
  const out: ClubItem[] = [];
  for (const f of files.filter((f) => f.endsWith('.json'))) {
    const c = await readCache<unknown>(`accounts/${personaId}/challengeSquads/${f.slice(0, -5)}`);
    out.push(...collectItems(c?.data));
  }
  return out;
}

export function installLedger() {
  onCacheWrite((key, data) => {
    const m = WATCHED.exec(key);
    if (!m || !Array.isArray(data)) return;
    recordItems(Number(m[1]), data as ClubItem[]).catch((err) => console.warn('[gallery] ledger write failed:', err));
  });
}
```

Move the three dynamic imports in `readSquadCaches` to static top-level imports (`readdir` from `node:fs/promises`, `join` from `node:path`, `DATA_DIR` from `../store.js`); they are written dynamically above only to keep the snippet self-contained.

`server/index.ts`: import `installLedger` from `./gallery/ledger.js` and call `installLedger();` once near the other startup code (before `app.listen`).

- [ ] **Step 4: Run tests**

Run: `node --import tsx --test server/gallery/ledger.test.ts server/gallery/ledger-io.test.ts && npm test`
Expected: all PASS (existing tests still green).

- [ ] **Step 5: Check against real data**

Run (prints counts only, never item data or keys):

```bash
node --import tsx -e "
import('./server/gallery/ledger.ts').then(async (m) => {
  const { readdir } = await import('node:fs/promises');
  for (const p of await readdir('data/accounts')) {
    const raw = await m.readLedgerRaw(Number(p));
    console.log(p.slice(0, 3) + '…', 'existing ledger entries:', Object.keys(raw).length);
  }
});"
```

Expected: runs without error (0 entries before the first `readLedger`). Do not call `readLedger` on the real `data/` here: it writes `gallery.json`, which is fine in dev but should happen through the API in Task 5.

- [ ] **Step 6: Commit**

```bash
git add server/gallery/ledger.ts server/gallery/ledger.test.ts server/gallery/ledger-io.test.ts server/store.ts server/index.ts
git commit -m "feat(gallery): collected-items ledger fed from cache writes"
```

---

### Task 4: Set catalogue

**Files:**
- Create: `scripts/gallery-catalogue.ts`, `server/gallery/sets.json`, `server/gallery/catalogue.ts`, `server/gallery/fut-gg-dump.json` (raw input, committed so the catalogue can be rebuilt)
- Test: `server/gallery/catalogue.test.ts`

**Interfaces:**
- Consumes: `GallerySet`, `GRADES` (Task 1); `data/static.json` names (via `server/meta.ts` names, or read the file directly in the script).
- Produces: `loadCatalogue(): GallerySet[]` (validated, cached in memory).

This task needs the browser (Claude in Chrome): fut.gg answers 403 to plain fetches.

- [ ] **Step 1: Dump fut.gg in the browser**

Open `https://www.fut.gg/fut-gallery/` in a new Chrome tab. Click "Show more sets" until all 127 sets show, or collect set URLs from the 7 category pages (`/fut-gallery/premier-league/`, `/fut-gallery/laliga/`, `/fut-gallery/rarities/`, …, links from the main page). Then run this in the page (same origin, so fetch works) to dump every set page:

```js
const urls = [...new Set([...document.querySelectorAll('a[href*="/fut-gallery/"]')].map((a) => a.href)
  .filter((h) => new URL(h).pathname.split('/').filter(Boolean).length === 3))];
const out = [];
for (const url of urls) {
  const html = await (await fetch(url)).text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const text = doc.querySelector('main')?.innerText ?? doc.body.textContent;
  out.push({
    url,
    name: doc.querySelector('h1')?.textContent?.replace(/ FUT Gallery Set$/, '').trim(),
    requires: (text.match(/Requires [^.|\n]+/) ?? [''])[0],
    grades: [...text.matchAll(/\b([DCBAS])\s+([\d,]+)\s+(.+?)(?=\s+[DCBAS]\s+[\d,]+\s|More in this category|$)/gs)]
      .map(([, g, score, reward]) => ({ g, score: Number(score.replace(/,/g, '')), reward: reward.trim() })),
  });
  await new Promise((r) => setTimeout(r, 400)); // be gentle with fut.gg
}
JSON.stringify(out);
```

`innerText` on a parsed document is empty; use `doc.body.textContent` and normalise whitespace if `main.innerText` is empty. Category pages also have set links; if the main page shows only 24, run the snippet once per category page and concatenate. Check that `out.length` is 127 and each entry has 5 grades; fix the regex on the live text if not (look at one set page's text first, as in the Arsenal example: "Grade requirements & rewards | Grade Score required Rewards | D 10 Arsenal Badge | C 110,000 Arsenal Kit | B 700,000 50 Gallery Tokens | …").

Save the JSON to `server/gallery/fut-gg-dump.json`.

- [ ] **Step 2: Record eligibility for club sets with mixed `teamid`**

On the Arsenal set page, open the cheapest lineup ("Open in builder") and note which cards are not plain Arsenal club cards (Icons / Heroes / other). Write down what makes them eligible (their real club = Arsenal). Decide and note in `scripts/gallery-catalogue.ts` header: club sets use `clubs: [men, women club ids]` plus `assetIds` for Icons / Heroes whose fut.gg page lists that club. If fut.gg's set page lists eligible special players, collect their asset ids from the card links (`/players/<assetId>-<slug>/`) into the dump as `extraAssetIds`.

- [ ] **Step 3: Write the catalogue script**

`scripts/gallery-catalogue.ts` reads `server/gallery/fut-gg-dump.json` and `data/static.json`, resolves names to EA ids and writes `server/gallery/sets.json`:

```ts
// One-off: fut.gg Gallery dump + EA static names → server/gallery/sets.json.
// Run: node --import tsx scripts/gallery-catalogue.ts  (prints unresolved sets; fix them in OVERRIDES)
import { readFileSync, writeFileSync } from 'node:fs';
import type { GallerySet, Grade, SetFilter } from '../server/gallery/types.js';

interface Dumped { url: string; name: string; requires: string; grades: { g: Grade; score: number; reward: string }[]; extraAssetIds?: number[] }

const dump: Dumped[] = JSON.parse(readFileSync('server/gallery/fut-gg-dump.json', 'utf8'));
const loc: Record<string, string> = JSON.parse(readFileSync('data/static.json', 'utf8')).data.loc;

// name → ids from EA's localisation keys (global.leagueFull.2027.league13, search.nationName.nation14, global.teamabbr*.2027.team1)
const index = (re: RegExp) => {
  const m = new Map<string, number[]>();
  for (const [k, v] of Object.entries(loc)) {
    const id = re.exec(k)?.[1];
    if (id) m.set(v.toLowerCase(), [...new Set([...(m.get(v.toLowerCase()) ?? []), Number(id)])]);
  }
  return m;
};
const leagues = index(/^global\.leagueFull\.\d+\.league(\d+)$/);
const nations = index(/^search\.nationName\.nation(\d+)$/);
const clubs = index(/^global\.teamabbr\d*\.\d+\.team(\d+)$/);

/** Hand fixes for sets the name lookup cannot resolve (campaign / rarity sets, women's teams). */
const OVERRIDES: Record<string, Partial<GallerySet>> = {
  // 'totw': { category: 'campaign', filter: { kinds: ['totw'] } },
};

const slug = (url: string) => new URL(url).pathname.split('/').filter(Boolean).slice(1).join('-');
const out: GallerySet[] = [];
const unresolved: string[] = [];
for (const d of dump) {
  const id = slug(d.url);
  const size = Number(/Requires (\d+)/.exec(d.requires)?.[1] ?? 0);
  const grades = Object.fromEntries(d.grades.map((x) => [x.g, x.score])) as Record<Grade, number>;
  const rewards = Object.fromEntries(d.grades.map((x) => [x.g, x.reward]));
  const name = d.name.toLowerCase();
  let filter: SetFilter | null = null;
  let category: GallerySet['category'] = 'campaign';
  if (clubs.has(name)) { category = 'club'; filter = { clubs: clubs.get(name)!, ...(d.extraAssetIds?.length ? { assetIds: d.extraAssetIds } : {}) }; }
  else if (leagues.has(name)) { category = 'league'; filter = { leagues: leagues.get(name)! }; }
  else if (nations.has(name)) { category = 'nation'; filter = { nations: nations.get(name)! }; }
  const set = { id, name: d.name, category, size, filter: filter ?? {}, grades, rewards, ...OVERRIDES[id] } as GallerySet;
  if ((!filter && !OVERRIDES[id]) || !size || Object.keys(grades).length !== 5) unresolved.push(`${id}: ${d.requires}`);
  out.push(set);
}
writeFileSync('server/gallery/sets.json', JSON.stringify(out, null, 1) + '\n');
console.log(`${out.length} sets written, ${unresolved.length} need an override:\n` + unresolved.join('\n'));
```

Club names in `loc` can collide (e.g. "England" is also a team): for club sets prefer the id whose league matches the category page the set came from (Premier League page → league 13). Resolve collisions with `OVERRIDES` entries. Women's club sets ("Arsenal Mens or Womens") need both club ids: add the women's club id in `OVERRIDES` when the lookup finds only one.

- [ ] **Step 4: Run it until nothing is unresolved**

Run: `node --import tsx scripts/gallery-catalogue.ts`
Expected: `127 sets written, 0 need an override`. Iterate on `OVERRIDES` (rarity / campaign sets map to `rarities` or `kinds`, e.g. TOTW → `{ kinds: ['totw'] }`, Heroes → `{ kinds: ['hero'] }`, Holographics → `{ kinds: ['holo'] }`, Bronze/Silver sets → `{ rarities: [...], minRating }` as the set's "Requires" text says).

- [ ] **Step 5: Write the loader test**

`server/gallery/catalogue.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalogue } from './catalogue.js';
import { GRADES } from './types.js';

test('catalogue is complete and well-formed', () => {
  const sets = loadCatalogue();
  assert.ok(sets.length >= 127);
  const ids = new Set<string>();
  for (const s of sets) {
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`);
    ids.add(s.id);
    assert.ok(s.size > 0, s.id);
    assert.ok(Object.keys(s.filter).length > 0, `${s.id} has no filter`);
    for (let k = 1; k < GRADES.length; k++) assert.ok(s.grades[GRADES[k]] > s.grades[GRADES[k - 1]], `${s.id} grades not ascending`);
  }
  const arsenal = sets.find((s) => s.id === 'premier-league-arsenal');
  assert.deepEqual(arsenal?.grades, { D: 10, C: 110000, B: 700000, A: 1300000, S: 2500000 });
  assert.equal(arsenal?.size, 20);
});
```

- [ ] **Step 6: Implement the loader**

`server/gallery/catalogue.ts`:

```ts
// The FUT Gallery set catalogue: static, transcribed from fut.gg (scripts/gallery-catalogue.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from '../store.js';
import type { GallerySet } from './types.js';

let cached: GallerySet[] | null = null;

export function loadCatalogue(): GallerySet[] {
  cached ??= JSON.parse(readFileSync(join(ROOT, 'server/gallery/sets.json'), 'utf8')) as GallerySet[];
  return cached;
}
```

- [ ] **Step 7: Run tests, commit**

Run: `node --import tsx --test server/gallery/catalogue.test.ts` → PASS.

```bash
git add scripts/gallery-catalogue.ts server/gallery/sets.json server/gallery/fut-gg-dump.json server/gallery/catalogue.ts server/gallery/catalogue.test.ts
git commit -m "feat(gallery): set catalogue from fut.gg"
```

Check `docs/deploy.md` / the Dockerfile: if only some server files are copied into the image, make sure `server/gallery/sets.json` is included.

---

### Task 5: `GET /api/gallery`

**Files:**
- Create: `server/gallery/compute.ts`
- Modify: `server/index.ts` (route next to `/api/club`, ~line 386), `docs/api.md`, `docs/architecture.md`
- Test: `server/gallery/compute.test.ts`

**Interfaces:**
- Consumes: `loadCatalogue` (Task 4), `bestLineup` (Task 2), `scoreSet`, `nextGrade` (Task 1), `readLedger`, `toGalleryItem`, `Ledger` (Task 3), `rarityKinds` (Task 1), `toPlayer` (`server/squad.ts:46`), `Meta` (`server/meta.ts`), `planFor` (`server/plans.ts`), `siteContext` (`server/auth.ts`), `SessionError` (`server/ea.ts`).
- Produces:
  - `buildGallery(sets: GallerySet[], ledger: Ledger, inClub: Set<number>, meta: Meta): GalleryResponse['sets']` (pure)
  - `galleryFor(acc: Account, meta: Meta): Promise<GalleryResponse>`
  - Response type (mirrored in `web/src/api.ts` in Task 6):

```ts
export interface GallerySetResult {
  id: string; name: string; category: GallerySet['category']; size: number;
  filled: number; missing: number; base: number; bonus: number; score: number;
  grade: Grade | null; next: { grade: Grade; need: number } | null;
  grades: Record<Grade, number>; rewards: Partial<Record<Grade, string>>;
  tags: TagResult[];
  lineup: (Player & { inClub: boolean; firstOwner: boolean; score: number })[];
}
export interface GalleryResponse { fetchedAt: number; ledgerSize: number; sets: GallerySetResult[] }
```

- [ ] **Step 1: Write the failing test**

`server/gallery/compute.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGallery } from './compute.js';
import { mergeLedger } from './ledger.js';
import type { ClubItem } from '../ea.js';
import type { GallerySet } from './types.js';
import type { Meta } from '../meta.js';

const meta = { names: { nation: {}, league: {}, club: {}, rarity: { '12': 'Base Icon' }, group: {}, loc: {} }, players: {} } as unknown as Meta;
const ci = (p: Partial<ClubItem>): ClubItem => ({
  id: 1, assetId: 10, resourceId: 10, rating: 84, rareflag: 1, preferredPosition: 'CM', possiblePositions: ['CM'],
  teamid: 1, leagueId: 13, nation: 14, untradeable: false, itemState: 'free', owners: 2, gradingScore: 830, ...p,
});
const set: GallerySet = { id: 'a', name: 'A', category: 'club', size: 2, filter: { clubs: [1] }, grades: { D: 10, C: 100, B: 1000, A: 5000, S: 9000 } };

test('empty ledger: every set listed, nothing filled', () => {
  const [r] = buildGallery([set], {}, new Set(), meta);
  assert.equal(r.filled, 0);
  assert.equal(r.missing, 2);
  assert.equal(r.grade, null);
  assert.deepEqual(r.lineup, []);
});

test('lineup marks in-club vs owned-before and carries the score', () => {
  const { ledger } = mergeLedger({}, [ci({ id: 1 }), ci({ id: 2, gradingScore: 2100 })], 1);
  const [r] = buildGallery([set], ledger, new Set([1]), meta);
  assert.equal(r.filled, 2);
  assert.equal(r.grade, 'B'); // 2930 + Multiples 10% (same assetId) = 3223
  assert.deepEqual(r.lineup.map((p) => [p.id, p.inClub, p.score]).sort(), [[1, true, 830], [2, false, 2100]]);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test server/gallery/compute.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement**

`server/gallery/compute.ts`:

```ts
// Gallery answer for one persona: best lineup + score per catalogue set, from the ledger.
import type { Account } from '../accounts.js';
import type { ClubItem } from '../ea.js';
import type { Meta } from '../meta.js';
import { toPlayer, type Player } from '../squad.js';
import { readCache } from '../store.js';
import { loadCatalogue } from './catalogue.js';
import { readLedger, toGalleryItem, type Ledger } from './ledger.js';
import { bestLineup } from './optimize.js';
import { nextGrade, scoreSet } from './score.js';
import { rarityKinds } from './tags.js';
import type { GallerySet, Grade, TagResult } from './types.js';

export interface GallerySetResult { /* as in the Interfaces block above */ }
export interface GalleryResponse { fetchedAt: number; ledgerSize: number; sets: GallerySetResult[] }

export function buildGallery(sets: GallerySet[], ledger: Ledger, inClub: Set<number>, meta: Meta): GallerySetResult[] {
  const kinds = rarityKinds(meta.names.rarity);
  const entries = Object.values(ledger);
  const pool = entries.map((e) => toGalleryItem(e, kinds));
  const byId = new Map(entries.map((e) => [e.item.id, e]));
  return sets.map((set) => {
    const lineup = bestLineup(set, pool);
    const s = scoreSet(set, lineup);
    return {
      id: set.id, name: set.name, category: set.category, size: set.size,
      filled: s.filled, missing: s.missing, base: s.base, bonus: s.bonus, score: s.total,
      grade: s.grade, next: nextGrade(set, s.total), grades: set.grades, rewards: set.rewards ?? {}, tags: s.tags,
      lineup: lineup.map((g) => {
        const e = byId.get(g.id)!;
        return { ...toPlayer(e.item, meta), inClub: inClub.has(g.id), firstOwner: e.firstOwner, score: g.score };
      }),
    };
  });
}

// per persona: recompute only when the ledger or the club changed
const memo = new Map<number, { key: string; value: GalleryResponse }>();

export async function galleryFor(acc: Account, meta: Meta): Promise<GalleryResponse> {
  const { ledger, at } = await readLedger(acc.id);
  const lists = await Promise.all(['club', 'storage', 'unassigned'].map((n) => readCache<ClubItem[]>(acc.key(n))));
  const key = `${at}:${lists.map((l) => l?.fetchedAt ?? 0).join(':')}:${lists.map((l) => l?.data.length ?? 0).join(':')}`;
  const hit = memo.get(acc.id);
  if (hit?.key === key) return hit.value;
  const inClub = new Set(lists.flatMap((l) => l?.data.map((i) => i.id) ?? []));
  const value = { fetchedAt: at, ledgerSize: Object.keys(ledger).length, sets: buildGallery(loadCatalogue(), ledger, inClub, meta) };
  memo.set(acc.id, { key, value });
  return value;
}
```

Fill `GallerySetResult` with the exact fields from the Interfaces block (copy them; `Player` from `../squad.js` — if `Player` is not exported there, export it or import the type from where `toPlayer`'s return type is declared). `inClub` covers club + SBC storage + unassigned (still owned); the spec's per-entry `inClub` flag is computed here instead of stored, which removes the flip logic.

`server/index.ts`, after `app.get('/api/club', …)`:

```ts
// FUT Gallery planner (Premium): best lineup per set from every item seen in the club
app.get('/api/gallery', async (req) => {
  const { userId, acc } = await siteContext(req);
  if ((await planFor(userId)).tier !== 'premium') throw new SessionError('FUT Gallery is a Premium feature.', 403, 'premiumOnly');
  return galleryFor(acc, await metaFor(acc));
});
```

Check `metaFor` is the function `/api/solve` uses (`server/index.ts`, `const meta = await metaFor(acc);`) and import `galleryFor` from `./gallery/compute.js`.

`docs/api.md`: add a `GET /api/gallery` section (auth like `/api/club`, Premium only → 403 `premiumOnly`, response shape above, "never calls EA; reads the ledger"). `docs/architecture.md`: a short "FUT Gallery ledger" paragraph (fed by `onCacheWrite` for club / storage / unassigned, backfilled from cache + `challengeSquads` on first read, keeps sold items, skips loans).

- [ ] **Step 4: Tests + live check**

Run: `node --import tsx --test server/gallery/compute.test.ts && npm test && npm run typecheck` → PASS.

With `npm run dev` running (do not stop it afterwards), sign in as a Premium/admin user in the browser and open `http://localhost:5173` devtools console:

```js
await (await fetch('/api/gallery', { headers: { Authorization: `Bearer ${await window.Clerk.session.getToken()}`, 'X-Persona': localStorage.getItem('sbc-persona') } })).json()
```

(Use the real persona header key from `web/src/api.ts` if `sbc-persona` differs.) Expected: 127 sets, `ledgerSize` ≈ club + storage size, lineups only from eligible items, response in < 1 s. Spot-check one club set's lineup against the club view.

- [ ] **Step 5: Commit**

```bash
git add server/gallery/compute.ts server/gallery/compute.test.ts server/index.ts docs/api.md docs/architecture.md
git commit -m "feat(gallery): GET /api/gallery for Premium"
```

---

### Task 6: Web route, API helper and list helpers

**Files:**
- Modify: `web/src/route.ts` (Route union, `parseRoute`, `routePath`, header comment), `web/src/route.test.ts`, `web/src/api.ts` (types + `api.gallery`)
- Create: `web/src/components/gallery/gallery.ts`, `web/src/components/gallery/gallery.test.ts`

**Interfaces:**
- Consumes: response shape from Task 5.
- Produces:
  - `Route` member `{ view: 'gallery'; setId: string | null }`; paths `/dashboard/gallery`, `/dashboard/gallery/<setId>` (setId matches `/^[a-z0-9-]+$/`)
  - `api.gallery(): Promise<GalleryResponse>`; exported types `GalleryResponse`, `GallerySetResult`, `GalleryGrade`
  - `gallery.ts`: `type GallerySort = 'score' | 'progress' | 'grade' | 'name'`, `interface GalleryFilter { category: 'all' | GallerySetResult['category']; state: 'all' | 'complete' | 'incomplete'; minGrade: GalleryGrade | null }`, `progress(s): number` (0..1 to the next grade, 1 when S), `filterSort(sets, filter, sort): GallerySetResult[]`

- [ ] **Step 1: Write failing tests**

Append to `web/src/route.test.ts` (follow its existing style):

```ts
test('gallery routes', () => {
  assert.deepEqual(parseRoute('/dashboard/gallery'), { view: 'gallery', setId: null });
  assert.deepEqual(parseRoute('/dashboard/gallery/premier-league-arsenal'), { view: 'gallery', setId: 'premier-league-arsenal' });
  assert.deepEqual(parseRoute('/dashboard/gallery/<bad>'), { view: 'gallery', setId: null });
  assert.equal(routePath({ view: 'gallery', setId: null }), '/dashboard/gallery');
  assert.equal(routePath({ view: 'gallery', setId: 'a-b' }), '/dashboard/gallery/a-b');
});
```

`web/src/components/gallery/gallery.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterSort, progress } from './gallery.js';
import type { GallerySetResult } from '../../api.js';

const s = (p: Partial<GallerySetResult>): GallerySetResult => ({
  id: 'x', name: 'X', category: 'club', size: 20, filled: 20, missing: 0, base: 0, bonus: 0, score: 0,
  grade: 'C', next: { grade: 'B', need: 500 }, grades: { D: 10, C: 1000, B: 2000, A: 3000, S: 4000 }, rewards: {}, tags: [], lineup: [], ...p,
});
const all = { category: 'all', state: 'all', minGrade: null } as const;

test('progress to the next grade', () => {
  assert.equal(progress(s({ score: 1500, grade: 'C', next: { grade: 'B', need: 500 } })), 0.5);
  assert.equal(progress(s({ score: 4000, grade: 'S', next: null })), 1);
  assert.equal(progress(s({ score: 0, grade: null, filled: 3, missing: 17, next: { grade: 'D', need: 10 } })), 0);
});

test('filters and sorts', () => {
  const sets = [
    s({ id: 'a', name: 'B', score: 1500, category: 'club' }),
    s({ id: 'b', name: 'A', score: 3500, grade: 'A', next: { grade: 'S', need: 500 }, category: 'league' }),
    s({ id: 'c', name: 'C', score: 100, grade: null, filled: 5, missing: 15 }),
  ];
  assert.deepEqual(filterSort(sets, all, 'score').map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(filterSort(sets, all, 'name').map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(filterSort(sets, { ...all, state: 'incomplete' }, 'score').map((x) => x.id), ['c']);
  assert.deepEqual(filterSort(sets, { ...all, category: 'league' }, 'score').map((x) => x.id), ['b']);
  assert.deepEqual(filterSort(sets, { ...all, minGrade: 'B' }, 'score').map((x) => x.id), ['b']);
  assert.deepEqual(filterSort(sets, all, 'grade').map((x) => x.id), ['b', 'a', 'c']);
});
```

- [ ] **Step 2: Run to verify failure**

Run: `node --import tsx --test web/src/route.test.ts web/src/components/gallery/gallery.test.ts` → FAIL.

- [ ] **Step 3: Implement**

`web/src/route.ts`: add `| { view: 'gallery'; setId: string | null }` to `Route`; in `parseRoute` after the `settings` line:

```ts
  if (x === 'gallery') return { view: 'gallery', setId: y && /^[a-z0-9-]+$/.test(y) ? y : null };
```

in `routePath`:

```ts
    case 'gallery':
      return r.setId ? `/dashboard/gallery/${r.setId}` : '/dashboard/gallery';
```

and add `/dashboard/gallery  gallery list   /dashboard/gallery/<set>  a gallery set` to the header comment.

`web/src/api.ts`: add types (same fields as Task 5's `GallerySetResult`, with `lineup: (Player & { inClub: boolean; firstOwner: boolean; score: number })[]`), `export type GalleryGrade = 'D' | 'C' | 'B' | 'A' | 'S';`, and in `api`:

```ts
  gallery: () => req<GalleryResponse>('/api/gallery'),
```

`web/src/components/gallery/gallery.ts`:

```ts
// Gallery list filters and sort (pure, tested).
import type { GalleryGrade, GallerySetResult } from '../../api';

export type GallerySort = 'score' | 'progress' | 'grade' | 'name';
export interface GalleryFilter {
  category: 'all' | GallerySetResult['category'];
  state: 'all' | 'complete' | 'incomplete';
  minGrade: GalleryGrade | null;
}
export const GRADE_ORDER: GalleryGrade[] = ['D', 'C', 'B', 'A', 'S'];
const rank = (g: GalleryGrade | null) => (g ? GRADE_ORDER.indexOf(g) : -1);

/** 0..1 of the way from the current grade's threshold to the next; 1 at S, 0 when incomplete. */
export function progress(s: GallerySetResult): number {
  if (s.missing > 0) return 0;
  if (!s.next) return 1;
  const from = s.grade ? s.grades[s.grade] : 0;
  const to = s.grades[s.next.grade];
  return to > from ? Math.max(0, Math.min(1, (s.score - from) / (to - from))) : 0;
}

export function filterSort(sets: GallerySetResult[], f: GalleryFilter, sort: GallerySort): GallerySetResult[] {
  const kept = sets.filter((s) =>
    (f.category === 'all' || s.category === f.category) &&
    (f.state === 'all' || (f.state === 'complete' ? s.missing === 0 : s.missing > 0)) &&
    (f.minGrade === null || rank(s.grade) >= rank(f.minGrade)));
  const by: Record<GallerySort, (a: GallerySetResult, b: GallerySetResult) => number> = {
    score: (a, b) => b.score - a.score,
    progress: (a, b) => progress(b) - progress(a) || b.score - a.score,
    grade: (a, b) => rank(b.grade) - rank(a.grade) || b.score - a.score,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return kept.sort(by[sort]);
}
```

Fix every `switch (r.view)` / exhaustive check in the web app that TypeScript now flags (e.g. `App.tsx:288` title mapping) by adding the `gallery` case.

- [ ] **Step 4: Run tests + typecheck**

Run: `npm test && npm run typecheck` → PASS.

- [ ] **Step 5: Commit**

```bash
git add web/src/route.ts web/src/route.test.ts web/src/api.ts web/src/components/gallery
git commit -m "feat(gallery): web route, api helper, list sort and filters"
```

---

### Task 7: Gallery screens

**Files:**
- Create: `web/src/components/gallery/GalleryList.tsx`, `web/src/components/gallery/GallerySet.tsx`
- Modify: `web/src/App.tsx` (sidebar item between Club and Settings ~line 665-672; view rendering next to the club view ~line 748; data load; title mapping ~line 288), `web/src/styles.css`, `web/src/locales/en.ts`, `ro.ts`, `it.ts`

**Interfaces:**
- Consumes: `api.gallery`, `GalleryResponse`, `GallerySetResult` (Task 6), `filterSort`, `progress`, `GRADE_ORDER`, `GalleryFilter`, `GallerySort` (Task 6), `Card`, `EmptyCard` (`web/src/components/Card.tsx`), `Meta`, `navigate`, `t()`, `premium` flag in `App.tsx:136`.
- Produces: `<GalleryList data meta onOpen(setId) />`, `<GallerySet set meta onBack() />`.

Read `DESIGN.md` and look at `SetList.tsx` / `ClubView.tsx` / the Settings locked card (`App.tsx:761-767`, `.locked-note` with `Crown`) before writing markup, and reuse their classes and patterns.

- [ ] **Step 1: i18n keys**

Add to `en.ts` (and the same keys translated in `ro.ts` and `it.ts`; Romanian plurals `_one`/`_few`/`_other`, Italian `_one`/`_other`):

```ts
  'nav.gallery': 'Gallery',
  'gallery.title': 'FUT Gallery',
  'gallery.lede': 'The best lineup you can grade in every Gallery set, from every player that has been in your club.',
  'gallery.locked': 'The Gallery planner is a Premium feature.',
  'gallery.historyNote': 'Players you owned before installing the extension are not recorded; everything from then on is, even after you sell it.',
  'gallery.seen_one': '{count} player recorded',
  'gallery.seen_other': '{count} players recorded',
  'gallery.filter.category': 'Category',
  'gallery.filter.state': 'Sets',
  'gallery.filter.minGrade': 'Minimum grade',
  'gallery.cat.all': 'All',
  'gallery.cat.league': 'Leagues',
  'gallery.cat.club': 'Clubs',
  'gallery.cat.nation': 'Nations',
  'gallery.cat.rarity': 'Rarities',
  'gallery.cat.campaign': 'Campaigns',
  'gallery.state.all': 'All',
  'gallery.state.complete': 'Can complete',
  'gallery.state.incomplete': 'Missing players',
  'gallery.sort': 'Sort by',
  'gallery.sort.score': 'Score',
  'gallery.sort.progress': 'Progress to next grade',
  'gallery.sort.grade': 'Grade',
  'gallery.sort.name': 'Name',
  'gallery.grade': 'Grade {g}',
  'gallery.noGrade': 'No grade',
  'gallery.slots': '{filled}/{size}',
  'gallery.missing_one': '{count} player missing',
  'gallery.missing_other': '{count} players missing',
  'gallery.toNext': '{need} to {g}',
  'gallery.best': 'Best grade reached',
  'gallery.score': 'Score',
  'gallery.base': 'Items',
  'gallery.bonus': 'Bonus tags',
  'gallery.inClub': 'In club',
  'gallery.ownedBefore': 'Owned before',
  'gallery.firstOwner': 'First owner',
  'gallery.thresholds': 'Grades',
  'gallery.tags': 'Bonus tags met',
  'gallery.noTags': 'No bonus tag reached yet.',
  'gallery.tagLine': '{count} items, +{pct}%',
  'gallery.empty': 'No set matches these filters.',
  'gallery.back': 'All sets',
  'gallery.tag.sameNation': 'Same Nation',
  'gallery.tag.differentNation': 'Different Nation',
  'gallery.tag.sameClub': 'Same Club',
  'gallery.tag.differentClub': 'Different Club',
  'gallery.tag.sameLeague': 'Same League',
  'gallery.tag.differentLeague': 'Different League',
  'gallery.tag.bronze': 'Bronze',
  'gallery.tag.silver': 'Silver',
  'gallery.tag.golden': 'Golden',
  'gallery.tag.holographic': 'Holographic',
  'gallery.tag.iconic': 'Iconic',
  'gallery.tag.heroic': 'Heroic',
  'gallery.tag.totw': 'TOTW',
  'gallery.tag.firstOwner': 'First Owner',
  'gallery.tag.handsOnly': 'Hands Only',
  'gallery.tag.multiples': 'Multiples!',
  'gallery.tag.ambidextrous': 'Ambidextrous',
  'gallery.tag.skilled': 'Skilled',
  'gallery.tag.defensiveWall': 'Defensive Wall',
  'gallery.tag.midfieldControl': 'Midfield Control',
  'gallery.tag.allOutAttack': 'All out Attack',
  'err.premiumOnly': 'This is a Premium feature.',
```

Check how existing plural keys are written in `en.ts` (e.g. search `_one`) and follow that exact convention; check if `err.premiumOnly` or an equivalent already exists and reuse it. Set names and reward texts are EA-originated: shown as they are, not translated.

- [ ] **Step 2: `GalleryList.tsx`**

Header (h1 `gallery.title`, lede, `gallery.seen` count, history note), a toolbar with three `<select>`s (category, state, min grade) and a sort `<select>`, all labelled. Rows are buttons (`onOpen(set.id)`):

```tsx
<li key={s.id}>
  <button type="button" className="gallery-row" onClick={() => onOpen(s.id)}>
    <span className="gallery-name">{s.name}</span>
    <span className="muted">{t(`gallery.cat.${s.category}`)}</span>
    <GradeBar set={s} />
    <span className={`grade-pill${s.grade ? ' met' : ''}`}>{s.grade ? t('gallery.grade', { g: s.grade }) : t('gallery.noGrade')}</span>
    <span className="muted">
      {s.missing ? t('gallery.missing', { count: s.missing }) : s.next ? t('gallery.toNext', { need: fmt(s.next.need), g: s.next.grade }) : t('gallery.best')}
    </span>
  </button>
</li>
```

`GradeBar` (export it from `GalleryList.tsx`; `GallerySet.tsx` uses it too): a `<div role="img" aria-label="…score / threshold…">` with five segments D–S, each filled to the share reached; segment labels as letters under it; filled segments use `--go` only when that grade is met. Format numbers with `toLocaleString(lang)`. Keep filter + sort state in component state (not the URL), defaults: all / all / none / score.

- [ ] **Step 3: `GallerySet.tsx`**

Back link (`gallery.back`) to the list, h1 = set name, score line (`gallery.score` total, `base` + `bonus`), `GradeBar`, the grade pill, thresholds table (grade, score required, reward text, met ✓ with text, not color only), lineup grid:

```tsx
<ul className="gallery-lineup">
  {set.lineup.map((p) => (
    <li key={p.id}>
      <Card player={p} meta={meta} size="sm" />
      <span className="gallery-item-score">{p.score.toLocaleString(lang)}</span>
      <span className={`own-tag ${p.inClub ? 'in' : 'out'}`}>
        {p.inClub ? <House aria-hidden="true" /> : <ClockCounterClockwise aria-hidden="true" />}
        {p.inClub ? t('gallery.inClub') : t('gallery.ownedBefore')}
      </span>
      {p.firstOwner && <span className="fo-badge"><Crown aria-hidden="true" /> {t('gallery.firstOwner')}</span>}
    </li>
  ))}
  {[...Array(set.missing)].map((_, k) => <li key={`e${k}`}><EmptyCard size="sm" /></li>)}
</ul>
```

Tag list: one row per `set.tags` entry, `t('gallery.tag.' + tag.id)`, `t('gallery.tagLine', { count, pct })`, `+bonus`; `gallery.noTags` when empty. Unknown `setId` (not in data) → render the list instead (navigate replace to `/dashboard/gallery`).

- [ ] **Step 4: Wire into `App.tsx`**

- Sidebar button between Club and Settings, same markup as the Club item, icon `FrameCorners` from `@phosphor-icons/react`, label `t('nav.gallery')`, `aria-current` when `view === 'gallery'`, `onClick={() => go('gallery')}` (extend `go`'s accepted views the way `club` is handled).
- Data: `const [gallery, setGallery] = useState<GalleryResponse | null>(null)`; load with `api.gallery()` when `view === 'gallery' && premium`, and reload when the existing "cache edited" signal fires (the same trigger that reloads the club; see commit `6482bfc` "reload when the web app fills the cache").
- Render: if `!premium`, the locked note (`.locked-note` with `Crown`, `t('gallery.locked')`) plus `<PlanCard … />`; else `route.setId` → `<GallerySet>` for the matching set, otherwise `<GalleryList>`. Navigation via `navigate({ view: 'gallery', setId })`.
- Title mapping (~line 288): `view === 'gallery' ? 'Gallery'`.

- [ ] **Step 5: Styles**

In `web/src/styles.css`, using the existing tokens only (no new colors): `.gallery-row` (grid: name / category / bar / pill / note; containers 14px radius), `.grade-bar` segments, `.grade-pill` (`.met` uses `--go`), `.gallery-lineup` (grid `repeat(auto-fill, minmax(120px, 1fr))`, gap), `.own-tag`, `.fo-badge`. Under `@media (max-width: 860px)` rows stack into single-column cards; under 480px `.gallery-lineup` is 2 columns. Any transition wrapped so `@media (prefers-reduced-motion: reduce)` disables it.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm run build && npm run i18n:check && npm test` → all pass.

In the browser (dev server running; do not stop it): as a Premium/admin user open `/dashboard/gallery` — list shows 127 sets, filters and sort work, a set page shows lineup cards with the in-club / owned-before tags, tag bonuses and thresholds. Switch language to RO and IT: no missing keys. Resize to 390px: hamburger menu has "Gallery", rows stack, lineup grid 2 columns, no horizontal scroll. As a free user: locked note, no data request succeeds (403 handled, no error toast loop). Check keyboard focus on rows and selects.

- [ ] **Step 7: Commit**

```bash
git add web/src
git commit -m "feat(gallery): gallery list and set screens"
```

---

### Task 8: Final verification and docs

**Files:**
- Modify: `CLAUDE.md` (Layout: one line for `server/gallery/`), `PRODUCT.md` if it lists features

- [ ] **Step 1: Add the layout line**

In `CLAUDE.md` → Layout, after the `server/` description, add: `server/gallery/` FUT Gallery planner (`ledger.ts` items ever seen per persona from cache writes, `score.ts` set score + tags, `optimize.ts` best lineup, `sets.json` catalogue from fut.gg via `scripts/gallery-catalogue.ts`).

- [ ] **Step 2: Full check**

Run: `npm run typecheck && npm test && npm run build && npm run i18n:check`
Expected: all green; paste the summary lines in the final report.

- [ ] **Step 3: Real-data sanity**

With the dev server: open the gallery for a real account, pick 3 sets (one club, one league, one campaign) and check by hand that every lineup item matches the set (club / league / rarity) and that the score equals the sum of item scores plus the listed tag bonuses.

- [ ] **Step 4: Commit and hand off**

```bash
git add CLAUDE.md PRODUCT.md
git commit -m "docs(gallery): layout notes"
```

Do not push and do not merge. Report to the user and use superpowers:finishing-a-development-branch to decide how to merge `feat/gallery` back into `dev`.
