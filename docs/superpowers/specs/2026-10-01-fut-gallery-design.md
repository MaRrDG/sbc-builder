# FUT Gallery planner: design

## Goal

FC 27 added the FUT Gallery: themed sets (leagues, clubs, nations, rarities, campaigns) filled with
player items that have ever passed through the club, graded D–S by score. The game only shows it
in-game; the EA web app has no Gallery. We show, per set, the best lineup the user can already field
and the grade / score it reaches, so they know which sets to grade and what they are missing.

Premium only. Read-only toward EA (no new EA calls, no actions).

### Decisions

- **Only what you have.** No buy suggestions, no prices. (Buy hints are a possible later step.)
- **History = a ledger from now on.** EA does not expose sold / submitted items to the web app, so we
  record every item we ever see and keep it after it leaves the club. Items owned before the
  extension was installed are not known. Backfill on first run from what the cache already has.
- **Set definitions = a static JSON in the repo**, transcribed once from fut.gg (127 sets at
  27 Sept 2026), updated by hand when EA adds sets.
- **Optimizer = greedy + local improvement in TypeScript**, not CP-SAT.
- **Exact scores from EA.** Every club item carries `gradingScore` (the same Item Score as Streamlined
  SBCs: 84→830, 85→2,100, rarity multipliers already applied). We use it as sent.

## Gallery rules (from EA / fut.gg, 27 Sept 2026)

- A set has `size` slots, each filled with an item matching the set's filter.
- Score = Base (sum of item `gradingScore`) + Bonus (tags). Total score picks the grade by the set's
  D/C/B/A/S thresholds.
- Items count after being sold or submitted into an SBC. Loan items never count.
- Tags: each pays its tier percentage on the items that match it (not the whole set), rounded down per
  tag. 21 tags:

| Tag | Matches | Tiers (items → %) |
|---|---|---|
| Same Nation / Same Club | largest group sharing the value | 5–9 1, 10–19 2, 20+ 4 |
| Same League | largest group sharing the league | 5–9 1, 10–19 2, 20+ 8 |
| Different Nation / Club / League | one item per distinct value | 5–9 1, 10–19 2, 20+ 4 |
| Bronze | rating < 65 | 5–9 20, 10–19 40, 20+ 80 |
| Silver | rating 65–74 | 5–9 15, 10–19 30, 20+ 60 |
| Golden | rating ≥ 75 | 5–9 1, 10–19 2, 20+ 4 |
| Holographic | holographic rareflags | 2–3 8, 4–5 12, 6+ 20 |
| Iconic | icon rareflag | 2–3 10, 4–5 15, 6+ 25 |
| Heroic | hero rareflags | 2–3 8, 4–5 12, 6+ 20 |
| TOTW | TOTW rareflag | 3–5 4, 6–9 8, 10+ 15 |
| First Owner | first-owner items | 5–9 150, 10–19 300, 20+ 500 |
| Hands Only | GK | 3–5 3, 6–9 6, 10+ 15 |
| Multiples! | same `assetId` repeated (largest group) | 2 10, 3 15, 4+ 20 |
| Ambidextrous | weak foot 5★ | 3–4 3, 5–9 6, 10+ 12 |
| Skilled | skill moves 5★ | 3–4 3, 5–9 6, 10+ 12 |
| Defensive Wall | CB, LB, RB | 5–9 3, 10–14 6, 15+ 10 |
| Midfield Control | CDM, CM, CAM, LM, RM | 5–9 3, 10–14 6, 15+ 10 |
| All out Attack | ST, RW, LW | 5–9 3, 10–14 6, 15+ 10 |

"Different X" takes the best-scoring item per distinct value. The interpretation is pinned by a test
against fut.gg's Arsenal example (20 items, bonus total 17,228); if it does not match, the test decides.

## Data

### Set catalogue: `server/gallery/sets.json` (static, committed)

```json
{ "id": "arsenal", "name": "Arsenal", "category": "club", "size": 20,
  "filter": { "clubs": [1] },
  "grades": { "D": 10, "C": 110000, "B": 700000, "A": 1300000, "S": 2500000 },
  "rewards": { "B": "50 Gallery Tokens" } }
```

- `category`: `league | club | nation | rarity | campaign`.
- `filter` keys (all optional, AND between keys, OR inside one): `clubs`, `leagues`, `nations`,
  `rarities` (rareflags), `gender`. Stored as EA ids, never names.
- Reward texts stay in English as data (EA-originated names), like SBC names.

### Tags: `server/gallery/tags.ts`

Tag list as data (id, tiers) plus one match function per tag. The rareflag → kind map (icon, hero,
TOTW, holographic) is built once from `data/static.json` rarity names and kept as a constant.

### Ledger: `data/accounts/<personaId>/gallery.json` (per-persona JSON cache, via `store.ts`)

Keyed by `item.id`:

```ts
interface LedgerItem {
  id: number; assetId: number; resourceId: number;
  rating: number; rareflag: number; gradingScore: number;
  nation: number; leagueId: number; teamid: number; gender: number;
  preferredPosition: string; weakfoot: number; skillmoves: number;
  firstOwner: boolean;   // owners === 1 the first time we saw it; never flips back
  inClub: boolean;       // recomputed on every club sync
  firstSeen: number; lastSeen: number;
}
```

- `recordCollected(acc, items, { clubSnapshot? })` in `server/gallery/ledger.ts`, called wherever items
  are already written: club, storage, unassigned, `/purchased/items` (`server/events.ts`) and SBC submits
  (`applySubmittedSbc`). A club snapshot also flips `inClub` false for ledger items missing from it.
- Loan items are skipped (exact flag confirmed from real data during implementation).
- First call per persona backfills from the cached club, storage, unassigned and `challengeSquads/`.
- No new EA calls anywhere.

## Computation

### `server/gallery/score.ts` (pure)

`scoreSet(set, items) → { base, tags: { id, count, pct, bonus }[], total, grade: Grade | null }`.
The only place that computes score and grade. `grade` is null when fewer than `size` items.

### `server/gallery/optimize.ts` (pure)

`bestLineup(set, ledger) → LedgerItem[]`:
1. Eligible = ledger items matching `set.filter`.
2. Start with the top `size` by `gradingScore`.
3. Loop: for each tag, try swaps that reach its next tier (swap out the lowest-contribution item for an
   eligible one that matches the tag); keep a swap only if `scoreSet` total rises. Stop when no swap helps.
4. Fewer eligible than `size` → return what there is (incomplete set).

### API: `GET /api/gallery`

Premium only (`planFor` → `tier === 'premium'`, else 403 with `msgCode: 'err.premiumOnly'` or the
existing equivalent). Response:

```ts
{ fetchedAt: number; ledgerSize: number; sets: {
  id: string; name: string; category: string; size: number; filled: number;
  score: number; grade: Grade | null; next: { grade: Grade; need: number } | null;
  lineup: { itemId: number; inClub: boolean; firstOwner: boolean; score: number; /* card fields */ }[];
  tags: { id: string; count: number; pct: number; bonus: number }[];
}[] }
```

Result cached per persona and invalidated when the ledger is written. Documented in `docs/api.md`.

## UI

- Routes: `/dashboard/gallery` (list), `/dashboard/gallery/:setId` (one set), in `web/src/route.ts`.
  Sidebar item "Gallery" between Club and Settings (Phosphor icon). Free users see an upsell
  (existing `PlanCard` pattern) instead of the data.
- **List** (`web/src/components/gallery/GalleryList.tsx`): rows with name, category, D–S bar with the
  score, grade as a letter, "18/20" slots. Filters: category, complete / incomplete, minimum grade.
  Sort: score (default), progress to next grade (%), grade, name. Incomplete sets shown too
  ("3 players missing").
- **Set page** (`GallerySet.tsx`): lineup grid of EA cards (`Card.tsx`) with item score, label
  "in club" / "owned before" (icon + text, not color only), First Owner badge; empty slots dashed.
  Tags met / not met with count, percent and bonus. D–S thresholds and points to the next grade.
  Note: items owned before the extension was installed are not recorded.
- All text through `t()` (en / ro / it, plurals). 390px: list as single-column cards, lineup grid 2
  columns. `--go` only for met grades. Respect `prefers-reduced-motion`.

## Testing

- `server/gallery/score.test.ts`: Arsenal fixture from fut.gg (bonus 17,228), tier edges, per-tag
  rounding, incomplete set → no grade.
- `server/gallery/optimize.test.ts`: greedy baseline; swap wins for the 5th First Owner and the 2nd
  Icon; never lowers the total.
- `server/gallery/ledger.test.ts` (pure parts): merge keeps `firstOwner`, `inClub` flips on snapshot,
  loans skipped.
- Typecheck, build, `npm run i18n:check`; check against real cached club data and in the browser at
  desktop and 390px.

## Out of scope

Buy suggestions, prices, manual "I owned this" entry, Gallery Tokens / Token Store planning,
scraping fut.gg automatically.
