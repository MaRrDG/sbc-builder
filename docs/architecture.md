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

## Shared data (Postgres)

Most data is per account and stays in `data/accounts/<personaId>/*.json`: club, squad, SBC progress, the request meter and the raw challenge-squad captures. What is the same for everyone lives in Postgres (`server/db/`, Drizzle, migrations applied on start):

- `sbc_sets`, `challenges`: every SBC set / challenge ever seen, latest definition plus `first_seen` / `last_seen`. Rows are never deleted, so expired SBCs stay. Per-account fields in `raw` (`timesCompleted`, ...) are never read from here.
- `brick_reports`: the locked slots ("bricks") of a brick challenge as one account saw them, one row per account and distinct layout. Only the bricks, never the reporter's placed players.
- `trusted_accounts`: accounts whose report wins outright (`npm run db:trust`).

Writes ride on what already happens, never an extra EA call: the web-app relay (`events.ts`) and the syncs (`sync.ts`) upsert sets and challenges next to the JSON cache, and a relayed challenge squad with bricks becomes a report. A DB failure there is logged and does not break the sync. An SBC list sync seeds the challenges of a set that is new to the account and untouched (0 completed, 0 repeats) from `challenges` rows seen since the latest drop, with `status` / `timesCompleted` reset, instead of asking EA; a started-but-not-submitted challenge shows `NOT_STARTED` until the set is opened in the web app. A report first passes structural checks (`bricks.ts`: brick challenge, 1 to 10 bricks, indexes 0..10 without repeats, non-negative ids, positions a string list).

`challengeLayout()` (`layout.ts`) takes the bricks from the shared layout and the placed players from the account's own capture, so a brick SBC a trusted account opened once in the web app is solvable for everyone. The shared layout: newest report from a trusted account, else the layout most distinct accounts reported once at least 3 agree (`MIN_VOTERS`, so one account cannot set it for everyone), ties to the earliest. Until then each account only sees its own capture. It is cached in memory for 10 minutes and dropped when a new report arrives.

## Users and EA accounts

The site signs in with Clerk (our own screens on `@clerk/react` v6 hooks: Google or an emailed code) and sends `Authorization: Bearer <session token>` plus `X-Persona: <personaId>`. `server/auth.ts` verifies the token locally and checks that the persona belongs to the user. The extension never goes through Clerk: it keeps its per-persona access key (`X-Account-Key`), which never reaches the browser.

Postgres holds who owns what:

- `users`: Clerk user id, email, `created_at`, `last_seen_at`, `plan` (Free/Premium), `premium_until`, `quota_start`, `quota_used`, `founder_at` / `founder_persona` (Founding 50);
- `personas`: one owner per EA persona, `previous_user_id` after a takeover;
- `link_tokens`: SHA-256 of short-lived (10 min), single-use tokens.

Linking: the signed-in site asks `POST /api/link-token` and hands the token to the extension's `site.js` (`window.postMessage`); the worker sends it with the next `/api/hello`. A persona nobody owns (or already this user's) is linked on the key the extension holds; one owned by someone else answers `needSid`, and only a fresh EA session proof (`/usermassinfo`) moves it. The previous owner then gets `personaTakenOver` and a one-time notice. Once linked, the persona shows up on every device the user signs in on, phone included; the cached club and SBCs are per persona on the server, so they are the same everywhere.

Browsers from before sign-in held access keys (`#keys=`, `localStorage`); the site sends them once to `POST /api/me/legacy-keys` only to move saved solver settings to `…-p<personaId>`, then forgets them.

**Plans and quotas** use `users.plan` (Free or Premium), `premium_until` (expiry date), and weekly quota columns (`quota_start` timestamp, `quota_used` count). Free users get `FREE_WEEKLY_SOLVES` found solves per 7-day window starting at the first counted solve; Premium unlimited solves. Admins are always Premium. Plan rules are pure functions in `server/plan.ts`; per-user lookup with quota state is in `server/plans.ts`. Enforcement happens in `/api/solve` before calling the solver (403 `quotaExhausted` if over quota), and counting happens after a found squad. Plan assignment is via the admin screen, plus **Founding 50**: the first `FOUNDERS_LIMIT` (50) users to link an EA persona get lifetime Premium automatically (`grantFounderSpot` on a new link in `/api/hello`, under a Postgres advisory lock so it never goes past the limit; one spot per persona; admins take none). On startup `backfillFounders` offers spots to users who linked earlier, in link order. Pure rules in `server/founders.ts`; the landing reads `GET /api/founders` and hides the offer once it is full. A Discord boost is a third Premium source (`users.boost_since` / `boost_ended_at`, set by the bot through `/api/bot/boost(s)`): Premium while boosting plus 12 h (`BOOST_GRACE_MS`), never touching `plan` / `premium_until`; `planSource()` says which source applies (admin > paid > boost); unlinking Discord ends it at once. The site shows a boost-only user as Premium (not lifetime) from `plan.source`; spending points then extends `premium_until`, which wins once the boost ends.

## Admin history

`events` (Postgres, `server/db/events.ts`) is an append-only log the admin panel reads from: `solve` (`/api/solve`, `server/index.ts`), `sync` (`server/sync.ts` legacy mode, `server/jobs.ts` client mode), `ea_error` (a throttle pause, `server/meter.ts`) and `ea_day` (the day's running EA request count, also `meter.ts`, one row per account and day — a restart writes another row for the same day, so readers collapse it with `max(count)` rather than summing). `logEvent()` is fire-and-forget (`softly`, `server/db/index.ts`): a DB failure is logged and never breaks the solve, sync or EA request it rides on. Rows older than 180 days (`KEEP_DAYS`) are deleted by `pruneEvents()`, run on a daily timer in `server/index.ts`. `server/admin/` reads this table plus `users`/`personas`/the file cache (never EA) to build the admin API: `query.ts` (pure filters, paging, day-key helpers), `users.ts`, `accounts.ts`, `overview.ts` (KPIs, activity charts, attention list), `routes.ts` (wiring), `auth.ts` (admin-only gate).

## Getting the session

**Extension 0.7+ (client mode): every request to EA leaves from the web app tab.** The server keeps no SID and never calls EA for these accounts, except once to prove a new account.

- `hook.js` (inside the web app page) learns the headers and UTAS base the web app itself uses, and who is logged in from the web app's own `/usermassinfo` (it asks once if the web app did not).
- The extension sends that identity to `POST /api/hello`. If it already holds the key for that persona, that is enough. Otherwise (new account, new browser) it sends the SID once; the server proves it with a single `/usermassinfo` call, returns the account's **access key** and throws the SID away.
- Syncs become **jobs** (`server/jobs.ts`). Pressing Club / SBCs, or the schedule, queues one; the extension polls `/api/jobs/next` every few seconds while a web app tab is open (that polling is also what "Live" means); the page runs a fixed, read-only recipe for the job kind (`club`: club pages, active squad, chemistry profiles; `sbc`: set list; `challenges`: given set ids; `challengeSquad`: `GET` the squad of a challenge already started, never the `POST` that starts one; `academy`: one `GET /academy/hub/v2` for the timed Evolutions, daily, Premium owners only), one request at a time, 1.5 to 3 s apart and never overlapping the web app's own requests, with 5 s of rest between jobs, and the responses flow back through `/api/webapp-event` like any web app load. After an SBC list job the server queues challenges for the sets that changed. The server only ever names a recipe, never a URL, so it cannot make the page do anything else.
- Every request is reported to `/api/jobs/:id/call` for the daily count; throttling codes pause the account for 15 minutes. The extension keeps its own daily limit too.

**Older extensions (legacy mode)** still post the SID to `POST /api/session`; the server asks EA `GET /usermassinfo` once, keeps the SID and syncs from the server. This stays until every account runs 0.7, then goes away. A client-mode account never goes back to storing a SID.

Either way the server then:

- creates or updates `data/accounts/<personaId>/account.json`,
- returns a random **access key** for that account to the extension.

The browser UI never sees the SID. It authenticates with the access key (`X-Account-Key` header). Keys reach the page through the URL fragment (`#keys=...`), which browsers never send to a server, and are then kept in `localStorage`. One browser can hold keys for several accounts and switch between them; friends on the same server cannot see each other.

## Evolution training

The Evolutions screen of the EA web app loads `/academy/hub/v2`; the extension relays it (and any other `/academy/...` response) through `/api/webapp-event`, and `server/events.ts` parses the slots with timed training (`server/evos.ts`) into `evo_trainings` (`server/db/evos.ts`). A full unfiltered list also replaces the rows that are gone and stamps the `academy` cache key. For Premium owners, `autoSync` queues one read-only `academy` job a day (after the 20:01 drop) so the list stays current without a visit to Evolutions. A one-minute ticker (`server/evo-alerts.ts`) then emails the owner when a training is over: everything that ended for one user in the same minute goes in one email, emails go out in Resend batches of up to 100 (one request every 0.6 s), each request carries an idempotency key so a retry after a timeout can't mail twice, and rows close only after Resend accepted them. A rate limit, quota or outage pauses sending without using up a row's 3 tries; a rejected batch is retried one email at a time so one bad address fails alone. The email shows each player's card as it is now (`slot.player`, every evolution and claimed level so far; the new level's upgrades only exist after the claim, EA doesn't send the resulting OVR): `server/evo-card.ts` composes the same EA card art as the site's `Card` (cached in `data/cache/card-art/`) with `server/evo-card-svg.ts`, renders it with resvg (Barlow Condensed from `server/assets/`) into `data/evo-cards/`, and the email links it through `/api/evos/card/:file.png`. The last level reads as "evolution complete", an earlier one as "level N of M ready"; buttons go to the EA web app (primary), EA's Companion app page and FC Solver.

## Keeping data fresh without hammering EA

Everything EA returns is written to JSON files with a `fetchedAt` timestamp (`server/store.ts`). A sync only happens when something is actually stale:

| Data | Refreshed when |
|---|---|
| Club players, active squad, chemistry profiles | fetched before the latest daily drop (20:01), like the SBC list, or a visit (site opened / back in front) when older than 2 h (`CLUB_VISIT_STALE_H`), or the user presses **Club**; no daily cap: every club sync (scheduled, visit, button, admin) waits `CLUB_MANUAL_COOLDOWN_MIN` (15) minutes after the last club load or sync, so a failing one is not retried every minute; `EA_DAILY_LIMIT` caps the total |
| SBC list | by the schedule (fetched before the latest 20:01 Europe/Bucharest drop), and on a visit (the site's SBC page opens, or the user comes back to the web app) when older than 30 min; no manual refresh. Progress higher than cached (SBC done on a console / companion app) also queues a club sync |
| Challenges of a set | the set is new (taken from the shared copy when untouched and complete since the drop) or its progress changed during an SBC sync; otherwise only when opened in the web app |
| Static game data (names, formations, card art tunables) | older than 7 days (public CDN, no session needed) |

A one-minute ticker only compares timestamps; it costs nothing unless a sync is due. When the session is missing at 20:01, the club and SBC syncs happen as soon as the web app opens: `/api/hello` schedules a check 20 seconds later (the web app's own start-up burst), and the extension queue still waits for the web app to go quiet before each request.

Opening an SBC or solving never asks EA: both read the cache only. Only syncs do.

**The web app loads it for us.** The extension relays the web app's own responses for `/sbs/hub/v2` (the SBC list, points SBCs included; the older `/sbs/sets` too), `/sbs/setId/{id}/challenges`, `/club` pages, `/squad/list` + `/squad/{id}` and `/chemistry/profiles`. These replace the cache directly. Club pages are special: a filtered or partial listing only refreshes the players it shows, but a plain listing scrolled from start to end (contiguous pages, same order, within 10 minutes) replaces the whole club and counts as that day's club sync, exactly like a club sync.

**Budget.** Every request to EA is counted per account (`data/accounts/<id>/ea-requests.json`, shown in Settings). After `EA_DAILY_LIMIT` (default 150) requests in a day nothing more is sent; normal use is 10 to 25. If EA answers 429, 458, 495, 512 or 521 the account pauses all EA requests for 15 minutes.

On top of that, the extension reports what the user does in the web app so the cache is edited in place (same `fetchedAt`, so the schedule does not shift):

- **SBC submitted**: the exact item ids from the saved squad leave the club, the challenge is marked done.
- **Pack opened**: its players go to an *Unassigned* list (they are not in the club yet).
- **Items moved**: "send to club" moves them from Unassigned to the club; transfer list / storage / quick sell removes them.

## FUT Gallery ledger

The Gallery planner needs items the club no longer holds, so `server/gallery/ledger.ts` keeps a per-account ledger (`accounts/<personaId>/gallery`, `{ v, entries }`). It is fed by `onCacheWrite` for the club, storage and unassigned caches and backfilled on the first read or write from those caches plus the players placed in `challengeSquads` captures (field slots only; bricks, dream and concept items skipped). It keeps sold items and skips loans. Entries are slim (only what scoring and the lineup card need) and the ledger stays in memory once loaded; a file with another `v` (e.g. the first format with full item DTOs) is discarded and rebuilt from the cache. Items with unknown `owners` are not counted as first owner. `GET /api/gallery` (Premium) runs the optimizer over the ledger for each catalogue set (`server/gallery/compute.ts`) without calling EA; malformed entries are skipped.

## Points challenges

A challenge is a points challenge when EA sends a `scoreRequirement` above 0 (no formation). Each card's points are its `gradingScore`, which the club cache already holds, so there is no new EA call: solving reads the cache like any solve. The points still missing are `scoreRequirement - submittedScore`. `submittedScore` is as fresh as the challenge cache: it updates when the web app loads the set's challenges (relayed by the extension) or a sync refreshes them, and shows with the challenge's `fetchedAt`. A copy seeded from the shared SBC data resets it to 0, so an untouched-looking set may be behind your real progress until the web app opens it.

## Referrals

Invite links earn points toward Premium days. `server/referrals.ts` holds pure rules: prices (2 points = 7 days, etc.), code and spend validation, reward days. `server/db/referrals.ts` manages three tables (`codes`, `redemptions`, `point_ledger`) and provides transactional exports (`ownInviteCode`, `redeem`, `grantPendingInvite`, `spendPoints`, `referralSummary`). `server/admin/codes.ts` gates the admin codes API to admins only.

Every account has one invite code (6 chars, generated on first call to `ownInviteCode`). When a friend redeems an invite code, they are stored in `redemptions` with status `pending`. On the first EA link (`POST /api/hello` → `grantInviteOnLink` → `grantPendingInvite`), a pending invite is granted: the invitee receives 7 days of Premium (or nothing if they are already a founder), and the inviter earns +1 point—once per invitee persona, enforced by a partial unique index on `point_ledger (personaId)` where reason = 'invite'. Points are tracked in `point_ledger` (reason: invite/spend/gift/admin), one row per change; the balance is the sum of deltas per user. Spending points (for Premium days or gift codes) runs under a per-user advisory lock so only one concurrent transaction wins. Admins create promo codes (4–20 chars); gift codes are generated by `spendPoints` and are single-use.

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

The site speaks English, Romanian and Italian (`web/src/i18n.tsx`, a small dictionary + `t()`, plural rules from `Intl.PluralRules`; the choice is stored per browser and defaults to the browser language). EA's own texts stay as EA sends them. Solver reasons and user-facing server errors travel as codes + values and are worded by the site. `/guide` explains the extension and its link with the web app. Under 860px the layout switches to a phone layout with a hamburger menu.

Every screen has its own URL (`web/src/route.ts`, History API, no router library): `/` public landing page, `/dashboard` SBC list, `/dashboard/sbc/{setId}/{challengeId}`, `/dashboard/club`, `/dashboard/settings`, `/dashboard/accounts` (Linked accounts: sign-in, Discord, EA accounts), `/dashboard/admin`, `/setup`, `/guide`, so browser Back / Forward move between screens and links can be reloaded or shared. Old app paths without `/dashboard` still work: `useRoute` rewrites them. The server answers any other non-API path without a file extension with `index.html`. Switching challenges inside a set replaces the history entry, so Back leaves the set.

The sidebar has three sections: **SBC** (every set as a paginated grid with its repeat badge; a click opens the set with the pitch), **Club** (the players, paginated, with filters; a card can be kept out of SBCs) and **Settings** (the global solver settings). An SBC can have its own **local settings** (Options on its pitch): they start as a copy of the global ones, and once saved the global settings no longer apply to that SBC until it is reset. Settings live in `localStorage` per account (`sbc-options-*`, `sbc-local-options-*`).

## Multi-account and hosting

One server can serve friends: each account has its own session, request queue, cache folder and key. The trade-off of hosting is that all EA requests leave from the server's IP; the per-account queue, caching and the drop-based schedule keep the volume close to what the web app itself does.

## Daily game

The `players` table (Postgres, mirrored in memory by `server/daily/store.ts`) is fed by `onCacheWrite`: every cache write of club, storage, unassigned, SBC challenge squads and objectives is scanned for EA player items (`server/daily/ingest.ts`), never an EA call. A row keeps the latest card data plus `baseClubs`, the clubs seen on base cards (rareflag 0/1); special cards (icons, heroes, promos) never move the club. A base card seen at a new club inside the transfer window is treated as a recent transfer and leaves the answer pool. The pool is the top-5-league base players above `DAILY_MIN_RATING`, stepping down to `DAILY_RATING_FLOOR` until it holds `DAILY_MIN_POOL` players; the daily pick is made at the drop and stored in `daily_answers`. `npm run daily:import` backfills `players` from `data/accounts` and prints pool size per threshold.

**Daily reminder email** (Premium, opt-in, `users.daily_reminder`, Settings → Email alerts). A one-minute ticker (`server/daily/reminder.ts`, next to the evolution one in `server/index.ts`) works only between 3 h 01 min and 1 min before the drop that ends the day (17:00–20:00 Europe/Bucharest for the 20:01 drop): due at 17:00, and after downtime it catches up until 20:00, never later. It mails a user who has the reminder on, an email, is Premium at send time, won the previous day's game (an active win streak, `streakOf`) and hasn't finished today's game (`reminderCandidates` in `server/db/dailyReminders.ts` prefilters in SQL, `eligibility()` in `server/daily/reminder-rules.ts` decides). When Premium ends the preference stays and nothing is sent. Sends reuse the evolution email path: Resend batches of up to 100, 0.6 s apart, a per-day idempotency key, pauses on rate limit / quota / outage, a rejected batch retried one by one. `daily_reminders` (unique on user + day) is written only after Resend accepted the mail, so a restart never mails a day twice; a rejected mail counts a try (3 at most). Language is `users.lang`; the email names the streak, links to `/daily` and carries its own signed unsubscribe link + `List-Unsubscribe` one-click (`/api/daily/unsubscribe`, turns off only the reminder). Signed-out players have no email and get nothing.

## Completion history

EA keeps no history of completed SBCs or objectives, only the current state, so FC Solver counts them itself from what the cache already receives (`onCacheWrite`, no EA call): the SBC list (`sets`, per set `timesCompleted`, all time also for `REFRESH` sets), each set's challenges (`challenges/<setId>`, per challenge `timesCompleted`) and the objectives (`objectives`, `state` `COMPLETED` / `REDEEMED` = done). `server/history/extract.ts` reads the payload, `diff.ts` compares it with `completion_marks` (the last count per persona + item): an increase writes a `completions` row of the difference, the first sighting a `baseline` row (done before tracking started), a decrease (a seeded copy with `timesCompleted` reset, see `server/shared-sbc.ts`) nothing; an objective counts on each not-done -> done. `seq` (the count reached) is unique per persona + item, so a replayed payload never counts twice. Writes are serialized per persona and run in one transaction; a DB failure is logged (`softly`) and the next payload catches up.

Limits: "all time" means since the feature started: what EA still listed when tracking started (`npm run history:baseline` at deploy, baseline rows at first sighting) + everything seen since. SBCs that expired before that are missing; objectives are only seen when the user opens Objectives in the web app, so a daily objective completed and refreshed in between is missed. A decrease in a count (e.g. a seeded challenge copy reset to 0 by `server/shared-sbc.ts`) is ignored and never lowers the mark, so the count resumes from the old mark rather than double counting.

## Discord

The community server and its bot live in `discord/`, a separate process (compose service `bot`). The server layout is data (`layout.ts`: roles, categories, channels, who sees what); `setup.ts` applies it through a pure planner (`sync-plan.ts`: match by name, channels by name + kind inside their category, never delete), so it is safe to re-run. Romanian and English only, English first everywhere. Onboarding is language first: a new joiner sees only `🌐・language`, whose two buttons (English / Română) give the hidden roles `Pending EN` / `Pending RO` (both can be held; they open only `📜・rules`). ✅ on the rules (valid only with a pending or real language role, else ignored) gives Member plus the real `EN` / `RO` roles matching the pending ones and removes the pending ones. Member opens INFO and VOICE, EN / RO open only their own category. Because Discord ORs roles, EN / RO exist only together with Member (the bot adds them with it, removes them when ✅ is withdrawn, and the language picker in `🎭・roles` refuses non-members); the button / ✅ / withdraw rules are pure functions in `roles.ts`. A Member pressing a language button toggles the real role directly. On `guildMemberAdd` the bot posts a welcome embed (English line, Romanian line, member count, only that user mentioned) in `👋・welcome`; Discord's own join message is off. Club roles are picked through a button that opens an ephemeral multi-select pre-ticked with the member's roles (`roles.ts` sets exactly the selection).

The bot never touches the database, `data/` or EA: it calls the app's internal `/api/bot/*` (token `BOT_API_TOKEN`, denied in Apache from outside). `/api/bot/solve` runs `runSolve()` (`server/solve-run.ts`), the same code as `/api/solve`, so pool, CP-SAT, the `squad.ts` re-check, the Free weekly quota and the `solve` event (with `via: "discord"`) are shared; Discord solves use the default solver options (the site keeps its settings in `localStorage`). `/sbc` and `/stats` answers are posted publicly with `channel.send` after an ephemeral defer (errors stay private); 30 s per-user cooldown in the bot, 6 solves a minute per Discord user on the server. The Discord account comes from Clerk's Discord connection (connect-only): `POST /api/me/discord` stores the verified Discord id in `users.discord_id`; the bot uses the user's most recently linked EA account. The bot posts "Daily #N is live" in `⚽・daily` once per day (`/api/bot/daily`, idempotent by reading its own recent posts).

`/poll` (Admin and Moderator only: hidden from others by `default_member_permissions` ManageMessages, and the handler checks the role names again; others get an ephemeral EN / RO refusal) posts a native Discord poll in the read-only `📊・polls` channel, wherever the command was used, and replies privately with the link. Options: `question` (300), `answer1`..`answer10` (55 each, 2 required), `hours` (1 to 768), `multi` (default one choice). Validation and winner calculation are pure (`poll.ts`). Once a minute the bot scans the last 50 messages of `📊・polls`: a poll it created that Discord has finalised and that has no reply of ours with an embed gets a result post (English then Romanian, the winner or the tie, every answer with its votes). The channel is the record, so a restart never posts twice and catches polls that ended while it was down. Polls need no extra gateway intent (the scan uses REST); the bot's overwrite on `📊・polls` includes Send Polls.
