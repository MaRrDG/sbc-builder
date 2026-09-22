# Architecture and approach

## The problem

An SBC asks for 11 players that satisfy a list of requirements (team rating, chemistry, "min. 2 players from Liga Portugal", "max. 6 leagues", quality, rarity...). The web app lets you search your club, but finding a squad that meets everything **and** spends the least valuable cards is a combinatorial problem: a few hundred players, 11 slots, non-linear rating and chemistry rules. That is a job for a solver, not for trial and error.

Three constraints shaped everything else:

1. **No automation of game actions.** EA bans accounts that buy or submit automatically. The builder only reads, the user builds the squad by hand.
2. **Be gentle with EA.** Every request uses the player's own session. Requests are cached, serialized and spaced out; nothing is fetched twice when the answer cannot have changed.
3. **Be exactly right.** A suggestion that looks valid here but fails in the game is worse than none. So the game formulas were ported from the web app's own code, and every solver result is re-checked with them.

## Data flow

```
 FC27 web app (browser)                       SBC Builder server                     Browser UI
 ──────────────────────                       ──────────────────                     ──────────
 X-UT-SID on every request ──extension──►  POST /api/session  ──► account + key ──► extension stores key,
                                             (usermassinfo = who is this?)          "Open builder" passes it
                                                     │
                                             Utas client (1 queue per account,
                                             ≥1.5 s between calls)
                                                     │
                     club, squad, sets, challenges, chemistry profiles ─► data/accounts/<personaId>/*.json
                                                     │
 SBC submit / pack / item moves ──extension──► /api/sbc-submitted, /api/webapp-event ─► edit cached club
                                                     │
                                             POST /api/solve ─► solver.ts builds a problem
                                                                 ─► cpsat.py (CP-SAT) ─► squad
                                                                 ─► squad.ts re-checks with game formulas
                                                                                       ─► pitch + requirements
```

## Getting the session

The web app sends an `X-UT-SID` header on every call to `utas.mob.v1.prd.futc-ext.gcp.ea.com`. The extension observes that header (it never reads cookies or passwords) and posts it to the server. The server asks EA `GET /usermassinfo` once to learn the persona id and club name, then:

- creates or updates `data/accounts/<personaId>/account.json`,
- returns a random **access key** for that account to the extension.

The browser UI never sees the SID. It authenticates with the access key (`X-Account-Key` header). Keys reach the page through the URL fragment (`#keys=...`), which browsers never send to a server, and are then kept in `localStorage`. One browser can hold keys for several accounts and switch between them; friends on the same server cannot see each other.

## Keeping data fresh without hammering EA

Everything EA returns is written to JSON files with a `fetchedAt` timestamp (`server/store.ts`). A sync only happens when something is actually stale:

| Data | Refreshed when |
|---|---|
| Club players, active squad, chemistry profiles | older than 24 h, or the user presses **Club** |
| SBC list | fetched before the latest 20:01 Europe/Bucharest drop, or the user presses **SBCs** |
| Challenges of a set | the set is new or its progress changed; finished one-off sets load only when opened |
| Static game data (names, formations, card art tunables) | older than 7 days (public CDN, no session needed) |

A one-minute ticker only compares timestamps; it costs nothing unless a sync is due. When the session is missing at 20:01, the SBC sync happens as soon as the next session arrives.

On top of that, the extension reports what the user does in the web app so the cache is edited in place (same `fetchedAt`, so the schedule does not shift):

- **SBC submitted**: the exact item ids from the saved squad leave the club, the challenge is marked done.
- **Pack opened**: its players go to an *Unassigned* list (they are not in the club yet).
- **Items moved**: "send to club" moves them from Unassigned to the club; transfer list / storage / quick sell removes them.

## Staying exact

The web app is a large obfuscated bundle, but the relevant classes are readable. The builder ports them 1:1 (`server/squad.ts`):

- `UTSquadEntity._calculateRating` (the float variant, which is enabled on live): sum, average, then each player above the average adds the difference again, round, integer-divide by 11.
- `UTSquadChemCalculatorUtils.calculate`: nation / league / club thresholds (2/5/8, 3/5/8, 2/4/7), only in-position players contribute, icons and heroes count differently, linked men's/women's clubs count together, promo profiles fetched from `/chemistry/profiles`.
- `UTSBCChallengeEntity.isRequirementMet`: how each eligibility key and scope (min / max / exactly) is evaluated, including combined requirements and OR challenges.

The solver works on a model of these rules; the result is then evaluated with the ported functions. If they disagree the UI says so instead of claiming success.

## Why CP-SAT

The first version used an MILP (HiGHS in WebAssembly). Chemistry thresholds and the "bonus above average" rating rule made the relaxation weak: a 75-rated challenge took over two minutes and still was not proven optimal. CP-SAT (OR-Tools) handles these logical constraints natively, runs parallel workers, and a reformulation of the rating rule (see [solver.md](solver.md)) made rating-only problems go from 5 s to 0.6 s. Node stays in charge of everything game-specific and hands CP-SAT a plain JSON problem, so the Python part is small and generic.

## Frontend

The UI deliberately looks like the web app: dark teal pitch, trapezoid header with Requirements / Rating / Chemistry, EA card art, yellow position pills, chemistry pips. The pitch layout groups slots into lines (keeper, defence, holding mid, mid, attacking mid, attack), spreads lines evenly and scales cards down for 5 and 6 line formations; all 29 formations were checked for overlaps in pixels. Design tokens and rules live in `DESIGN.md`, product intent in `PRODUCT.md`.

The sidebar has three sections: **SBC** (every set as a paginated grid with its repeat badge; a click opens the set with the pitch), **Club** (the players, paginated, with filters; a card can be kept out of SBCs) and **Settings** (the global solver settings). An SBC can have its own **local settings** (Options on its pitch): they start as a copy of the global ones, and once saved the global settings no longer apply to that SBC until it is reset. Settings live in `localStorage` per account (`sbc-options-*`, `sbc-local-options-*`).

## Multi-account and hosting

One server can serve friends: each account has its own session, request queue, cache folder and key. The trade-off of hosting is that all EA requests leave from the server's IP; the per-account queue, caching and the drop-based schedule keep the volume close to what the web app itself does.
