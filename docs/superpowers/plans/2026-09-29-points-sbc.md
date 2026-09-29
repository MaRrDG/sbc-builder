# Points SBCs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Solve EA's points challenges ("Player SBCs", e.g. 4,000 points): pick cards from the user's club that reach the points still missing with the least overshoot, then the lowest cost, and show them in a Work Area like the web app's.

**Architecture:** Pure rules in a new `server/points.ts` (target, per-card requirement rules, exact re-check) with node:test tests; the requirement keys 40/41 ported into `server/sbc.ts`; a two-stage CP-SAT model (`mode: "points"`) in `solver/cpsat.py` driven by `solvePoints` in `server/solver.ts`; a points branch in `POST /api/solve`; on the site a `PointsArea` component that replaces the pitch for points challenges.

**Tech Stack:** Fastify 5 + TS (`tsx`), OR-Tools CP-SAT (Python), React 19 + Vite, plain CSS (OKLCH tokens), Phosphor icons, node:test.

**Spec:** `docs/superpowers/specs/2026-09-29-points-sbc-design.md` (mockup: https://claude.ai/artifact/Ftru8whZ27zUhWA3hX4tAd)

## Global Constraints

- Read-only toward EA: no new EA API endpoint, no job recipe, no submit. The web app's public JS bundle is read once while implementing Task 1 (static file, no session, never at runtime).
- A card's points are `gradingScore` exactly as EA sends it; never computed by us.
- Points challenge ⇔ `scoreRequirement > 0`; target = `max(0, scoreRequirement − (submittedScore ?? 0))`.
- Objective order: minimum total ≥ target (least overshoot) first, then minimum `Σ playerCost`.
- `found` comes from `checkPoints` (server/points.ts), never from the solver. A requirement we cannot check is "not checked" and blocks `found`.
- At most one card per `assetId` in a selection (same rule as squads; EA's one-click rule for duplicates is unknown, so we stay safe).
- Every site string through `t()`; keys in `web/src/locales/en.ts` + `ro.ts`; Romanian plurals `_one` / `_few` / `_other`; `npm run i18n:check` passes.
- `--go` green only for the primary action / met / reached; `--pos` not used for points; state never by colour alone; controls 8px radius, containers 14px; `prefers-reduced-motion` respected.
- Responsive: 7 card columns at 1280, 4 at 390, no horizontal scroll at 390, touch targets ≥ 44px on phones.
- `docs/api.md`, `docs/solver.md`, `docs/architecture.md` updated.
- Never print keys, SIDs or sessions from `data/`. Don't start/stop `npm run dev`.
- Commits: `type(scope): subject`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

- Challenge already has all its points (`submittedScore ≥ scoreRequirement`) → no solve, clear message, no quota used (Task 4 route check).
- Club has fewer eligible points than the target → no solver run, reason "X of Y points" incl. how many the user's settings hide (Task 4).
- Two copies of the same player (same `assetId`) → never both picked (Task 3 solver case).
- A requirement with a key we don't know (EA adds a new one) → shown as not checked, `found` false, the list still shows the best cards (Task 2 test).
- Old saved results / squad challenges → unchanged behaviour: `points` absent means the pitch as today; cards without `points` count 0 (Task 5/6 manual check).

---

### Task 1: Requirement keys 40 / 41 (attribute requirement)

**Files:**
- Modify: `server/sbc.ts` (`Key`, `parseRequirements`, `describe`)
- Test: `server/sbc.test.ts` (new)

**Interfaces:**
- Produces: `Key.ATTRIBUTE_VALUE` (40), `Key.ATTRIBUTE_ID` (41), exported `ATTRIBUTE_NAMES: Record<number, string>`; an attribute requirement parses to one `Requirement` with `combined: false`, `keys` holding both 41 and 40, `scope` from key 13, `text` like `OVR Min: 45`.

What EA sends for "OVR Min: 45" (challenge 47, set 20):
```json
[{"type":"PLAYER_ATTRIBUTE","eligibilitySlot":1,"eligibilityKey":41,"eligibilityValue":1},
 {"type":"SCOPE","eligibilitySlot":1,"eligibilityKey":13,"eligibilityValue":0},
 {"type":"ACADEMY_PLAYER_SLOTTING","eligibilitySlot":1,"eligibilityKey":40,"eligibilityValue":45}]
```
Hypothesis: key 41 = which attribute (1 = OVR), key 40 = the attribute's value, scope from key 13 (0 = Min).

- [ ] **Step 1: Confirm the hypothesis from the web app's code (read-only)**

```bash
curl -s https://www.ea.com/ea-sports-fc/ultimate-team/web-app/ -o /tmp/claude-webapp.html
grep -oE 'src="[^"]+\.js[^"]*"' /tmp/claude-webapp.html
# download each listed script (static files, no cookies/headers) and search it:
curl -s "<script url>" -o /tmp/claude-webapp.js
grep -oE '.{200}ACADEMY_PLAYER_SLOTTING.{300}' /tmp/claude-webapp.js | head
grep -oE '.{200}PLAYER_ATTRIBUTE.{300}' /tmp/claude-webapp.js | head
```
Find (a) the eligibility-key enum entries for 40 and 41, (b) the attribute-id → label map (the one that yields "OVR" for 1), (c) how the requirement string is built (scope word placement: "OVR Min: 45"). Write the findings (enum names, the attribute map, the string format) into the task report. If the code contradicts the hypothesis, stop and report BLOCKED with what you found. Use the real names from the bundle for the `Key` entries and the full attribute map for `ATTRIBUTE_NAMES`.

- [ ] **Step 2: Write the failing test** — `server/sbc.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EligibilityReq } from './ea.js';
import type { Meta } from './meta.js';
import { Key, parseRequirements } from './sbc.js';

const meta = { names: { nation: {}, league: {}, club: {}, rarity: {}, group: {} } } as unknown as Meta;
const ovrMin45: EligibilityReq[] = [
  { type: 'PLAYER_ATTRIBUTE', eligibilitySlot: 1, eligibilityKey: 41, eligibilityValue: 1 },
  { type: 'SCOPE', eligibilitySlot: 1, eligibilityKey: 13, eligibilityValue: 0 },
  { type: 'ACADEMY_PLAYER_SLOTTING', eligibilitySlot: 1, eligibilityKey: 40, eligibilityValue: 45 },
];

test('attribute requirement is one per-card requirement, worded like the web app', () => {
  const [r] = parseRequirements(ovrMin45, meta);
  assert.equal(r.combined, false);
  assert.equal(r.count, -1);
  assert.deepEqual(r.keys.get(Key.ATTRIBUTE_ID), [1]);
  assert.deepEqual(r.keys.get(Key.ATTRIBUTE_VALUE), [45]);
  assert.equal(r.text, 'OVR Min: 45');
});

test('unknown attribute id still gets readable text', () => {
  const [r] = parseRequirements(ovrMin45.map((e) => (e.eligibilityKey === 41 ? { ...e, eligibilityValue: 999 } : e)), meta);
  assert.equal(r.text, 'Attribute 999 Min: 45');
});
```
(If Step 1 shows EA words it differently, change the expected strings to the web app's exact wording and say so in the report.)

- [ ] **Step 3: Run to verify it fails** — `node --import tsx --test server/sbc.test.ts` → FAIL (`Key.ATTRIBUTE_ID` undefined / text mismatch).

- [ ] **Step 4: Implement in `server/sbc.ts`**

Add to `Key` (after `ALL_PLAYERS_CHEMISTRY_POINTS: 36`), names per Step 1:
```ts
  ATTRIBUTE_VALUE: 40, // the value an attribute requirement compares against
  ATTRIBUTE_ID: 41, // which attribute (ATTRIBUTE_NAMES)
```
Below `Key` / `Scope`:
```ts
/** Attribute ids used by attribute requirements (keys 40 / 41), as the web app names them. */
export const ATTRIBUTE_NAMES: Record<number, string> = { 1: 'OVR' };
```
(extend with every entry of the web app's map found in Step 1).

In `parseRequirements`, replace `req.combined = req.keys.size > 1;` with:
```ts
    // an attribute requirement carries two keys (which attribute + its value) but is one per-card rule
    req.combined = req.keys.size > 1 && !req.keys.has(Key.ATTRIBUTE_ID);
```
In `describe`, right after the `if (r.combined) { … }` block:
```ts
  if (r.keys.has(Key.ATTRIBUTE_ID)) {
    const id = r.keys.get(Key.ATTRIBUTE_ID)![0];
    const word = ['Min', 'Max', 'Exactly'][r.scope];
    return `${ATTRIBUTE_NAMES[id] ?? `Attribute ${id}`} ${word}: ${r.keys.get(Key.ATTRIBUTE_VALUE)?.[0] ?? '?'}`;
  }
```

- [ ] **Step 5: Run to verify it passes** — same command → PASS; `npm test` and `npm run typecheck` → green.

- [ ] **Step 6: Commit** — `git add server/sbc.ts server/sbc.test.ts && git commit -m "feat(sbc): attribute requirement keys 40/41"`

---

### Task 2: Points rules + data fields

**Files:**
- Create: `server/points.ts`, `server/points.test.ts`
- Modify: `server/ea.ts` (`ClubItem`, `Challenge`), `server/squad.ts` (`Player`, `toPlayer`), `server/shared-sbc.ts`, `server/shared-sbc.test.ts`

**Interfaces:**
- Consumes: `Key.ATTRIBUTE_ID`, `Key.ATTRIBUTE_VALUE` (Task 1); `matchesKey`, `Player` from `server/squad.ts`.
- Produces:
  - `Player.points: number` (gradingScore, 0 = unusable in points SBCs); `ClubItem.gradingScore?: number`; `Challenge.scoreRequirement?: number`, `Challenge.submittedScore?: number`.
  - `isPointsChallenge(c: { scoreRequirement?: number }): boolean`
  - `pointsTarget(c: { scoreRequirement?: number; submittedScore?: number }): number`
  - `cardRule(r: Requirement): ((p: Player) => boolean) | null`
  - `interface PointsCheck { total: number; overshoot: number; results: { text: string; met: boolean; actual: number | string; unchecked?: boolean }[]; allMet: boolean }`
  - `checkPoints(cards: Player[], target: number, reqs: Requirement[]): PointsCheck`

- [ ] **Step 1: Data fields**

`server/ea.ts` — in `ClubItem` add `gradingScore?: number; // what the card is worth in a points SBC`; in `Challenge` add:
```ts
  /** points SBCs: points needed in total, and already handed in by this account */
  scoreRequirement?: number;
  submittedScore?: number;
```
`server/squad.ts` — in `Player` after `rating: number;` add `points: number; // gradingScore: worth in a points SBC (0 = not usable there)`; in `toPlayer` after `rating: i.rating,` add `points: i.gradingScore ?? 0,`. Fix any object literal typed `Player` that `npm run typecheck` flags (test fixtures: add `points: 0`).

- [ ] **Step 2: Write the failing tests** — `server/points.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EligibilityReq } from './ea.js';
import type { Meta } from './meta.js';
import { parseRequirements } from './sbc.js';
import type { Player } from './squad.js';
import { cardRule, checkPoints, isPointsChallenge, pointsTarget } from './points.js';

const meta = { names: { nation: {}, league: {}, club: {}, rarity: {}, group: {} } } as unknown as Meta;
const req = (list: [number, number][]) =>
  parseRequirements(list.map(([k, v]) => ({ type: 'X', eligibilitySlot: 1, eligibilityKey: k, eligibilityValue: v }) as EligibilityReq), meta);
const OVR_MIN_45 = req([[41, 1], [13, 0], [40, 45]]);
let nextId = 1;
const card = (rating: number, points: number, extra: Partial<Player> = {}) =>
  ({ id: nextId++, assetId: nextId, rating, points, tier: rating <= 64 ? 1 : rating <= 74 ? 2 : 3, untradeable: false, ...extra }) as Player;

test('target is what is still missing', () => {
  assert.equal(isPointsChallenge({ scoreRequirement: 4000 }), true);
  assert.equal(isPointsChallenge({}), false);
  assert.equal(pointsTarget({ scoreRequirement: 4000, submittedScore: 1200 }), 2800);
  assert.equal(pointsTarget({ scoreRequirement: 4000 }), 4000);
  assert.equal(pointsTarget({ scoreRequirement: 4000, submittedScore: 4100 }), 0);
});

test('attribute rule: OVR Min 45', () => {
  const rule = cardRule(OVR_MIN_45[0])!;
  assert.equal(rule(card(45, 20)), true);
  assert.equal(rule(card(44, 20)), false);
});

test('unknown requirements cannot be checked', () => {
  assert.equal(cardRule(req([[41, 999], [13, 0], [40, 45]])[0]), null); // unknown attribute
  assert.equal(cardRule(req([[77, 1]])[0]), null); // unknown key
  assert.equal(cardRule(req([[2, 3], [18, 1]])[0]), null); // count requirement: not a per-card rule
});

test('exact total meets', () => {
  const r = checkPoints([card(52, 20), card(60, 20), card(85, 2100), card(86, 1860)], 4000, OVR_MIN_45);
  assert.deepEqual([r.total, r.overshoot, r.allMet], [4000, 0, true]);
});

test('over is fine, under is not', () => {
  assert.deepEqual(
    (({ total, overshoot, allMet }) => [total, overshoot, allMet])(checkPoints([card(86, 4100)], 4000, OVR_MIN_45)),
    [4100, 100, true],
  );
  assert.equal(checkPoints([card(85, 2100)], 4000, OVR_MIN_45).allMet, false);
});

test('a card that breaks a requirement, a duplicate, a zero-point card or an unknown requirement blocks found', () => {
  assert.equal(checkPoints([card(40, 4000)], 4000, OVR_MIN_45).allMet, false);
  const c = card(86, 2000);
  assert.equal(checkPoints([c, c], 4000, OVR_MIN_45).allMet, false);
  assert.equal(checkPoints([card(86, 4100), card(50, 0)], 4000, OVR_MIN_45).allMet, false);
  const unknown = checkPoints([card(86, 4100)], 4000, req([[77, 1]]));
  assert.equal(unknown.allMet, false);
  assert.equal(unknown.results[0].unchecked, true);
});

test('nothing to reach is never found', () => {
  assert.equal(checkPoints([], 0, OVR_MIN_45).allMet, false);
});
```

- [ ] **Step 3: Run to verify it fails** — `node --import tsx --test server/points.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement** — `server/points.ts`

```ts
// Points SBCs ("Player SBCs"): EA asks for a points total instead of a squad. A card is worth its
// gradingScore as EA sends it; requirements apply to every card on its own.
import { Key, Scope, ATTRIBUTE_NAMES, type Requirement } from './sbc.js';
import { matchesKey, type Player } from './squad.js';

export const isPointsChallenge = (c: { scoreRequirement?: number }) => (c.scoreRequirement ?? 0) > 0;

/** Points still missing: a challenge can be handed in over several submissions. */
export const pointsTarget = (c: { scoreRequirement?: number; submittedScore?: number }) =>
  Math.max(0, (c.scoreRequirement ?? 0) - (c.submittedScore ?? 0));

// attribute id (key 41) -> the card's value for it; ids missing here cannot be checked
const ATTRIBUTE_VALUE: Record<number, (p: Player) => number> = { 1: (p) => p.rating };
// single-key requirements every card must meet (count -1): matchesKey knows them
const EVERY_CARD = new Set<number>([
  Key.NATION_ID, Key.LEAGUE_ID, Key.CLUB_ID, Key.PLAYER_RARITY, Key.PLAYER_RARITY_GROUP, Key.PLAYER_LEVEL,
  Key.PLAYER_MIN_OVR, Key.PLAYER_MAX_OVR, Key.PLAYER_EXACT_OVR, Key.PLAYER_TRADABILITY,
]);

/** A requirement as a test every card must pass, or null when we cannot check it. */
export function cardRule(r: Requirement): ((p: Player) => boolean) | null {
  const cmp = (a: number, v: number) => (r.scope === Scope.GREATER ? a >= v : r.scope === Scope.LOWER ? a <= v : a === v);
  const attr = r.keys.get(Key.ATTRIBUTE_ID)?.[0];
  if (attr !== undefined) {
    const read = ATTRIBUTE_VALUE[attr];
    const v = r.keys.get(Key.ATTRIBUTE_VALUE)?.[0];
    return read && ATTRIBUTE_NAMES[attr] && v !== undefined && r.keys.size === 2 ? (p) => cmp(read(p), v) : null;
  }
  if (r.combined || r.count !== -1 || r.keys.size !== 1) return null;
  const [key, vals] = [...r.keys][0];
  if (key === Key.PLAYER_QUALITY) return (p) => cmp(p.tier, vals[0]);
  return EVERY_CARD.has(key) ? (p) => matchesKey(p, key, vals) : null;
}

export interface PointsCheck {
  total: number;
  overshoot: number;
  results: { text: string; met: boolean; actual: number | string; unchecked?: boolean }[];
  allMet: boolean;
}

/** The exact re-check of a selection: `found` comes from here, never from the solver. */
export function checkPoints(cards: Player[], target: number, reqs: Requirement[]): PointsCheck {
  const total = cards.reduce((s, p) => s + p.points, 0);
  const results = reqs.map((r) => {
    const rule = cardRule(r);
    if (!rule) return { text: r.text, met: false, actual: '?', unchecked: true };
    const off = cards.filter((p) => !rule(p)).length;
    return { text: r.text, met: off === 0, actual: cards.length - off };
  });
  const unique = new Set(cards.map((p) => p.id)).size === cards.length;
  const allMet = target > 0 && total >= target && unique && cards.every((p) => p.points > 0) && results.every((x) => x.met);
  return { total, overshoot: Math.max(0, total - target), results, allMet };
}
```

- [ ] **Step 5: Seeded challenges reset `submittedScore`** — in `server/shared-sbc.test.ts` add:

```ts
test('a seeded points challenge starts with nothing submitted', () => {
  const out = seedChallenges(set, [ch(10, 1, { scoreRequirement: 4000, submittedScore: 1200 }), ch(11, 2)]);
  assert.equal(out?.[0].submittedScore, 0);
  assert.equal('submittedScore' in out![1], false); // squad challenges stay as EA sent them
});
```
In `server/shared-sbc.ts` change the `.map(...)` line to:
```ts
    .map((c) => ({ ...c, status: 'NOT_STARTED', timesCompleted: 0, ...(c.submittedScore !== undefined && { submittedScore: 0 }) }));
```
and the file's first comment line to mention `submittedScore` as per-account too.

- [ ] **Step 6: Run** — `node --import tsx --test server/points.test.ts server/shared-sbc.test.ts` → PASS; `npm test`, `npm run typecheck` → green.

- [ ] **Step 7: Commit** — `git add server/points.ts server/points.test.ts server/ea.ts server/squad.ts server/shared-sbc.ts server/shared-sbc.test.ts && git commit -m "feat(points): points target, card rules and exact re-check"` (plus any fixture file typecheck made you touch).

---

### Task 3: Points solver (CP-SAT two stages)

**Files:**
- Modify: `solver/cpsat.py` (new `solve_points`, dispatch in `__main__`)
- Modify: `server/solver.ts` (`CpResult.picked`, `pointsPool`, `solvePoints`, export `NO_FILTERS`, `Reason.code` gains `'points'`)

**Interfaces:**
- Consumes: `cardRule`, `checkPoints`, `PointsCheck` (Task 2); existing `eligiblePool`, `playerCost`, `runCpSat`.
- Produces:
  - `pointsPool(players: Player[], reqs: Requirement[], options: SolveOptions, squad: ActiveSquad | null): Player[]`
  - `interface PointsSolution { cards: Player[]; check: PointsCheck; cost: number; status: string }`
  - `solvePoints(pool: Player[], reqs: Requirement[], target: number, timeLimit?: number): Promise<PointsSolution | null>` — `cards` sorted like the web app (rating ascending, then id).
  - `export const NO_FILTERS: SolveOptions`
  - Python problem `{ "mode": "points", "target": int, "items": [{ "points": int, "cost": float, "group": int }], "timeLimit": number, "workers": int }` → `{ "status", "picked": [item indexes], "total": int, "cost": float, "wallTime" }` or `{ "status" }` when infeasible.

- [ ] **Step 1: Python model** — in `solver/cpsat.py`, above `if __name__ == "__main__":`

```python
def solve_points(p):
    """Points SBC: pick cards with points >= target, least overshoot first, then the lowest cost.

    Stage 1 minimises the total (so the overshoot); stage 2 keeps that total and minimises the cost.
    Items sharing a `group` (same player) are used at most once.
    """
    items = p["items"]
    target = int(p["target"])
    m = cp_model.CpModel()
    x = [m.NewBoolVar(f"x{i}") for i in range(len(items))]
    total = sum(int(it["points"]) * x[i] for i, it in enumerate(items))
    m.Add(total >= target)
    groups = {}
    for i, it in enumerate(items):
        groups.setdefault(it["group"], []).append(x[i])
    for g in groups.values():
        if len(g) > 1:
            m.Add(sum(g) <= 1)

    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = float(p.get("timeLimit", 10)) / 2
    solver.parameters.num_workers = int(p.get("workers") or min(16, os.cpu_count() or 8))
    ok = (cp_model.OPTIMAL, cp_model.FEASIBLE)

    m.Minimize(total)
    status = solver.Solve(m)
    if status not in ok:
        return {"status": solver.StatusName(status)}
    best = int(round(solver.ObjectiveValue()))
    picked = [i for i in range(len(items)) if solver.Value(x[i])]
    wall = solver.WallTime()

    m.Add(total == best)
    m.Minimize(sum(int(round(it["cost"] * 100)) * x[i] for i, it in enumerate(items)))
    for i in range(len(items)):
        m.AddHint(x[i], 1 if i in picked else 0)
    status2 = solver.Solve(m)
    if status2 in ok:
        picked = [i for i in range(len(items)) if solver.Value(x[i])]
        status = status2
    return {
        "status": solver.StatusName(status),
        "picked": picked,
        "total": best,
        "cost": round(sum(items[i]["cost"] for i in picked), 2),
        "wallTime": wall + solver.WallTime(),
    }
```
and replace the `__main__` body's last line with:
```python
    json.dump(solve_points(problem) if problem.get("mode") == "points" else solve(problem), sys.stdout)
```

- [ ] **Step 2: Check the model by hand**

```bash
echo '{"mode":"points","target":110,"items":[{"points":20,"cost":1,"group":1},{"points":20,"cost":1,"group":2},{"points":35,"cost":2,"group":3},{"points":35,"cost":2,"group":4},{"points":90,"cost":3,"group":5}],"timeLimit":5}' | solver/.venv/bin/python solver/cpsat.py
```
Expected: `"total": 110`, `"cost": 4.0`, `picked` = one of the 20s plus the 90 (`[0, 4]` or `[1, 4]`). (Other exact 110 set: 35+35+20+20 costs 6.)
```bash
echo '{"mode":"points","target":100,"items":[{"points":20,"cost":1,"group":1},{"points":20,"cost":1,"group":2},{"points":35,"cost":2,"group":3},{"points":35,"cost":2,"group":4},{"points":90,"cost":3,"group":5}],"timeLimit":5}' | solver/.venv/bin/python solver/cpsat.py
```
Expected: `"total": 110` (100 and 105 are impossible), `"cost": 4.0`.
```bash
echo '{"mode":"points","target":100,"items":[{"points":50,"cost":1,"group":7},{"points":50,"cost":1,"group":7},{"points":60,"cost":1,"group":8}],"timeLimit":5}' | solver/.venv/bin/python solver/cpsat.py
```
Expected: `"total": 110`, one of items 0/1 plus item 2 — never both 50s (same player).
```bash
echo '{"mode":"points","target":500,"items":[{"points":20,"cost":1,"group":1}],"timeLimit":5}' | solver/.venv/bin/python solver/cpsat.py
```
Expected: `{"status": "INFEASIBLE"}`. Paste all four outputs in the report.

- [ ] **Step 3: Node side** — in `server/solver.ts`:

Imports: add `import { cardRule, checkPoints, type PointsCheck } from './points.js';`.
`interface CpResult` gains `picked?: number[]; // points mode: pool indexes`.
Change `const NO_FILTERS: SolveOptions = {` to `export const NO_FILTERS: SolveOptions = {`.
`Reason.code` becomes `'pool' | 'count' | 'sameGroup' | 'distinct' | 'rating' | 'combo' | 'points'`.
Append at the end of the file:

```ts
/** Cards a points SBC may use: the usual pool, the per-card requirements we can check, worth > 0 points. */
export function pointsPool(players: Player[], reqs: Requirement[], options: SolveOptions, squad: ActiveSquad | null): Player[] {
  const rules = reqs.map(cardRule).filter((r): r is (p: Player) => boolean => r !== null);
  return eligiblePool(players, reqs, options, squad).filter((p) => p.points > 0 && rules.every((rule) => rule(p)));
}

export interface PointsSolution {
  cards: Player[]; // sorted like the web app's Work Area: rating ascending
  check: PointsCheck;
  cost: number;
  status: string;
}

/** Points SBC: the least overshoot over `target`, then the cheapest cards (solver/cpsat.py, mode "points"). */
export async function solvePoints(pool: Player[], reqs: Requirement[], target: number, timeLimit = 10): Promise<PointsSolution | null> {
  const problem = {
    mode: 'points',
    target,
    items: pool.map((p) => ({ points: p.points, cost: playerCost(p), group: p.assetId })),
    timeLimit,
    workers: 8,
  };
  if (process.env.SOLVER_DUMP) (await import('node:fs')).writeFileSync(process.env.SOLVER_DUMP, JSON.stringify(problem));
  const res = await runCpSat(problem);
  if (!res.picked) return null;
  const cards = res.picked.map((i) => pool[i]).sort((a, b) => a.rating - b.rating || a.id - b.id);
  return { cards, check: checkPoints(cards, target, reqs), cost: res.cost ?? 0, status: res.status };
}
```

- [ ] **Step 4: Real-data check (scratch script, not committed)** — `<scratchpad>/points-check.ts`, run with `node --import tsx <scratchpad>/points-check.ts`: read the first `data/accounts/*/club.json` (array or `{data}`), build meta with `loadMeta` if cheap, else map items with a minimal `toPlayer`-like mapping (`id, assetId, rating, points: gradingScore ?? 0, tier, untradeable, rareflag, isLoan: !!loansInfo, state: itemState, nation, league: leagueId, club: teamid, groups: []`), `reqs = parseRequirements(<the 3 elgReq rows above>, meta)`, call `solvePoints(pointsPool(players, reqs, NO_FILTERS, null), reqs, 4000)`. Print only: status, `check.total`, `check.overshoot`, `check.allMet`, number of cards, and the multiset of their points (e.g. `{20: 4, 2100: 1, …}`) — no ids, no names. Expected: `total` 4000 (or the least possible above it), `allMet` true. Paste the output.

- [ ] **Step 5: Verify** — `npm test`, `npm run typecheck` → green.

- [ ] **Step 6: Commit** — `git add solver/cpsat.py server/solver.ts && git commit -m "feat(solver): two-stage points model"`

---

### Task 4: API — points branch in solve, targets in sets, docs

**Files:**
- Modify: `server/index.ts` (imports; `/api/sets`; `/api/sets/:id/challenges`; `/api/solve`)
- Modify: `docs/api.md`, `docs/solver.md`, `docs/architecture.md`

**Interfaces:**
- Consumes: `isPointsChallenge`, `pointsTarget` (Task 2); `pointsPool`, `solvePoints`, `NO_FILTERS` (Task 3).
- Produces (site relies on these exact shapes):
  - `GET /api/sets` → each set may carry `pointsTarget?: number` (points still missing in its points challenge, from the cached challenges).
  - `GET /api/sets/:id/challenges` → each challenge also carries `fetchedAt: number | null` (plus EA's `scoreRequirement` / `submittedScore`, already passed through).
  - `POST /api/solve` on a points challenge →
    ```ts
    {
      found: boolean; status?: string; ms: number; cost?: number;
      eval: { rating: 0; chemistry: 0; results: { text; met; actual; unchecked? }[]; allMet: boolean };
      slots: [];
      points: { target: number; required: number; submitted: number; total: number; overshoot: number; cards: Player[] };
      reasons?: [{ code: 'points'; have: number; need: number; hidden: number }];
      usedStorage: boolean; clubOnly: boolean; quota;
    }
    ```
  - 409 `{ code: 'pointsDone' }` when nothing is missing.

- [ ] **Step 1: Imports** — `server/index.ts`: extend the solver import to `import { solve, diagnose, pointsPool, solvePoints, NO_FILTERS, type SolveOptions, type ActiveSquad } from './solver.js';`, add `import { isPointsChallenge, pointsTarget } from './points.js';`, and make sure `Challenge` is imported as a type from `./ea.js` next to `ClubItem`.

- [ ] **Step 2: `/api/sets`** — replace the handler with:

```ts
app.get('/api/sets', async (req) => {
  const acc = await siteAccount(req);
  const sets = await readCache<SetsData>(acc.key('sets'));
  // a points challenge shows its target on the set tile (from the cached challenges, no EA call)
  const categories = await Promise.all(
    (sets?.data.categories ?? []).map(async (cat) => ({
      ...cat,
      sets: await Promise.all(
        cat.sets.map(async (s) => {
          const ch = (await readCache<Challenge[]>(acc.key(`challenges/${s.setId}`)))?.data.find(isPointsChallenge);
          return ch ? { ...s, pointsTarget: pointsTarget(ch) } : s;
        }),
      ),
    })),
  );
  return { fetchedAt: sets?.fetchedAt ?? null, categories };
});
```

- [ ] **Step 3: `/api/sets/:id/challenges`** — in the mapped object add `fetchedAt: ch?.fetchedAt ?? null,` after `...c,` (the site shows "as of" for points).

- [ ] **Step 4: `/api/solve` points branch** — points challenges have no formation, so the branch must run before the layout / formation code: insert it right after `const squad = (await readCache<ActiveSquad>(acc.key('squad')))?.data ?? null;` (and before `const layout = …`):

```ts
    if (isPointsChallenge(ch)) {
      const target = pointsTarget(ch);
      if (target === 0) return reply.code(409).send({ error: 'This challenge already has all its points.', code: 'pointsDone', params: {} });
      const pool = pointsPool(players, reqs, options, squad);
      const have = pool.reduce((s, p) => s + p.points, 0);
      const sol = have >= target ? await solvePoints(pool, reqs, target, req.body.deep ? 30 : 10) : null;
      const found = !!sol?.check.allMet;
      // only a found selection costs a token, like squads
      const quota = plan.quota && found ? planInfo(await countSolve(userId), false, Date.now()).quota : plan.quota;
      logEvent({ type: 'solve', userId, personaId: acc.id, data: { setId, challengeId, found, points: true } });
      const everyone = pointsPool(players, reqs, NO_FILTERS, null).reduce((s, p) => s + p.points, 0);
      return {
        found,
        status: sol?.status,
        ms: Date.now() - t0,
        cost: sol?.cost,
        eval: {
          rating: 0,
          chemistry: 0,
          results: sol?.check.results ?? reqs.map((r) => ({ text: r.text, met: false, actual: 0 })),
          allMet: found,
        },
        slots: [],
        points: {
          target,
          required: ch.scoreRequirement ?? 0,
          submitted: ch.submittedScore ?? 0,
          total: sol?.check.total ?? 0,
          overshoot: sol?.check.overshoot ?? 0,
          cards: sol?.cards ?? [],
        },
        reasons: sol ? undefined : [{ code: 'points' as const, have, need: target, hidden: Math.max(0, everyone - have) }],
        usedStorage: !!sol?.cards.some((p) => p.inStorage),
        clubOnly,
        quota,
      };
    }
```
(If `logEvent`'s `data` type rejects `points: true`, drop that field.)

- [ ] **Step 5: Docs**
  - `docs/api.md`: under `GET /api/sets` document `pointsTarget`; under the challenges endpoint document `scoreRequirement`, `submittedScore`, `fetchedAt`; under `POST /api/solve` add a "Points challenges" paragraph with the response shape above, the `pointsDone` 409 and the `points` reason.
  - `docs/solver.md`: new section "Points challenges": pool (`pointsPool`: usual pool + per-card rules + `points > 0`), one card per `assetId`, stage 1 min total ≥ target, stage 2 same total min cost, re-check by `checkPoints`.
  - `docs/architecture.md`: points challenges (detection by `scoreRequirement`, `gradingScore` already in the club cache, no new EA call); `submittedScore` freshness: updates when the web app loads the set's challenges; seeded copies reset it.

- [ ] **Step 6: Verify** — `npm run typecheck`, `npm test` → green. With `npm run dev` running (don't start/stop it; it reloads on save), and only if a cached points challenge exists in `data/accounts/*/challenges/`, check with the browser in Task 6 instead; no curl with keys.

- [ ] **Step 7: Commit** — `git add server/index.ts docs/api.md docs/solver.md docs/architecture.md && git commit -m "feat(api): solve points challenges"`

---

### Task 5: Site — types, shared pitch parts, PointsArea component, CSS

**Files:**
- Modify: `web/src/api.ts` (types)
- Modify: `web/src/components/Pitch.tsx` (export `SolveLoader`, `PitchCorners`; use them)
- Create: `web/src/components/PointsArea.tsx`
- Modify: `web/src/styles.css` (points classes)
- Modify: `web/src/locales/en.ts`, `web/src/locales/ro.ts`

**Interfaces:**
- Consumes: the API shapes of Task 4.
- Produces:
  - `api.ts`: `Player.points?: number`; `Challenge.scoreRequirement?: number; submittedScore?: number; fetchedAt?: number | null`; `SbcSet.pointsTarget?: number`; `SolveResult.points?: PointsResult`; eval results items gain `unchecked?: boolean`; `Reason.code` gains `'points'`; `export interface PointsResult { target: number; required: number; submitted: number; total: number; overshoot: number; cards: Player[] }`.
  - `Pitch.tsx`: `export function SolveLoader()`; `export function PitchCorners(props: { lock: { title: string } | null; solving: boolean; outOfSolves: boolean; hasResult: boolean; localOptions: boolean; onSolve: (deep?: boolean) => void; onToggleOptions: () => void; cheaper: boolean })`.
  - `PointsArea` props: `{ meta: Meta; challenge: Challenge; result: SolveResult | null; solving: boolean; onSolve: (deep?: boolean) => void; onToggleOptions: () => void; lock: { title: string; text: string } | null; localOptions: boolean; selectedId: number | null; onPlayerClick: (id: number) => void; outOfSolves: boolean; marked: Set<number> }`.

- [ ] **Step 1: Types** — apply the `api.ts` changes listed above (keep the field comments short, like the file's style).

- [ ] **Step 2: Shared pitch parts** — in `Pitch.tsx`, move the solving overlay and the two corners into exported components and use them in `Pitch` (behaviour unchanged):

```tsx
export function SolveLoader() {
  const { t } = useI18n();
  return (
    <div className="pitch-loading" role="status">
      <div className="deck" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <p>{t('pitch.searching')}</p>
    </div>
  );
}

export function PitchCorners({ lock, solving, outOfSolves, hasResult, localOptions, onSolve, onToggleOptions, cheaper }: {
  lock: { title: string } | null; solving: boolean; outOfSolves: boolean; hasResult: boolean; localOptions: boolean;
  onSolve: (deep?: boolean) => void; onToggleOptions: () => void; cheaper: boolean;
}) {
  const { t } = useI18n();
  return (
    <>
      <button className="corner corner-left" type="button" onClick={onToggleOptions}>
        <Wrench weight="fill" aria-hidden="true" /> {t('pitch.options')}
        {localOptions && <em className="badge">{t('pitch.local')}</em>}
      </button>
      <div className="corner corner-right">
        {lock ? (
          <span className="solve done">
            <SealCheck weight="fill" aria-hidden="true" /> {lock.title}
          </span>
        ) : (
          <button className="solve" type="button" disabled={solving || outOfSolves} onClick={() => onSolve(false)}>
            <Lightning weight="fill" aria-hidden="true" /> {hasResult ? t('pitch.resolve') : t('pitch.solve')}
          </button>
        )}
        {cheaper && hasResult && !lock && (
          <button className="solve-deep" type="button" disabled={solving || outOfSolves} onClick={() => onSolve(true)} title={t('pitch.cheaperTitle')}>
            {t('pitch.cheaper')}
          </button>
        )}
      </div>
    </>
  );
}
```
In `Pitch`, replace the `{solving && (<div className="pitch-loading" …>…</div>)}` block with `{solving && <SolveLoader />}` and the two corner elements with `<PitchCorners lock={lock} solving={solving} outOfSolves={outOfSolves} hasResult={!!result} localOptions={localOptions} onSolve={onSolve} onToggleOptions={onToggleOptions} cheaper />`. Build and confirm the pitch is unchanged.

- [ ] **Step 3: Locales** — `en.ts` (next to `pitch.*`):

```ts
  'points.label': 'Points',
  'points.reached': 'Target reached',
  'points.notReached': 'Target not reached',
  'points.overshoot': 'Overshoot +{n}',
  'points.cards_one': '{count} card',
  'points.cards_other': '{count} cards',
  'points.empty': 'Solve to pick cards worth {n} points from your club.',
  'points.summary': '{points} points · overshoot {over} · same order as in the web app',
  'points.submitted': 'Already submitted',
  'points.left': 'Left to reach',
  'points.target': 'Points: {n}',
  'points.asOf': 'as of {ago}',
  'points.submitHint': 'Add these cards in the web app’s Work Area and submit there. FC Solver never submits for you.',
  'points.notChecked': 'not checked',
  'points.tile': '{n} points',
  'reason.points': 'Your club has {have} of the {need} points needed.',
  'err.pointsDone': 'This challenge already has all its points.',
```
`ro.ts`:
```ts
  'points.label': 'Puncte',
  'points.reached': 'Țintă atinsă',
  'points.notReached': 'Țintă neatinsă',
  'points.overshoot': 'Depășire +{n}',
  'points.cards_one': '{count} card',
  'points.cards_few': '{count} carduri',
  'points.cards_other': '{count} de carduri',
  'points.empty': 'Apasă Solve ca să alegem din club carduri de {n} puncte.',
  'points.summary': '{points} puncte · depășire {over} · aceeași ordine ca în web app',
  'points.submitted': 'Deja predat',
  'points.left': 'Rămas de atins',
  'points.target': 'Puncte: {n}',
  'points.asOf': 'date de {ago}',
  'points.submitHint': 'Adaugă aceste carduri în Work Area din web app și trimite de acolo. FC Solver nu trimite nimic în locul tău.',
  'points.notChecked': 'neverificată',
  'points.tile': '{n} puncte',
  'reason.points': 'Clubul tău are {have} din cele {need} puncte necesare.',
  'err.pointsDone': 'Challenge-ul are deja toate punctele.',
```
In `web/src/messages.ts` `reasonText`, add:
```ts
    case 'points':
      return t('reason.points', { have: r.have ?? 0, need: r.need ?? 0 }) + hidden;
```
(`reason.hidden` counts players; if its wording doesn't fit points, add `reason.pointsHidden` = "{count} more points are hidden by your settings." / "Încă {count} puncte sunt ascunse de setările tale." with `_one`/`_few`/`_other` in ro, and use it here instead.)

- [ ] **Step 4: `PointsArea.tsx`**

```tsx
// A points SBC ("Player SBC"): EA asks for a points total, not a squad. Shows the chosen cards in the
// pitch frame like the web app's Work Area, sorted the same way so they are easy to add there.
import { CheckCircle, Diamond, Prohibit, SealCheck } from '@phosphor-icons/react';
import type { Challenge, Meta, SolveResult } from '../api';
import { useI18n } from '../i18n';
import { Card } from './Card';
import { PitchCorners, SolveLoader } from './Pitch';

interface Props {
  meta: Meta;
  challenge: Challenge;
  result: SolveResult | null;
  solving: boolean;
  onSolve: (deep?: boolean) => void;
  onToggleOptions: () => void;
  lock: { title: string; text: string } | null;
  localOptions: boolean;
  selectedId: number | null;
  onPlayerClick: (playerId: number) => void;
  outOfSolves: boolean;
  /** players marked to keep out (⊘ badge) */
  marked: Set<number>;
}

export function PointsArea({ meta, challenge, result, solving, onSolve, onToggleOptions, lock, localOptions, selectedId, onPlayerClick, outOfSolves, marked }: Props) {
  const { t, lang } = useI18n();
  const n = (v: number) => v.toLocaleString(lang);
  const pts = result?.points;
  const target = pts?.target ?? Math.max(0, (challenge.scoreRequirement ?? 0) - (challenge.submittedScore ?? 0));
  const cards = solving ? [] : (pts?.cards ?? []);
  const total = solving ? 0 : (pts?.total ?? 0);
  const reached = !solving && !!result?.found;

  return (
    <div className="pitch-wrap points-wrap">
      <div className="pitch-header points-header">
        <div className="points-top">
          <span className="hdr-label">{t('points.label')}</span>
          <span className="points-num">
            <b>{n(total)}</b> / {n(target)} <Diamond weight="bold" aria-hidden="true" />
          </span>
        </div>
        <div className="points-bar" role="progressbar" aria-label={t('points.label')} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(total, target)}>
          <span className={reached ? 'met' : ''} style={{ width: `${target ? Math.min(100, (total / target) * 100) : 0}%` }} />
        </div>
        {pts && !solving && (
          <p className="points-status">
            <span className={reached ? 'met' : 'unmet'}>
              {reached && <CheckCircle weight="fill" aria-hidden="true" />} {reached ? t('points.reached') : t('points.notReached')}
            </span>
            <span>{t('points.overshoot', { n: n(pts.overshoot) })}</span>
            <span>{t('points.cards', { count: cards.length })}</span>
          </p>
        )}
      </div>

      <div className="points-area">
        {cards.length === 0 && !solving && !lock && <p className="points-empty">{t('points.empty', { n: n(target) })}</p>}
        <div className="points-grid">
          {cards.map((p, i) => (
            <div key={p.id} className="points-slot" style={{ ['--i' as string]: i }}>
              {marked.has(p.id) && (
                <span className="slot-marked" title={t('pitch.marked')}>
                  <Prohibit weight="bold" aria-label={t('pitch.marked')} />
                </span>
              )}
              <Card player={p} meta={meta} selected={p.id === selectedId} onClick={() => onPlayerClick(p.id)} />
              <span className="points-value">
                <Diamond weight="fill" aria-hidden="true" /> {n(p.points ?? 0)}
              </span>
            </div>
          ))}
        </div>
        {solving && <SolveLoader />}
        {lock && (
          <div className="pitch-done">
            <SealCheck weight="fill" aria-hidden="true" />
            <strong>{lock.title}</strong>
            <span>{lock.text}</span>
          </div>
        )}
      </div>

      <PitchCorners
        lock={lock} solving={solving} outOfSolves={outOfSolves} hasResult={!!result} localOptions={localOptions}
        onSolve={onSolve} onToggleOptions={onToggleOptions} cheaper={false}
      />
    </div>
  );
}
```
(Check `useI18n()` exposes `lang`; if not, use `document.documentElement.lang`.)

- [ ] **Step 5: CSS** — in `styles.css`, after the `.pitch-loading` / `.deck` rules. Before writing, read the existing `.pitch`, `.pitch-header`, `.slot`, `.slot-foot`, `.corner` and `.pitch-done` rules and the ≤860 / ≤560 media blocks, and reuse their values (pitch gradient, header background, padding for the corners):

```css
/* points SBC: the Work Area replaces the pitch, same frame and corners */
.points-header {
  display: grid;
  gap: 8px;
  padding-inline: 40px;
}

.points-top {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.points-num {
  margin-left: auto;
  font-family: var(--font-display);
  font-size: 18px;
  color: var(--ink-2);
}

.points-num b {
  font-size: 24px;
  color: var(--ink);
}

.points-bar {
  height: 8px;
  border-radius: 999px;
  background: var(--surface-2);
  overflow: hidden;
}

.points-bar span {
  display: block;
  height: 100%;
  background: var(--ink-3);
  transition: width 220ms var(--ease);
}

.points-bar span.met {
  background: var(--go);
}

.points-status {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 14px;
  margin: 0;
  font-size: 13px;
  color: var(--ink-2);
}

.points-status .met {
  color: var(--go);
}

.points-area {
  position: relative;
  min-height: 240px;
  padding: 22px 24px 72px;
  background: linear-gradient(180deg, oklch(0.34 0.07 185), oklch(0.27 0.06 200));
}

.points-grid {
  --card-w: 74px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(calc(var(--card-w) + 12px), 1fr));
  gap: 18px 8px;
  justify-items: center;
}

.points-slot {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 6px;
  animation: slot-in 220ms var(--ease) both;
  animation-delay: calc(var(--i) * 20ms);
}

.points-value {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 15px;
}

.points-value svg {
  color: var(--go);
  width: 11px;
  height: 11px;
}

.points-empty {
  margin: 40px auto;
  max-width: 36ch;
  text-align: center;
  color: var(--ink-2);
}

@media (max-width: 860px) {
  .points-header {
    padding-inline: 24px;
  }

  .points-grid {
    --card-w: 64px;
    gap: 14px 6px;
  }

  .points-area {
    padding: 16px 10px 68px;
  }
}
```
Replace `var(--font-display)`, `var(--ease)`, `slot-in` with the names the file actually uses for the display font, the easing token and the slot fade-rise keyframes (grep `Barlow`, `--ease`, `@keyframes` first); if there is no fade-rise keyframe, drop the two `animation` lines. The `.slot-marked` badge rule already exists; confirm it positions correctly inside `.points-slot` (it uses `--card-w`), otherwise add `.points-slot .slot-marked { right: calc(50% - var(--card-w) / 2 - 4px); }`.

- [ ] **Step 6: Verify** — `npm run typecheck`, `npm run i18n:check`, `npm run build`, `npm test` → green.

- [ ] **Step 7: Commit** — `git add web/src && git commit -m "feat(points): work area component"`

---

### Task 6: Site — wire points into the SBC screen and the set list

**Files:**
- Modify: `web/src/App.tsx` (selection lookup, `goneFromClub`, storage notice, render branch, requirements panel)
- Modify: `web/src/components/SetList.tsx` (tile target)
- Modify: `web/src/styles.css` (`.points-pill`, `.points-facts`)

**Interfaces:**
- Consumes: `PointsArea` (Task 5), `SolveResult.points`, `Challenge.scoreRequirement/submittedScore/fetchedAt`, `SbcSet.pointsTarget`, `useAgo` from `web/src/i18n.tsx`.

- [ ] **Step 1: One list of the shown players** — in `App.tsx`, above `const selectedSlot = …` add:

```ts
  // the players the current result shows: pitch slots, or a points SBC's cards
  const shownPlayers = result?.points ? result.points.cards : (result?.slots.flatMap((s) => (s.player ? [s.player] : [])) ?? []);
```
Replace `const selected = selectedSlot?.player ?? null;` with `const selected = shownPlayers.find((p) => p.id === selectedId) ?? null;` (keep `selectedSlot` for `chem`). Replace the `goneFromClub` expression body with `result && club.length ? shownPlayers.filter((p) => !clubById.has(p.id) && !storageIds.has(p.id)).length : 0`, and in the storage notice use `shownPlayers.filter((p) => p.inStorage).length` instead of the `result.slots…` count. Also change `if (!r.found && r.slots.some((s) => s.player)) setError(t('set.closest'));` in `runSolve` to `if (!r.found && (r.slots.some((s) => s.player) || !!r.points?.cards.length)) setError(t('set.closest'));`.

- [ ] **Step 2: Render branch** — replace `<Pitch … />` with:

```tsx
                    {(challenge.scoreRequirement ?? 0) > 0 ? (
                      <PointsArea
                        meta={meta}
                        challenge={challenge}
                        result={result}
                        solving={solving}
                        onSolve={runSolve}
                        onToggleOptions={() => setShowOptions((v) => !v)}
                        lock={lock}
                        localOptions={!!local}
                        selectedId={selectedId}
                        onPlayerClick={(id) => setSelectedId((cur) => (cur === id ? null : id))}
                        outOfSolves={outOfSolves}
                        marked={marked}
                      />
                    ) : (
                      <Pitch …same props as today… />
                    )}
```
Import `PointsArea`. After the mark bar, when the result has points and is not solving, show the summary instead of the generic hint:
```tsx
                    {result?.points && !solving && (
                      <p className="hint">
                        {t('points.summary', { points: result.points.total.toLocaleString(lang), over: result.points.overshoot.toLocaleString(lang) })}
                      </p>
                    )}
```
and guard the existing `set.hint` paragraph with `!result.points`. (`lang` from `useI18n()`; if `App` does not already have it, take it from there.)

- [ ] **Step 3: Requirements panel** — in the `reqs-panel` list, show "not checked" for unchecked results and, for points challenges, add the points row and the facts below the list:

```tsx
                          const res = result?.eval.results[i];
                          return (
                            <li key={r.slot} className={res ? (res.met ? 'met' : 'unmet') : ''}>
                              <ReqTick met={res?.met} />
                              <span>{r.text}</span>
                              {res?.unchecked && <span className="actual">{t('points.notChecked')}</span>}
                            </li>
                          );
```
After `</ul>`:
```tsx
                      {(challenge.scoreRequirement ?? 0) > 0 && (
                        <>
                          <ul className="reqs">
                            <li className={result?.points ? (result.found ? 'met' : 'unmet') : ''}>
                              <ReqTick met={result?.points ? result.found : undefined} />
                              <span>{t('points.target', { n: (challenge.scoreRequirement ?? 0).toLocaleString(lang) })}</span>
                            </li>
                          </ul>
                          <dl className="points-facts">
                            <dt>{t('points.submitted')}</dt>
                            <dd>{(challenge.submittedScore ?? 0).toLocaleString(lang)}</dd>
                            <dt>{t('points.left')}</dt>
                            <dd>
                              {Math.max(0, (challenge.scoreRequirement ?? 0) - (challenge.submittedScore ?? 0)).toLocaleString(lang)}{' '}
                              <span className="muted">{t('points.asOf', { ago: ago(challenge.fetchedAt ?? null) })}</span>
                            </dd>
                          </dl>
                          <p className="muted">{t('points.submitHint')}</p>
                        </>
                      )}
```
(`const ago = useAgo();` near the other hooks if `App` doesn't have it; import `useAgo` from `./i18n`.)

- [ ] **Step 4: Set tile** — `SetList.tsx`, after `<SetBadge set={s} now={now} />`:

```tsx
                      {s.pointsTarget ? (
                        <span className="points-pill">
                          <Diamond weight="fill" aria-hidden="true" /> {t('points.tile', { n: s.pointsTarget.toLocaleString(lang) })}
                        </span>
                      ) : null}
```
(import `Diamond`; `lang` from `useI18n()`).

- [ ] **Step 5: CSS**

```css
.points-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
}

.points-pill svg {
  color: var(--go);
}

.points-facts {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 6px 12px;
  margin: 10px 0;
  font-size: 13px;
}

.points-facts dt {
  color: var(--ink-2);
}

.points-facts dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}
```

- [ ] **Step 6: Verify** — `npm run typecheck`, `npm run i18n:check`, `npm run build`, `npm test` → green.

- [ ] **Step 7: Browser check** (`npm run dev` is running; don't start/stop it). The points challenge must be in the local cache: if `data/accounts/*/challenges/20.json` is missing, ask the user to open "Intro to Player SBCs" in the web app with the extension pointed at this server (or report that it can only be checked after deploy). At 1280 and 390, EN and RO:
  - set list: the tile shows "◆ 4,000 points";
  - the set: empty Work Area with `0 / 4,000 ◆` and the hint; Solve → loader → cards sorted by rating ascending, `◆ points` under each, header total = target (or least above), "Target reached" + bar green, summary line;
  - requirements panel: "OVR Min: 45" met, "Points: 4,000", Already submitted / Left to reach / as of;
  - tap a card → PlayerPanel; mark 2 → ⊘ badges + mark bar → "Keep out & re-solve" → one solve, neither card in the new list;
  - squad SBCs unchanged (pitch, Cheaper?);
  - 390: 4 columns, no horizontal scroll (`document.documentElement.scrollWidth <= innerWidth`), header numbers over the bar;
  - reduced motion: no fade-rise.

- [ ] **Step 8: Commit** — `git add web/src && git commit -m "feat(points): points SBCs on the SBC screen"`

---

### Task 7: Final verification

- [ ] `npm test`, `npm run typecheck`, `npm run i18n:check`, `npm run build` → paste results.
- [ ] Browser pass at 1280 and 390 over Task 6's list.
- [ ] `git log --oneline dev..HEAD` lists the task commits; hand off with superpowers:finishing-a-development-branch (merge into `dev`, no push without asking).
