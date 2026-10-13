# Points abuse fixes and polish — design

Date: 2026-10-13. Status: approved in chat ("continua planu", stage 4 list). Stage 4 of the production-readiness audit (stages 1 EA safety, 2 ops, 3 GDPR are live). Findings: `docs/audit/points-abuse-2026-10.md`. R1 (real-IP proxy list) is already fixed on the host (`deploy/cloudflare-realip.conf`).

## Goal

Free Premium cannot be farmed through the Daily, gifts or self-invites; admins see and can undo point abuse; the leaderboard cannot be topped by reading the answer first. Then small production polish.

## 4a. Abuse fixes

### D1 — Daily answer and rewards
- Signed-out games: a finished view carries no `answer` (null) until the next drop; the client shows the tiles and "the answer is revealed after the next drop — sign in to play for your streak". Signed-in finished games keep the answer. Practice is unchanged (it awards nothing).
- A win in exactly 1 guess keeps the streak going but pays no `daily_streak` points that day.
- Leaderboard ranking counts only wins in ≥2 guesses (wins and average guesses both ignore 1-guess wins). The admin Daily users table gets a "1-guess wins" column.

### P1 — Daily points need an EA account; gifts are capped
- `daily_streak` points only when the user currently owns ≥1 persona (`personas.userId`). The grant stores `persona_id` (the user's lowest owned persona id); a unique index on `(persona_id, ref)` where `reason = 'daily_streak'` makes it at most one Daily grant per EA account per day across all FC Solver accounts (`onConflictDoNothing`). Migration additive (nullable column + partial unique index).
- Gift redemption limits: a receiver redeems at most 2 gift codes per rolling 30 days (`giftLimit`); a gift whose owner and receiver share any persona (current `personas` or `persona_links`, either side) is refused (`giftSameEa`). Both new `msgCode`s translated en/ro/it.

### A1 — Signals and reversal
- New event types: `redeem` `{ kind, codeOwner }`, `points` `{ delta, reason, ref }`, `daily_win` `{ guesses }`. Each carries `ipHash`: first 16 hex of SHA-256(salt + prefix), prefix = IPv4 /24 or IPv6 /64, salt = `IP_HASH_SALT` env (fallback: a hash of an existing server secret; never the raw IP). Same 180-day prune.
- Admin endpoints: `POST /api/admin/users/:id/points` `{ delta: int ≠ 0, |delta| ≤ 1000, note?: string ≤ 200 }` → `point_ledger` row `reason 'admin'`; `POST /api/admin/users/:id/revoke` → zero the balance with one `admin` row and disable the user's unredeemed gift codes. Both logged as `points` events. Admin UI: two actions on the user row/detail.
- Admin Users flags column: `noEa` (points > 0, no owned persona), `gifts` (≥3 gift redemptions received in 30 days), `oneGuess` (≥3 one-guess wins in 30 days). Flags are shown, never acted on automatically.

### P2 — Self-invite
- `grantPendingInvite` skips the inviter's point when the code owner is or was linked to that persona (`personas` or `persona_links`). The invitee's 7 days stay.

### R2 — Limits and redeem oracle
- `server/limits.ts` keys IPv6 on its /64 (IPv4 unchanged).
- Redeem also limited per user: 20 per day.
- Unknown, disabled, expired and full codes all answer `codeInvalid` (old codes removed from locales if unused). `codeOwn`, `inviteUsed`, `codeUsed` stay (they reveal nothing new).

### L1 — Usernames
- Reserved: a name containing `admin`, `support`, `fcsolver`, `moderator`, `staff`, `official` after lowercasing and removing `._-` → `usernameReserved`.
- Rename cooldown 7 days: `users.username_changed_at`; setting the first name or clearing is free; changing an existing name within 7 days → `usernameCooldown` with the date. Admin clear is unaffected.

### I1 — Anonymous stats
- Admin Daily summary labels signed-out numbers "unverified" with a short tooltip. No other change.

### Tests
Flip every `{ todo: 'audit: …' }` test in `server/abuse.test.ts` and `server/daily/abuse.test.ts` to assert the fixed behaviour (R1's stays a note if it is config-only). Pure helpers get unit tests: ip prefix + hash, gift checks, username reserved/cooldown, leaderboard filter, streak points on 1-guess wins.

## 4b. Polish

- CSP: read the prod `[csp]` log lines (`docker logs`), add any legitimate missing origin, then an env switch `CSP_ENFORCE=1` sends `Content-Security-Policy` instead of `-Report-Only`. Enabled on dev only; prod stays report-only until checked on dev.
- Extension minimum version: `extension/release.json` stays the changelog; the server exposes `minExtension` (= `1.0.0`) in `/api/hello`; an older client-mode extension gets the existing update notice as blocking ("update required"). No change to the extension itself.
- The served extension zip drops `localhost` / `127.0.0.1` entries from `host_permissions` and `externally_connectable`/content-script matches when the public origin is not localhost.
- Landing pricing stays static (no Paddle.js on the public page: third-party script on every visit).
- `server/squad.ts` unit tests for rating, chemistry and `isRequirementMet` on fixed squads (values checked against the web app formulas already ported; tests only, no formula change).
- Prune: cached EA accounts (`data/accounts/<id>/`) whose persona has no owner and no activity for 90 days are deleted by the daily ticker (DB rows as in the deletion purge, persona-keyed only). Logged.
- Docs: `docs/api.md`, `docs/architecture.md`, `docs/deploy.md` (CSP switch, `IP_HASH_SALT`), `CLAUDE.md` layout line, audit doc statuses.
- Not done: lazy-loading Clerk.

## Rules kept
All strings via `t()` (en/ro/it, Romanian plurals); server errors carry `msgCode`; no EA calls; changelog entry only for user-visible changes (Daily signed-out answer, username rules, gift limits) in en/ro/it.
