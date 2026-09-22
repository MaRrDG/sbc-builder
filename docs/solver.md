# Solver

`server/solver.ts` turns a challenge + the club into a plain JSON problem; `solver/cpsat.py` solves it with OR-Tools CP-SAT; `server/squad.ts` re-checks the answer with the game's own formulas.

## 1. Requirements

EA sends requirements as a flat list grouped by `eligibilitySlot`:

```json
[{ "type": "NATION_ID", "eligibilitySlot": 1, "eligibilityKey": 10, "eligibilityValue": 42 },
 { "type": "PLAYER_COUNT", "eligibilitySlot": 1, "eligibilityKey": 2, "eligibilityValue": 1 },
 { "type": "SCOPE", "eligibilitySlot": 1, "eligibilityKey": 13, "eligibilityValue": 0 }]
```

`server/sbc.ts` folds each slot into one requirement: `scope` (0 min, 1 max, 2 exactly), `count` (from `PLAYER_COUNT`), and `keys` (key → accepted values). A slot with more than one real key is a **combined** requirement (players must match all of them). Key ids come from the web app's `SBCEligibilityKey` enum:

| Key | Meaning | Modelled as |
|---|---|---|
| 0 `TEAM_STAR_RATING`, 19 `TEAM_RATING` | squad rating | rating constraint (below) |
| 35 `CHEMISTRY_POINTS`, 36 `ALL_PLAYERS_CHEMISTRY_POINTS` | total / per player chemistry | chemistry model (below) |
| 3 `PLAYER_QUALITY` | min / max bronze-silver-gold for everyone | pool filter |
| 17 `PLAYER_LEVEL`, 18 `PLAYER_RARITY`, 25 `PLAYER_RARITY_GROUP` | n players of a tier / rarity / group | count |
| 10 `NATION_ID`, 11 `LEAGUE_ID`, 12 `CLUB_ID` | n players from given nations / leagues / clubs | count |
| 26/27/28 `PLAYER_MIN/EXACT/MAX_OVR` | n players with OVR ≥ / = / ≤ x | count |
| 33 `PLAYER_TRADABILITY`, 15 `LEGEND_COUNT`, 30 `FIRST_OWNER_PLAYERS_COUNT` | n (un)tradeable / icons / first owner | count |
| 4/5/6 `SAME_NATION/LEAGUE/CLUB_COUNT` | biggest group ≥ / ≤ n | "some group reaches n" or "every group ≤ n" |
| 7/8/9 `NATION/LEAGUE/CLUB_COUNT` | number of different groups | presence booleans per group |

`elgOperation: "OR"` challenges are solved once per requirement and the cheapest valid squad wins.

## 2. The pool

Before solving, the club is filtered: loans out, the user's settings applied (active squad XI / subs from `/squad`, promos, untradeables only, max OVR, excluded players, nations, leagues, clubs), and "player quality" requirements applied. Two cards of the same player (`assetId`) can never be used together.

## 3. The model (`cpsat.py`)

**Assignment.** A boolean `x[i][s]` exists only for slots where player *i* is in position. Players used out of position have zero chemistry and contribute nothing to anyone, so one boolean `off[i]` covers them and they fill the remaining slots afterwards. `used[i] = in_position[i] + off[i]`, exactly 11 players are used. This alone shrank the problem by ~70 %.

**Objective.** Minimise the sum of `cost[i] * used[i]`. The cost (`playerCost`) grows exponentially with rating above 75, is ×1.35 for tradeable cards (burn untradeables first), ×4 for promos and ×6 for icons / heroes.

**Rating.** The live formula is

```
T = S + Σ max(0, r_i − S/11)        (S = sum of the 11 ratings)
rating = floor(round(T) / 11)
```

The `max(0, …)` makes it non-linear. The trick: for a fixed `S` every bonus term is a constant, so the constraint becomes linear. The model one-hot selects `S` among the ~45 values just below `11 × target` (plus one "S already ≥ 11 × target" option) and, for each choice, adds the linear constraint `11·S + Σ max(0, 11·r_i − S)·used[i] ≥ 121·target − 5`. Everything is scaled by 11 to stay in integers. Rating-only challenges went from 5.3 s to 0.6 s with this.

**Chemistry.** For every nation / league / club group, `total_g = Σ contribution_i · in_position[i]`. One boolean per threshold (`y ⇒ total_g ≥ 2/5/8`, nested so a higher threshold implies the lower). A player's chemistry is `≤ 3 · in_position` and `≤` the sum of the thresholds reached by his three groups; icons, heroes and max-chem promo profiles just get `≤ 3 · in_position`. Icons' "universal" league contribution is left out of the model (it can only add chemistry) and caught by the exact re-check.

**Counts.** Plain linear sums over `used[i]` for the players that match.

**Search.** 8 to 16 parallel workers, 10 s limit (30 s for "Cheaper?"), 0.5 % relative gap. Hard problems usually have a good squad after a second or two; the rest of the time goes into proving optimality, so a time-limited answer is still a valid, cheap squad.

## Locked slots and players already placed

Some SBCs (`type` `BRICK_CHALLENGE` / `CUSTOM_BRICK_CHALLENGE`) lock slots. Which ones only comes with the challenge's squad, which the web app loads when you open the challenge (`POST /sbs/challenge/{id}` the first time, `GET …/squad` after). The extension relays that response and `server/layout.ts` reads `playerRequirements[].playerType`:

- `BRICK`: the slot stays empty and counts for nothing.
- `CUSTOM_BRICK`: a placeholder with a club / league / nation. Like the web app (`UTSquadChemCalculatorUtils.canContribute`) it takes part in chemistry as a player in position (gives links and gets chemistry), but has no rating (`isValid()` is false, rating still divides by 11) and requirement counters skip it (`getNonBrickSlots`). "Chemistry on each player" still has to hold for it.
- The squad needs 11 minus locked slots players.

Players you already placed in the web app (the load, or a later `PUT …/squad` save) are shown on the pitch until you solve. Solve ignores them by default and builds a fresh squad; with **Keep players already placed in the web app** on (off by default) they are a preference: the solver keeps as many as possible in their slots (a large bonus per kept player in the objective, so keeping always beats saving coins), even if your settings would keep them out, and replaces only those the requirements do not allow. The answer says how many were kept; players no longer in the club are reported and their slots refilled. In the model locked slots get no variables, custom bricks add constant contributions to their groups plus their own chemistry variable, and a kept player sits in his slot (out of position he blocks it). Without the squad of a brick challenge, solving is refused with a hint to open it in the web app; for challenges already started FC Solver can read it through the web app tab (`challengeSquad` job, `GET` only).

## 4. Re-check

The squad is evaluated with `squad.ts` (ported `_calculateRating`, `UTSquadChemCalculatorUtils.calculate`, `isRequirementMet`). `found` in the API is the result of this check, not of the solver.

## 5. When there is no squad

`diagnose()` runs cheap, certain checks per requirement against the filtered pool and against the unfiltered club, e.g.

- "Scotland: Min. 1 Player: you have 0 usable. Your solver settings hide 2 more."
- "Team Rating: Min. 75: your best 11 usable players only reach 69. Without your solver settings: 85."

If every requirement is possible alone, it says the combination is the problem (typically chemistry against rating).

## Running the solver by hand

```bash
# the server writes the exact problem it sends when SOLVER_DUMP is set
SOLVER_DUMP=/tmp/problem.json npm run dev:api
solver/.venv/bin/python solver/cpsat.py < /tmp/problem.json
```
