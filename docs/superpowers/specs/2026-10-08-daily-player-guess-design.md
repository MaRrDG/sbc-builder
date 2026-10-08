# FC Solver Daily: guess the player

Date: 2026-10-08. Status: sections 1–2 approved in chat; sections 3–6 proposed, awaiting spec review.

## Goal

A daily "guess the player" game in the spirit of Wordle / Who Are Ya, for EA FC players. One secret player per day, the same for everyone; 5 guesses; each guess shows how close it is (nation, league, club, position, rating, card type). Plus an unlimited Practice mode.

Purpose: bring people back every day and bring new people to FC Solver (shareable result). It lives on its **own public page** (`/daily`, no account needed); the landing page has an eye-catching teaser that leads there; the dashboard has a nav entry that leads there too.

Logged-in users get their stats saved to their account, and win streaks earn invite points (the same points as invites, spent on Premium).

Success: a fan of FC can play in under 2 minutes on a phone, understands every hint without reading the rules, and wants to share the result; the answer is never leaked to the browser before the game ends; streak points cannot be farmed.

Read-only toward EA, as everything else: no new EA call, no new job recipe.

## 1. Player data (approved)

**Source:** new Postgres table `players` (Drizzle, migration via `npm run db:generate`), one row per `assetId`. Filled whenever the server writes an EA item to any account's cache (club, SBC squads, storage, unassigned, objectives rewards), through the existing `onCacheWrite` listener (same mechanism as `server/gallery/ledger.ts`). No new EA call.

Columns: `assetId` (pk), `name` (stage name: EA `players.json` common name `c` if present, else `f + ' ' + l`), `fullName`, `nation`, `league`, `club`, `position` (preferred), `rating` (base card), `cardType` (`normal` | `icon` | `hero`), `baseClubs` jsonb (`[{ club, league, lastSeen }]`), `firstSeen`, `lastSeen`.

- Only **base cards** (gold common / rare; `rareflag` 0 or 1) update club / league / rating. Special cards (TOTW, promos) only mark the player as existing (and give nation / position / card type when nothing else is known).
- **Current club** = the base-card club seen most recently. If two different base clubs were seen in the last 14 days, the player is **in transfer**: never picked as the daily answer until it settles; when guessed, hints use the most recent club.
- Icons / Heroes: `cardType` from the existing `isLegend` / `isHero` helpers (`server/squad.ts`); their club is whatever their base card carries.

**Answer pool** (daily and Practice): league ∈ top 5 (Premier League 13, LALIGA EA SPORTS 53, Serie A 31, Bundesliga 19, Ligue 1 16); base rating ≥ `DAILY_MIN_RATING` (start 82, tuned on real data so the pool is large enough, ≥ 150 players); not in transfer; base card seen in the last 30 days; not a daily answer in the last 60 days. Popularity is by rating, **not** by how many clubs own the player (user ruling: owning is luck).

**Daily pick:** chosen on the server at the 20:01 Europe/Bucharest drop (reuse the `SBC_DROP_TZ` / `SBC_DROP_TIME` settings from `server/sync.ts`), stored in table `daily_answers` (`day` int pk, `date`, `assetId`, `pickedAt`). Day numbering: `#1` = launch day. Picked lazily on the first request after the drop if the scheduler missed it; deterministic per day once stored. Never guessable in advance (random pick, not seeded by date).

**Autocomplete:** every player in `players` (not only top 5), matched on stage name and full name, accent- and case-insensitive (`normName` in `server/objectives/parse.ts`).

## 2. The game (approved)

5 guesses. A guess = pick a player in the autocomplete → "Guess". Each guess adds a row of 6 tiles compared with the secret player; state is shown by colour **and** an icon / text, never colour alone:

| Tile | Green ✓ | Yellow ≈ | Grey ✕ |
|---|---|---|---|
| Nation (flag) | same | same continent | else |
| League (logo) | same | same country | else |
| Club (badge) | same | none | else |
| Position | same | same line (attack / midfield / defence; GK alone) | else |
| Rating | equal | within 2, with ↑ / ↓ | ↑ / ↓ |
| Card type | same | none | else |

Continent per nation and country per league come from a small static map in the repo (`server/daily/regions.ts`); unknown → no yellow.

**Help after the 3rd wrong guess:** the secret player's card appears as a **silhouette** (rating and position visible, face and name hidden).

**End of game** (won or lost): the full card with the stage name is revealed; stats (current and best streak, win %, guess distribution; logged-in: next points milestone, e.g. "3 more days to +1 point"); a Share button copying

```
FC Solver Daily #42 3/5
🟩🟨⬜🟨⬜🟩
🟩🟩🟩🟩🟩🟩
fcsolver.app/daily
```

(text only, no names; domain through `publicOrigin()`); a countdown to the next player (20:01); a "Play Practice" button.

**Practice:** same rules, random player from the same pool, "Another one" button. Practice gives no streak and no points, and is not stored.

## 3. Accounts, streaks and points (rules approved; implementation proposed)

- **Logged in (Clerk):** each daily game is stored in `daily_plays` (`userId`, `day`, `guesses` jsonb of assetIds, `won`, `finishedAt`; unique `(userId, day)`). Stats and streak are computed from it, so they follow the user on any device.
- **Not logged in:** the game works the same; stats live in `localStorage` (`sbc-daily-*` keys) and earn no points. Signing in later does not import them (no proof they were played honestly).
- **Streak** = consecutive daily games **won**. A lost day or a missed day resets it to 0.
- **Points** (same ledger as invites, `point_ledger`, new reason `daily_streak`): reaching streak 7 → +1, 14 → +1, 30 → +2, and the cycle repeats every 30 days (37 → +1, 44 → +1, 60 → +2, …). Granted once per `(userId, day)` (unique index like `point_ledger_invite_persona`), only from server-verified wins.

## 4. Server API (proposed)

The answer never reaches the browser before the game ends; every guess is checked on the server.

- `GET /api/daily` (public): `{ day, date, nextAt, maxGuesses: 5 }`; when signed in also `{ guesses: GuessRow[], finished, won, answer? (only if finished), silhouette? (after 3 misses), stats }`.
- `GET /api/daily/players` (public, cached, ETag): compact autocomplete list `[{ id, name, fullName }]` for the whole `players` table (client-side search; a few thousand rows, gzip).
- `POST /api/daily/guess` (public) `{ assetId, state? }`:
  - signed in: state lives in `daily_plays`; the server rejects a 6th guess, a repeated player, or a guess after the game ended;
  - anonymous: stateless; the client sends the previous guesses back inside `state`, an HMAC-signed token from the previous answer (server secret), so an anonymous player can't skip ahead to the answer; no points anyway;
  - returns `{ row: GuessRow, silhouette?, finished, won, answer?, stats?, state }`.
- `POST /api/daily/practice` → `{ token }`: an encrypted (AES-GCM, server key) token holding a random pool player; `POST /api/daily/practice/guess { token, assetId, state }` works like the anonymous daily guess.
- `GuessRow` = `{ player: { id, name, nation, league, club, position, rating, cardType }, tiles: { nation, league, club, position, rating, cardType } }`, each tile `{ state: 'hit' | 'near' | 'miss', dir?: 'up' | 'down' }`.
- Per-IP limits in `server/limits.ts` on the guess / practice endpoints; per-user single-flight not needed (cheap).
- Errors carry `code` (`dailyFinished`, `dailyRepeat`, `dailyUnknownPlayer`, `dailyNoPool`) translated on the site (`err.*`).
- Documented in `docs/api.md`.

## 5. Interface (proposed; must not look AI-generated)

- **`/daily` page:** own lazy chunk (like the landing), outside the dashboard layout, with the FC Solver header (logo, language, sign in / dashboard). EA web-app look per `DESIGN.md` (dark teal, EA card art via the existing `Card` component and portraits, `--go` only for primary / met / selected, 8px controls, 14px containers). Load the `frontend-design` skill when building it.
- **Layout:** title "FC Solver Daily #N", a single search field with autocomplete (keyboard: ↑ ↓ Enter, Esc), the guess grid (column headers: flag, league, club, position, rating, card type), the silhouette card slot, "How to play" button, stats button.
- **Motion** (all off under `prefers-reduced-motion`, final state shown):
  - tiles flip in one after another per row (Wordle-like stagger);
  - a wrong / repeated pick shakes the field;
  - the silhouette card rises in after the 3rd miss;
  - win: the silhouette lights up into the full card with a gold sheen; loss: the card flips to reveal;
  - the stats sheet slides up; streak milestones get a small celebratory burst.
- **390px:** tiles shrink to icon + short text, grid scrolls never horizontally; search field and keyboard friendly.
- **Landing:** an eye-catching "Guess today's player" teaser right after the hero (animated silhouette card + "Play today's game" CTA to `/daily`) and a link in the landing header nav.
- **Dashboard:** a "Daily" sidebar entry that navigates to `/daily`.

## 6. Rules, data source and legal text (requested)

- **On the page:** a "How to play" sheet (opens on the first visit, then from the button): the 5 guesses, what each tile colour means, the silhouette after 3 misses, the daily reset at 20:01 (Romania time), Practice, streaks and points (7 → +1, 14 → +1, 30 → +2, repeating; only when signed in; points can be withdrawn on abuse), and that **players come from FC Solver's own database, built from the EA FC data the FC Solver extension sees**, so a very recent transfer can show the old club for a while.
- **Terms of use** (`web/src/legal/docs.ts`, every site language): a paragraph on the Daily game, the streak points (granted at the operator's discretion, can be withdrawn on abuse or cheating, no cash value, same rules as invite points), and the data source above. Bump the terms date.
- Every string through `t()` in en / ro / it (RO `_one` / `_few` / `_other`, IT `_one` / `_other`); player / club / league / nation names stay as EA sends them.

## 7. Testing

- Unit (`npm test`): `players` upsert from items (base vs special, transfer detection, current club); pool filter; tile comparison (every state incl. continent / league country / position line / rating ±2); streak and points schedule (7, 14, 30, 37, 44, 60, reset on loss and on missed day); state token sign / verify; practice token encrypt / decrypt.
- Real data: build the `players` table from the cached accounts (`data/accounts`, plus a one-off backfill script like `db:import`), check the pool size at rating 82 and tune.
- Typecheck + build; browser check of `/daily`, the landing teaser and the dashboard entry at desktop and 390px, with reduced motion.

## Out of scope

- Real-world football API (ages, real transfers): possible later as an extra source.
- Head-to-head, leaderboards, guessing by photo.
- Importing anonymous stats into an account.
