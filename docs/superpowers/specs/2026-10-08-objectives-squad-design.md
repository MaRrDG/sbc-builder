# Objectives squad: the best playable squad for the objectives you pick

Date: 2026-10-08. Status: approved in chat, awaiting spec review.

## Goal

EA FC objectives often carry a squad condition: "Score 6 goals using a player from France", "Win 4 matches while having min. 1 Dutch player in your starting 11", "Assist 5 goals using a CAM (Preferred position only)". The user ticks the objectives they are doing now; FC Solver recommends the **strongest playable squad from their own club** (rating + chemistry) that covers all of them, with the scorer / assister in a slot where they actually score or assist.

Premium only (like Gallery). Read-only toward EA, as everything else.

Success: for the examples below the parser reads the right condition, the solver returns a valid in-position squad that `squad.ts` confirms, and an impossible pick says which condition is missing.

## 1. Data

- Source: `GET /scmp/objective/categories/all` (utas), loaded by the web app when the user opens Objectives. No new sync job and no extra EA call: the extension relays the response.
- Extension change (0.9.0): add `scmp/objective/categories/all` to `WATCH` in `extension/hook.js`; the server adds the same path to `WATCHED_PATH` in `server/events.ts`. Bump `extension/manifest.json` + `extension/release.json`. Older extensions never send it; the screen then says to update the extension.
- `server/events.ts` stores the response per account under `objectives` (with `fetchedAt`), like `/sbs/hub/v2`.
- Kept: groups with `startTime ≤ now < endTime` (`endTime: 0` = no end); objectives whose `state` is not `REDEEMED`. Per objective: id, name, description, `currentProgress` / `multiplier`, awards; per group: title, category, end time, group awards.
- The screen shows when the data was fetched; fresh data = open Objectives in the web app again.

## 2. Parser (`server/objectives.ts`, pure, unit-tested)

Reads only the squad condition from `description`; game mode and match counts stay as EA's text. Output per objective: a list of conditions (may be empty).

```ts
type Condition = {
  filter: {
    nation?: number[]; league?: number[]; club?: number[];
    rarity?: number[];                 // promo / edition, e.g. "Ultimate Scream player"
    position?: string;                 // "a ST", "a CAM"
    preferredOnly?: boolean;           // "(Preferred position only)"
    attr?: { stat: 'PAC'|'SHO'|'PAS'|'DRI'|'DEF'|'PHY'; min: number }; // "85+ Pace"
  };
  role: 'xi' | 'score' | 'assist';    // "in your starting 11" | "score ... using" | "assist ... using"
  min: number;                         // "min. N", default 1
};
```

- "1 Premier League player and 1 Women's Super League player" → two conditions.
- Names → ids through `/api/meta` names (nation / league / club / rarity), case- and accent-insensitive, plus a small alias table for adjectives and short forms: Dutch → Holland, English → England, Spanish → Spain, French → France, Argentine → Argentina, USA → United States, WSL → the Barclays WSL league.
- Anything unmatched → no condition; the objective shows "no squad condition" and cannot be ticked. Examples: Draft / Co-Op / Rush counts, "Win 4 matches in Rivals", kit conditions ("Icon Home Kit equipped"), "First Owned". From "Win 3 matches by 2 or more goals ... while having min. 1 WSL Player" only the WSL part is read.

Test fixtures (from FC 27 data and the FC 26 archive):

| Description (shortened) | Conditions |
|---|---|
| Score 6 goals ... using a Dutch player | score, nation Holland, 1 |
| Win 4 matches while having min. 1 Dutch player in your starting 11 | xi, nation Holland, 1 |
| Play 5 matches while having min. 1 Eredivisie player in your starting 11 | xi, league Eredivisie, 1 |
| Assist 5 goals using a CAM (Preferred position only) | assist, position CAM, preferredOnly |
| Score and Assist in 3 separate matches using a Eredivisie player | score + assist, league Eredivisie |
| Score 5 goals ... at least 1 player from any Premier League team and 1 player from any Women's Super League team in your starting 11 | xi PL 1, xi WSL 1 |
| Play 3 matches ... at least 2 players from USA in your starting 11 | xi, nation United States, 2 |
| Play 5 matches ... Min. 1 Ultimate Scream player in your starting 11 | xi, rarity Ultimate Scream, 1 |
| Assist 3 goals ... using a Arkema Première Ligue player | assist, league Arkema Première Ligue |
| Score 6 goals ... using a player from France | score, nation France |
| Score 6 goals ... using Players with 85+ Pace | score, attr PAC ≥ 85 |
| Assist 5 goals ... using a ST | assist, position ST |
| Win 5 matches ... min. 1 English Player in your starting 11 | xi, nation England, 1 |
| Win 4 matches in Rivals | none |
| Play 15 Draft matches | none |

## 3. Solver

**Pool.** The club (no storage), loans included, the user's global exclusions and max OVR applied; SBC-only settings (untradeables only, burn untradeables) are not. Out-of-position players are not allowed (`off[i] = 0`).

**Model.** New mode `"play"` in `solver/cpsat.py`, built by a new problem builder in `server/solver.ts` (or `server/objectives-solve.ts` if it grows):

- Assignment and chemistry: unchanged.
- `xi` conditions → existing `count` constraint over the matching players.
- `score` / `assist` / position conditions → new `slotCount` constraint: `Σ x[i][s] ≥ min` over matching players and the role's slots:
  - score: ST, CF, LF, RF, LW, RW, CAM
  - assist: CAM, CF, LF, RF, LW, RW, LM, RM, CM, ST
  - a named position: only slots of that position; `preferredOnly` also requires it to be the player's preferred position.
- Objective: maximise `Σ rating·used + W·Σ chem` (chem per player 0–3), `W = 4` to start, tuned on real club data in `data/`.
- Several ticked objectives: all conditions together; one player may cover several.
- 10 s limit, as SBCs.

**Check.** `squad.ts` recomputes rating, chemistry and every condition; `found` comes from that check.

**Not possible.** Each condition is tried alone against the pool: "no Ultimate Scream player in your club" for a condition nobody matches; if each works alone but not together: "these don't fit together in 4-3-3" (with the formation name).

**Access.** Premium only; no quota. Each solve is logged in `events` as `solve` with `{ kind: 'objectives' }`.

## 4. API (`docs/api.md`)

- `GET /api/objectives` (site): `{ fetchedAt, groups: [{ id, title, category, endsAt, awards, objectives: [{ id, name, description, progress, target, awards, conditions }] }] }`; `fetchedAt: null` when nothing was relayed yet.
- `POST /api/objectives/solve` (site, Premium): `{ objectiveIds: number[], formation: string }` → `{ found, squad, rating, chemistry, covers: [{ objectiveId, condition, itemId }] }` or `{ found: false, reasons: [{ msgCode, params }] }`.

## 5. UI

**Screen** `/dashboard/objectives` (route `objectives` in `route.ts`), sidebar entry after Evolutions; Free users see the Premium lock like Gallery.

- Header: data age ("from the web app, 2 h ago"); empty state: "Open Objectives in the FC27 web app, then come back" (or "update the extension" when it is older than 0.9.0).
- Groups by category, each with title, time left, group reward. Each open objective: checkbox (only with a condition), EA name + description as sent, progress `3/6`, condition pills with icon + text (score / assist / starting 11 + filter), never colour alone. No-condition objectives dimmed, labelled, not tickable.
- Sticky bar: formation picker (default: active squad formation), ticked count, primary `--go` button "Find squad".
- Result: the existing pitch, rating and chemistry; per ticked objective a ✓ line "Score with a Dutch player → Meerveld (CAM)"; a small badge on those cards. Failure shows the reasons.
- Selection and last result in `localStorage` per persona.

**Landing**: own section `#objectives`, after `#why`, before `#how`, linked from the landing nav, with a Premium badge. Static demo: three objective cards tick one after another, then a mini pitch lights up the players covering them. CSS, scroll-driven like the rest of the landing, respects `prefers-reduced-motion`; art in `web/public/landing/`.

**Always**: every string through `t()` in en / ro / it (`npm run i18n:check`); EA text stays as sent; check 390px; WCAG AA.

## 6. Testing

- Unit (`npm test`): parser on every fixture above; condition → pool matching; slot sets per role.
- Solver: run against real cached clubs in `data/accounts/` with a few picked objectives, confirm via `squad.ts` and by eye.
- Typecheck + build; browser check of the screen and the landing section at desktop and 390px.

## Out of scope

- Kits, "First Owned", team-wide conditions ("starting squad of ..."), match-result conditions.
- Choosing the formation automatically.
- Any EA write (equipping the squad in the web app).
