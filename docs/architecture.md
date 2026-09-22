# Architecture and approach

## The problem

An SBC asks for 11 players that satisfy a list of requirements (team rating, chemistry, "min. 2 players from Liga Portugal", "max. 6 leagues", quality, rarity...). The web app lets you search your club, but finding a squad that meets everything **and** spends the least valuable cards is a combinatorial problem: a few hundred players, 11 slots, non-linear rating and chemistry rules. That is a job for a solver, not for trial and error.

Three constraints shaped everything else:

1. **No automation of game actions.** EA bans accounts that buy or submit automatically. FC Solver only reads, the user builds the squad by hand.
2. **Be gentle with EA.** Every request uses the player's own session. Requests are cached, serialized and spaced out; nothing is fetched twice when the answer cannot have changed.
3. **Be exactly right.** A suggestion that looks valid here but fails in the game is worse than none. So the game formulas were ported from the web app's own code, and every solver result is re-checked with them.

## Data flow

```
 FC27 web app (browser)                       FC Solver server                     Browser UI
 ──────────────────────                       ──────────────────                     ──────────
 X-UT-SID on every request ──extension──►  POST /api/session  ──► account + key ──► extension stores key,
                                             (usermassinfo = who is this?)          "Open FC Solver" passes it
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

**Extension 0.7+ (client mode): every request to EA leaves from the web app tab.** The server keeps no SID and never calls EA for these accounts, except once to prove a new account.

- `hook.js` (inside the web app page) learns the headers and UTAS base the web app itself uses, and who is logged in from the web app's own `/usermassinfo` (it asks once if the web app did not).
- The extension sends that identity to `POST /api/hello`. If it already holds the key for that persona, that is enough. Otherwise (new account, new browser) it sends the SID once; the server proves it with a single `/usermassinfo` call, returns the account's **access key** and throws the SID away.
- Syncs become **jobs** (`server/jobs.ts`). Pressing Club / SBCs, or the schedule, queues one; the extension polls `/api/jobs/next` every few seconds while a web app tab is open (that polling is also what "Live" means); the page runs a fixed, read-only recipe for the job kind (`club`: club pages, active squad, chemistry profiles; `sbc`: set list; `challenges`: given set ids; `challengeSquad`: `GET` the squad of a challenge already started, never the `POST` that starts one), one request at a time, 1.5 to 3 s apart and never overlapping the web app's own requests, with 5 s of rest between jobs, and the responses flow back through `/api/webapp-event` like any web app load. After an SBC list job the server queues challenges for the sets that changed. The server only ever names a recipe, never a URL, so it cannot make the page do anything else.
- Every request is reported to `/api/jobs/:id/call` for the daily count; throttling codes pause the account for 15 minutes. The extension keeps its own daily limit too.

**Older extensions (legacy mode)** still post the SID to `POST /api/session`; the server asks EA `GET /usermassinfo` once, keeps the SID and syncs from the server. This stays until every account runs 0.7, then goes away. A client-mode account never goes back to storing a SID.

Either way the server then:

- creates or updates `data/accounts/<personaId>/account.json`,
- returns a random **access key** for that account to the extension.

The browser UI never sees the SID. It authenticates with the access key (`X-Account-Key` header). Keys reach the page through the URL fragment (`#keys=...`), which browsers never send to a server, and are then kept in `localStorage`. One browser can hold keys for several accounts and switch between them; friends on the same server cannot see each other.

## Keeping data fresh without hammering EA

Everything EA returns is written to JSON files with a `fetchedAt` timestamp (`server/store.ts`). A sync only happens when something is actually stale:

| Data | Refreshed when |
|---|---|
| Club players, active squad, chemistry profiles | older than 24 h, or the user presses **Club** |
| SBC list | fetched before the latest 20:01 Europe/Bucharest drop, or the user presses **SBCs** |
| Challenges of a set | the set is new or its progress changed during an SBC sync; otherwise only when opened in the web app |
| Static game data (names, formations, card art tunables) | older than 7 days (public CDN, no session needed) |

A one-minute ticker only compares timestamps; it costs nothing unless a sync is due. When the session is missing at 20:01, the SBC sync happens as soon as the next session arrives. A fresh session waits 3 minutes before any automatic sync, because the web app is loading the same data at that moment and the extension hands it over for free.

Opening an SBC or solving never asks EA: both read the cache only. Only syncs do.

**The web app loads it for us.** The extension relays the web app's own responses for `/sbs/sets`, `/sbs/setId/{id}/challenges`, `/club` pages, `/squad/list` + `/squad/{id}` and `/chemistry/profiles`. These replace the cache directly. Club pages are special: a filtered or partial listing only refreshes the players it shows, but a plain listing scrolled from start to end (contiguous pages, same order, within 10 minutes) replaces the whole club and resets its 24 h timer, exactly like a club sync.

**Budget.** Every request to EA is counted per account (`data/accounts/<id>/ea-requests.json`, shown in Settings). After `EA_DAILY_LIMIT` (default 150) requests in a day nothing more is sent; normal use is 10 to 25. If EA answers 429, 458, 495, 512 or 521 the account pauses all EA requests for 15 minutes.

On top of that, the extension reports what the user does in the web app so the cache is edited in place (same `fetchedAt`, so the schedule does not shift):

- **SBC submitted**: the exact item ids from the saved squad leave the club, the challenge is marked done.
- **Pack opened**: its players go to an *Unassigned* list (they are not in the club yet).
- **Items moved**: "send to club" moves them from Unassigned to the club; transfer list / storage / quick sell removes them.

## Staying exact

The web app is a large obfuscated bundle, but the relevant classes are readable. FC Solver ports them 1:1 (`server/squad.ts`):

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
