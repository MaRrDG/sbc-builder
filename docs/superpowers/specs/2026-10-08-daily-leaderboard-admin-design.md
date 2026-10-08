# FC Solver Daily: leaderboard, admin stats, player-base visibility

Date: 2026-10-08. Status: design approved in chat; awaiting spec review.

Follow-up to `2026-10-08-daily-player-guess-design.md` (shipped on `dev`, `45070ee` + `86787a4`). That spec put leaderboards out of scope; the user now wants one.

## Goal

1. A public **all-time leaderboard** of the Daily game, opt-in, with a username the user picks.
2. An **admin "Daily" tab**: per-day results (who guessed what, how many guessed), for signed-in and anonymous games, plus the full leaderboard with moderation.
3. Make it **obvious** that the game only knows the players FC Solver has collected so far, and that the base grows as more people use FC Solver.

Success: a signed-in player who finishes a game is asked once whether to appear on the leaderboard and can do it in one step; the admin sees how many people played and won each day and what they tried; nobody wonders why a player is missing from the search.

Unchanged rules: read-only toward EA; the day's answer never reaches the browser before the game ends; points only from server-verified signed-in wins.

## 1. Username and opt-in

- `users` gets `username` (text, nullable; unique case-insensitive via a unique index on `lower(username)`), `leaderboard` (boolean, default false) and `leaderboard_asked_at` (timestamp, nullable).
- Username rule (pure, tested): trimmed, 3–16 characters from `A–Z a–z 0–9 _ . -`, must contain a letter or digit, not all punctuation. Errors carry codes: `usernameInvalid`, `usernameTaken`.
- **Prompt:** after a signed-in user finishes a daily game (won or lost) and `leaderboard_asked_at` is null, the end panel shows a small dialog: "Want to appear on the leaderboard?" with a username field (prefilled empty), **Yes, show me** and **Not now**. Either answer sets `leaderboard_asked_at`; asked once per account. Yes requires a valid, free username and sets `leaderboard = true`.
- **Settings:** a "Daily leaderboard" card: change username, show / hide me on the leaderboard. Hiding keeps the username.
- **Moderation:** admin can clear a username (sets `username = null`, `leaderboard = false`); the user can pick a new one in Settings.
- Signed-out players never appear.

## 2. All-time leaderboard

- Rows: only users with `leaderboard = true` and a username, with ≥ 1 finished daily game.
- Order: total wins desc → average guesses on wins asc → the day the user reached that win total asc (earlier first) → username asc.
- Columns: rank, username, wins, played, win %, average guesses (1 decimal), current streak (info only, not a sort key).
- Computed in SQL from `daily_plays` (finished rows) joined with `users`, cached in memory for 60 s (invalidated on a username / opt-in change).
- `/daily`: a **Leaderboard** button next to Stats opens a dialog (same component pattern: centred modal on desktop, bottom sheet ≤ 640 px) with the top 50; when signed in and opted in, "your place" is shown below if outside the top 50; when signed in and not opted in, a line with a button to join (opens the same username prompt).
- Practice and anonymous games never count.

## 3. Admin "Daily" tab

New tab in the existing admin panel (`web/src/components/admin/`, `server/admin/`), admin-only like the rest.

- **Day view** (day selector, default today):
  - the day's answer (name, card), number of finished games and wins, signed-in vs anonymous, win %, guess distribution (BarChart), top 10 players guessed that day (name + count);
  - table of signed-in games: user (email + username if any), guesses as player names in order, result, guesses used, finished time. Sortable / paged with `DataTable`.
- **Leaderboard view:** the full ranking including users who did not opt in (marked "hidden"), with a **Clear username** action.
- **Anonymous counters** (new, aggregate only, no IP, no identifiers): table `daily_anon_stats` (`day` pk, `finished`, `won`, `dist` jsonb `[n1..n5]`) and `daily_guess_counts` (`day`, `asset_id`, `count`, pk `(day, asset_id)`), incremented by the server when it applies a signed-out daily guess (guess counts) and when that guess finishes the game (finished / won / dist). Signed-in games are counted from `daily_plays`. Practice is not counted.
- Endpoints under the existing admin API, documented in `docs/api.md`.

## 4. Player-base visibility

- `/daily`: a permanent info line under the title (Phosphor icon, not emoji, `--ink-2`, not a dismissible banner): "**{count}** players in the FC Solver database so far. The game only uses players FC Solver has collected; the more people use FC Solver, the more players appear." `{count}` = length of the autocomplete list (no extra request), formatted per locale.
- Search with no result: replaces "No player found" with "Not in the FC Solver database yet. It grows as more people use FC Solver."
- Landing teaser: a small line under the demo: "{count} players collected so far, and growing" (count from `GET /api/daily` — add `players: number` to its response; hidden when the call fails).
- The existing grid note and "How to play" source text stay.

## 5. Rules

- Every string through `t()` in en / ro / it (RO `_one` / `_few` / `_other`, IT `_one` / `_other` where counts appear); player names stay as EA sends them; usernames are shown as typed.
- Privacy policy (`web/src/legal/docs.ts`, all languages): a line that an opted-in username, wins, games and streak are public on the leaderboard, and can be hidden or changed in Settings. Bump `UPDATED`.
- New or changed endpoints in `docs/api.md`. Per-IP limit on username changes.
- UI per `DESIGN.md`; check desktop and 390 px; `prefers-reduced-motion`.

## 6. Testing

- Unit (`npm test`): username validation; leaderboard ordering (ties on wins, avg guesses, reach day); anonymous counter merge; admin day aggregation (pure parts).
- Typecheck, i18n:check, build; browser check of the prompt, Settings card, leaderboard dialog, admin tab, info line and empty search at desktop and 390 px.

## Out of scope

- "Today" and "streak" leaderboards (user ruling: all-time only).
- Profanity filtering beyond admin moderation.
- Showing leaderboard names anywhere outside `/daily` and admin.
