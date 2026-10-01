# Evolution training alerts — design

Date: 2026-10-01. Status: approved in chat, spec for review.

## Goal

Some EA FC 27 Evolutions ("Academy" in the API) have timed levels: the player is sent to a "Training Camp" and the next level is claimable only after a fixed time (e.g. 12 h). FC Solver tracks these timers and, for **Premium** users only, sends an email when a player's training is over ("{player}'s evolution {evo} has finished training. Open the EA web app to claim it."), and shows the tracked evolutions on a new **Evolutions** screen.

Only evolutions with such a timer are tracked; evolutions without one are ignored. Read-only toward EA as always: FC Solver never claims, starts or slots anything.

Out of scope: claiming / starting from FC Solver, evolution requirements or "which club player fits an evolution", free-plan access, push / browser notifications, evolutions without a timer.

## What EA sends (observed 2026-10-01)

Endpoint: `GET /ut/game/fc27/academy/hub/v2?offset=0&count=20&sortOrder=asc&slotStatus=STARTED` (the web app's Evolutions screen). The web app also gets an academy response shaped the same way (plus `categories`, `activeSlotLimit`) after a level claim.

Per slot (`slots[]`): `id` (slot id), `slotName`, `endTime` (evolution expiry, unix s), `timed: true` for timed evolutions, `player` (`assetId`, `rating`, …), `realPlayerId` (the club item id), `levels[]` with `level`, `levelState` (`COMPLETED` / `IN_PROGRESS` / `NOT_STARTED`) and `objectives[]`. Top level: `rewardReadySlotIds[]`.

A timed objective ("Send your Player to Training Camp."):
- running: `state: "IN_PROGRESS"`, `currentProgress: 1790852979` = training **start**, unix seconds (UTC), `multiplier: 43200` = duration in seconds;
- finished: `state: "COMPLETED"`, `currentProgress === multiplier`; the level stays `IN_PROGRESS` until claimed and the slot is in `rewardReadySlotIds`;
- level not reached yet: no `state`, no `currentProgress`.

So `endsAt = currentProgress + multiplier` (unix seconds). The web app's "Training Time 11 Hours 58 Mins" matches this. All values are epoch seconds: no time zone or DST handling is needed anywhere on the server; only the browser formats times, in the viewer's local zone.

## 1. Parsing (pure, `server/evos.ts` + `server/evos.test.ts`)

`parseAcademy(response, nowSec)` → `EvoTraining[]`:
- slots with `timed === true` only;
- for each level with `levelState === "IN_PROGRESS"`: the objective with `multiplier > 0` and a timestamp-like `currentProgress` (`≥ 1_000_000_000`) and `state === "IN_PROGRESS"` → `{ slotId, level, levelCount, slotName, itemId: realPlayerId, assetId, rating, startedAt, endsAt, slotEndsAt }`;
- the same level with the objective `COMPLETED` (or slot in `rewardReadySlotIds`) → `ready: true` (no `startedAt` / `endsAt` needed);
- sanity: drop when `startedAt > now + 300` (clock skew allowance), `multiplier > 7 days`, or `endsAt > slotEndsAt` when `endTime` is set. Unknown shapes → nothing (never throw).
- `isFullList(path, query)`: true for `hub/v2` with `slotStatus=STARTED`; then the parsed list replaces the stored one for that persona (a missing slot = claimed or expired → deleted). Any other academy response only upserts the slots it contains.

## 2. Sources

- **Relay (free):** `WATCHED_PATH` in `server/events.ts` accepts `academy/...` paths; any relayed response with a `slots` array goes through `parseAcademy`. The user sends players to Training Camp and claims from the web app, so the timer is seen at the moment it starts. Extension: the watched-path list in the extension gets the academy path too.
- **Daily job:** a new read-only recipe `academy` in `extension/hook.js` (one `GET academy/hub/v2?offset=0&count=20&sortOrder=asc&slotStatus=STARTED`, follow `offset` while a page is full), `JobKind` gains `'academy'`, enqueued with the scheduled daily sync in `server/sync.ts` only for personas whose owner is Premium. Metered like every other call. Catches training started from the console / Companion app. Extension version bump + `release.json`.
- Legacy (server-side) mode: not added; it is being removed.

## 3. Storage (Postgres)

- New table `evo_trainings`: `persona_id`, `slot_id`, `level`, `slot_name`, `level_count`, `item_id`, `asset_id`, `rating`, `started_at`, `ends_at` (timestamptz, nullable for `ready` rows seen only after finishing), `ready` (bool), `notified_at` (nullable), `tries` (int), `updated_at`. Primary key `(persona_id, slot_id, level)`: one email per level.
- Upsert keeps `notified_at` / `tries`; a row already `ready` with no `ends_at` is never emailed (we did not see it running, so no "just finished" moment).
- `users` gains `lang` (`'en' | 'ro' | 'it'`, default `'en'`, saved when the site language changes) and `evo_emails` (bool, default `true`).
- Migration via `npm run db:generate`.

## 4. Scheduler + email

- `server/mail.ts`: `sendMail({ to, subject, html, text })` via `fetch('https://api.resend.com/emails')`, no SDK. Env: `RESEND_API_KEY`, `EMAIL_FROM` (e.g. `FC Solver <noreply@mario-theodor.ro>`; domain verified in Resend). Without a key: log the mail instead, so local dev works.
- `server/evo-alerts.ts`: every 60 s (next to `autoSyncAll` in `server/index.ts`) select rows with `ends_at ≤ now`, `ends_at > now − 24 h` (no flood of stale mails after downtime), `notified_at IS NULL`, `tries < 3`. For each: owner via `personas` → `users`; send only if tier is Premium (`plan.ts`), `evo_emails` is on and email is non-empty; else mark `notified_at` (skipped). On send failure `tries++`. Player name: from the cached club item `itemId`, else the players meta by `assetId`, else "your player".
- Email in the user's `lang`, strings in `server/mail-text.ts` (en / ro / it). Body: player, evolution name, level reached, link to the EA web app (`https://www.ea.com/ea-sports-fc/ultimate-team/web-app/`), link to the Evolutions screen, unsubscribe link.
- Unsubscribe: `GET /api/evos/unsubscribe?u=<userId>&t=<HMAC-SHA256(userId)>` with a server secret (`EMAIL_SECRET`), turns `evo_emails` off, returns a small translated page. Also an `List-Unsubscribe` header.

## 5. API

- `GET /api/evos` (Premium only, else 403 `msgCode: err.premiumOnly`): tracked rows for the active persona `{ slotId, level, levelCount, slotName, itemId, assetId, rating, startedAt, endsAt, ready, fetchedAt }`, plus the user's `evoEmails`.
- `PUT /api/me/prefs { lang?, evoEmails? }`: saves the preferences.
- `docs/api.md` updated.

## 6. UI

- New sidebar item / route `/dashboard/evolutions` (via `route.ts` `navigate`), between Club and Settings.
- Premium: list of cards (EA card art like the Club screen, evolution name, "Level x of y", status in text + icon: "In training · 11 h 58 m left" with a live countdown, or "Ready to claim"), sorted by `endsAt`. Countdown updates every 30 s, `endsAt * 1000` against `Date.now()`, displayed end time formatted in the browser's local zone. Empty state explains that timers appear after opening Evolutions in the EA web app or after the daily sync.
- Free: same screen with a locked state and the Premium upsell (no data fetched).
- Settings: toggle "Email me when an evolution's training is over" (Premium only).
- i18n en / ro / it (`npm run i18n:check`), 390 px check, `prefers-reduced-motion`, state never by color alone.

## Testing

- Unit (`npm test`): `parseAcademy` against both observed responses (running timer, ready-to-claim, untimed slot ignored, bad timestamps dropped), `isFullList`, due-row selection rule (pure), unsubscribe token sign/verify, email text per language.
- Typecheck + build; relay a real academy response in the browser and check the row, the screen and a logged email (no key) / a real email to the owner's address.
