# Points SBCs — design

Date: 2026-09-29. Status: approved in chat (sections + mockup), spec for review.
Mockup: https://claude.ai/artifact/Ftru8whZ27zUhWA3hX4tAd (desktop 1280, phone 390).

## Goal

EA FC 27 has "Player SBCs": one-click challenges that ask for a number of points (e.g. "Intro to Player SBCs", 4,000 points, reward Squad Foundations Espinoza) instead of a squad. Each card is worth a fixed number of points; the user adds cards in the web app's Work Area until the target is reached, possibly over several submissions.

FC Solver proposes, from the user's own club, the set of cards that reaches the points still missing **as closely as possible** (ideally exactly), and among equally close sets the **cheapest** one (priority A, chosen in chat). Read-only toward EA as always: the user adds the cards and submits in the web app.

Out of scope: submitting from FC Solver, any new EA API endpoint or job recipe, choosing a smaller custom target (the solver always aims at everything still missing), changing how squad SBCs work.

## What EA sends (observed 2026-09-29)

- Challenge (`GET /sbs/setId/<id>/challenges`, already cached): `type: "ONE_CLICK_CHALLENGE"`, `scoreRequirement: 4000`, `submittedScore: 0` (points already handed in; grows with partial submissions), no formation. `elgReq`: `PLAYER_ATTRIBUTE` key 41 value 1, `SCOPE` key 13 value 0, `ACADEMY_PLAYER_SLOTTING` key 40 value 45; the web app shows one requirement, "OVR Min: 45".
- Points per card: `gradingScore` on each club item. **Already present in the club we sync** (`club.json`), so no new EA call. Observed values: 20 (rating ≤ 64), 35 (65–74), 90, 100, 120, 140, 160, 180 (75–80), 280, 340, 410, 830, 2100, 4100, 5500, 13750 (81–89); special cards are worth more at the same rating (83 rare 513 vs 410).
- The web app's ⊘ next to a card marks an untradeable item.

## 1. Data and detection (server)

- `server/ea.ts`: `Challenge` gains optional `scoreRequirement?: number` and `submittedScore?: number`; `ClubItem` gains optional `gradingScore?: number`. Nothing else is fetched.
- A challenge is a **points challenge** when `scoreRequirement > 0` (not by `type`: EA may reuse `ONE_CLICK_CHALLENGE`). Points still missing: `target = max(0, scoreRequirement − (submittedScore ?? 0))`; `target === 0` means done, no solve.
- A card's points are its `gradingScore` exactly as EA sends it (never computed by us). A card without `gradingScore` (or 0) is not eligible.
- Requirement keys 40 and 41: ported 1:1 from the web app's own code (its public JS bundle, a static file read once while implementing, never at runtime, no session), then added to `Key` in `server/sbc.ts` with their real meaning and requirement text. Until a key is known, a requirement that uses it is shown as **not checked** and the solution is never marked `found` (we never claim an unknown requirement is met).
- `server/shared-sbc.ts` `seedChallenges`: `submittedScore` is per account, so a seeded copy resets it to `0` (next to `status` / `timesCompleted`); unit test added.
- Freshness: a partial submission changes `submittedScore` but not the set's progress counters, so the SBC list sync does not refetch that challenge by itself. It updates when the web app loads the set's challenges (relay, `server/events.ts`), as it already does today. The site shows the target with the challenge's `fetchedAt` ("as of …") so a stale value is visible. Known limit, accepted.

## 2. Solver

- `server/solver.ts`: new `buildPointsProblem(...)` next to the squad builder.
  - Eligible cards: the same pool rules as a squad solve (global + per-set excludes, players locked in other squads, loans, storage / untradeable options), then the challenge's per-card requirements (OVR ≥ 45, …) as filters, then `gradingScore > 0`.
  - Each card: `{ id, points: gradingScore, cost: playerCost(p) }` — the existing cost, so untradeables and duplicates are preferred exactly as in squad solves.
  - Problem: `{ mode: 'points', target, items, constraints }`; `constraints` is empty today and takes future count requirements ("max N rare", "min 3 from league X") in the same shape as the squad model's `count` constraints.
- `solver/cpsat.py`: new branch for `mode == 'points'`:
  1. `x_i ∈ {0,1}` per card; `S = Σ points_i · x_i`; `S ≥ target`; count constraints if any.
  2. Stage 1: minimise `S` → `S*` (minimum overshoot, ideally `S* = target`).
  3. Stage 2: add `S == S*`, minimise `Σ cost_i · x_i`.
  Same time limit as squad solves; status as today.
- `found` comes from a pure re-check, never from the solver: `checkPoints(selection, target, reqs)` in a new `server/points.ts` — total ≥ target, every card meets every per-card requirement, no duplicate ids, no unknown requirement.
- Not enough eligible points in the club: no solve; the site shows a translated message with the numbers ("Your club has X of the Y points needed") via a `msgCode`.
- A points solve counts toward the plan's solve quota like any solve; results go to the same results cache; excludes and the multi-mark flow ("Keep out & re-solve") work unchanged.

## 3. Site (mockup is the reference)

- A points challenge replaces the pitch with a **Work Area** in the same pitch frame (`--surface` border, 14px radius, pitch gradient):
  - Trapezoid header like `.pitch-header`: `X / target ◆` in Barlow Condensed, a progress bar (fills `--go` only when the target is reached), and a line "✓ Target reached · Overshoot +N · N cards". State by text + glyph, never by colour alone.
  - Grid of the existing FUT card component, **sorted like the web app (rating ascending)** so the user can add them in the same order; under each card `◆ points` instead of chemistry pips and position pill (`--pos` not used).
  - Corner buttons: Options (left), Solve / Re-solve (right, `--go`). No "Cheaper?".
  - Before a solve: empty frame with `0 / target ◆`, a short hint, Solve as the primary action.
  - Under the frame: the mark bar (Task 7 behaviour) and a summary line: cards · points · overshoot · "same order as in the web app" (no cost: `playerCost` is an internal score, not coins; the pitch does not show it either).
- Side panel (below the frame under 860px): challenge name, requirements with met / not checked glyphs (OVR Min, Points target), "Already submitted", "Left to reach", a line that the user adds the cards and submits in the web app; the PlayerPanel on card tap as today (copy name, mark / keep out).
- Responsive: `grid-template-columns: repeat(auto-fill, minmax(<card width>, 1fr))` — 7 columns at 1280, 4 at 390; no inner scroll (the page scrolls); header stacks numbers over the bar on phones; no horizontal scroll at 390; touch targets ≥ 44px on phones.
- SBC list: a points challenge's tile shows its target (e.g. "◆ 4,000").
- Motion: cards fade-rise on solve like the pitch; `prefers-reduced-motion` respected.
- i18n: every string through `t()`, keys `points.*` in `en.ts` + `ro.ts` (Romanian plurals `_one` / `_few` / `_other` for card counts); `npm run i18n:check`.

## Docs

`docs/api.md` (`/api/solve` points result shape, challenge fields), `docs/solver.md` (points model, two stages), `docs/architecture.md` (points challenges, `submittedScore` freshness).

## Testing

- `npm test` (pure logic): `checkPoints` (exact, over, under, bad card, duplicate, unknown requirement); points target (`scoreRequirement − submittedScore`, done at 0); `seedChallenges` resets `submittedScore`; the per-card filter for the new keys once ported.
- Solver by hand (`SOLVER_DUMP`): a points problem from the real cached club reaches exactly 4000 when possible; stage 2 is not more expensive than any other exact set found by a brute-force check on a small sample.
- `npm run typecheck`, `npm run build`, `npm run i18n:check`.
- Browser at 1280 and 390, EN + RO: empty state, solve, mark + keep out + re-solve, not-enough-points message, no horizontal scroll.
