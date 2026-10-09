# Points, invites and Daily: abuse audit (2026-10)

Internal audit of the `dev` branch at `ff32917`. Scope: invite points, gift codes, Daily streak points, Daily state / Practice tokens, persona linking, per-IP limits, admin visibility. Code was read; no requests were sent to production or EA. Pure-logic evidence is in `server/abuse.test.ts` and `server/daily/abuse.test.ts`. Tests marked `{ todo: 'audit: <id>' }` assert the weak behaviour as it is today. Once a finding is fixed, flip the assertion and drop the `todo`.

Severity is about how much free Premium can be had, or how far the leaderboard can be faked, with little effort.

## Summary

| id | title | severity |
|---|---|---|
| D1 | The Daily answer can be read before the signed-in game (signed-out loss or an alt account) | high |
| P1 | Daily streak points need only a Clerk account, and gift codes make points transferable (Sybil farm) | high |
| R1 | `CF-Connecting-IP` is trusted from any peer: going around Cloudflare to the origin defeats every per-IP limit | medium (check firewall) |
| A1 | Point grants, redeems, spends and gift transfers leave no event and cannot be reversed by an admin | medium |
| P2 | Self-invite: the code owner earns a point from their own EA persona via a takeover | low |
| R2 | Limits key on the exact IP (IPv6 /64 rotation) and only per IP on signed-in routes; redeem errors leak code existence | low |
| L1 | Leaderboard usernames can impersonate staff, and renames are unlimited | low |
| I1 | Signed-out state tokens are stateless: replay, branching, and anonymous stats anyone can inflate | info |

## Findings

### D1 — The Daily answer can be read before the signed-in game (high)

- **Where:** `server/daily/service.ts:148-156` (signed-out branch: `state` null = new game, no tie to the client); `server/daily/game.ts:42` (a finished view carries `answer`); `server/daily/routes.ts:41-44` (signed-out and signed-in share the endpoint).
- **Scenario:** In a private window, the attacker makes 5 wrong signed-out guesses. The fifth response contains the full answer (`answer.id`, name). They then make one signed-in guess with that id: a win in 1 guess. This works every day, takes 6 requests, and is easy to script. A second Clerk account that loses on purpose gives the same result. Effects: a guaranteed win streak, so guaranteed streak points (see P1), and the top of the leaderboard (`avgGuesses` 1.0 beats every honest player with the same win count; `server/daily/leaderboard.ts:24-28`).
- **Evidence:** tests `audit D1: a signed-out loss reveals today's answer…` and `audit D1: one-guess wins every day top the leaderboard…` (`server/daily/abuse.test.ts`).
- **Fix:** Wordle-style games can't fully hide the answer from people who are signed out, so fix the reward instead of the secrecy:
  1. Pay streak points only for wins in at least 2 guesses, or only if the signed-in game started before today's answer had been revealed N times. Cheaper: flag wins in 1 guess (see A1).
  2. Hold the signed-out answer back until the next drop, showing tiles only, or reveal it only to signed-in users after they finish. This removes the free oracle.
  3. Take one-guess wins out of the public leaderboard ranking, or cap their weight, and give admins a "1-guess win rate" column.

### P1 — Daily points need only a Clerk account; gift codes transfer them (high)

- **Where:** `server/db/daily.ts:62-77` (`guessDaily` grants `daily_streak` points with no persona, plan or account-age check); `server/daily/routes.ts:43` (`optionalSiteUser`, no `X-Persona`); `server/db/referrals.ts:100-117` (`spendPoints` with `gift: true` mints a code); `server/referrals.ts:46-55` (`checkRedeem` only refuses the owner, so any other account can redeem a gift); `server/referrals.ts:63-67` (gifts stack with no cap).
- **Scenario:** Create N Clerk accounts (disposable emails; how hard this is depends on the Clerk sign-up settings). Each wins every day using D1 and earns 4 points per 30 days (7 → +1, 14 → +1, 30 → +2, repeating). Each farm account turns its points into gift codes (5 points = 30 days) and redeems them on the main account. Two farm accounts are enough for permanent Premium; more accounts produce gift codes to resell. No EA persona is involved, so the `persona_links` limit of 3 and the one-invite-point-per-persona index never apply.
- **Evidence:** tests `audit P1: a 30-day win streak yields 4 points…`, `audit P1: a gift code bought with points is redeemable by any other account`, `audit P1: gifts stack on Premium without limit`.
- **Fix:** Grant `daily_streak` points only to users with at least one linked EA persona. Pay at most one Daily point grant per EA persona per day across all accounts linked to it (unique `(persona_id, ref)` where `reason = 'daily_streak'`, with the persona stored on the grant). Also do one or more of: require a linked persona to spend points or redeem a gift; cap gift redemptions per receiver (for example, 2 per 30 days); refuse a gift whose owner and receiver share a persona in `persona_links`.

### R1 — `CF-Connecting-IP` trusted from any peer (medium, depends on the origin firewall)

- **Where:** `deploy/sbc-builder.conf:10` (`RemoteIPHeader CF-Connecting-IP` with no `RemoteIPTrustedProxy`/`RemoteIPInternalProxy`); `server/index.ts:67` (`trustProxy: ['loopback', 'uniquelocal']`).
- **Scenario:** The Cloudflare path holds. Cloudflare overwrites `CF-Connecting-IP`; Apache appends the real IP to `X-Forwarded-For`; Fastify takes the rightmost untrusted address, which is the real client, so a forged `X-Forwarded-For` has no effect. The weak point is the origin itself. If it is reachable directly on port 80 (the IP can leak through DNS history or other vhosts), mod_remoteip accepts any `CF-Connecting-IP` value: with no proxy list configured, every peer is trusted. A different value per request then gives a fresh bucket for `guessLimit`, `redeemLimit`, `proofLimit` and `apiLimit`. A private value such as `10.0.0.1` also makes Fastify read further left into an `X-Forwarded-For` the attacker wrote. The impact on points is indirect: dictionary attacks on admin promo codes with custom names (`normalizeCode` allows 4-20 characters) and unthrottled Daily scripting.
- **Evidence:** configuration review; `docs/deploy.md` does not mention restricting the origin to Cloudflare IP ranges.
- **Fix:** Add `RemoteIPTrustedProxy` with the published Cloudflare ranges (IPv4 and IPv6) to the vhost, and firewall port 80 to those ranges (or use Cloudflare Tunnel / Authenticated Origin Pulls). Document this in `docs/deploy.md`.

### A1 — No abuse signals, no reversal (medium)

- **Where:** `server/db/events.ts:6` (`EventType` = `solve | sync | ea_error | ea_day` only); `server/db/schema.ts:136` (`reason 'admin'` is documented, but nothing writes it); `server/admin/routes.ts` (no endpoint to adjust points or revoke grants; only codes can be disabled at `:55`, and plans set at `:97`).
- **Scenario:** The P1/D1 farm leaves no trace in the event log. An admin can piece it together only by hand: Users → points / invitedBy, Codes → gift owner and redeemer emails, Daily → per-user guesses. Even when farming is spotted, points can't be zeroed and Premium already granted can only be overwritten by hand. Gift codes already handed out keep working unless disabled one at a time.
- **Fix:** Add event types `redeem` (code kind, owner, receiver), `points` (delta, reason, ref) and `daily_win` (guesses), each with a salted hash of the IP (`/24` or `/64`) so linked accounts can be grouped. Add an admin "adjust points" action that writes `reason 'admin'` rows, and a revoke that also disables that user's unredeemed gift codes. In admin Users, flag accounts with points and no persona, accounts that receive many gifts, and accounts with a high 1-guess win rate.

### P2 — Self-invite through one's own persona (low)

- **Where:** `server/db/referrals.ts:83-95` (`grantPendingInvite`); `server/index.ts:413-433` (link / takeover); `server/referrals.ts:50` (`codeOwn` compares only user ids).
- **Scenario:** User A owns persona P. A creates account B and redeems A's invite code. B links P using A's own EA session (a takeover with a SID, which A can always provide). A then takes P back. Result: A gets 1 point and B gets 7 days. This is bounded: the point is unique per persona forever (`point_ledger_invite_persona`), and P can reach at most 3 accounts (`PERSONA_USER_LIMIT`), so each persona yields 1 point plus 2 × 7 days. Points are granted only when an EA persona is linked. They can't be frozen, and an unlink does not revoke them (see A1).
- **Fix:** In `grantPendingInvite`, skip the inviter's point (and optionally the invitee's 7 days) when `code.ownerId` appears in `persona_links` for that persona, or when the link was a takeover (`previousUserId` is set).

### R2 — Limit keys and the redeem oracle (low)

- **Where:** `server/limits.ts:10-25` (the key is the exact `req.ip`); `server/index.ts:73,262` (`redeemLimit` per IP, even though the route is signed in); `server/referrals.ts:46-54` (`codeUnknown` vs `codeFull`/`codeExpired`/`codeDisabled`).
- **Scenario:** One IPv6 /64 holds 2^64 addresses, each with a fresh 10/min redeem bucket. Signed-in routes don't limit per user, so a script that rotates addresses is not slowed. The distinct error codes tell the attacker whether a guessed code exists. Random 6-character codes (32^6 ≈ 1.07e9) stay infeasible to guess; custom-named promo codes do not.
- **Evidence:** test `audit R2: IPv6 addresses of one /64 get separate rate-limit buckets`.
- **Fix:** Key on the `/64` for IPv6. On signed-in routes, also limit per `userId` (redeem: about 20 per day). Return one generic `codeInvalid` for unknown, disabled, expired and full codes. Keep admin promo codes random, or add a random suffix.

### L1 — Staff-looking usernames, unlimited renames (low)

- **Where:** `server/daily/username.ts:2-8`; `server/daily/routes.ts:61-80` (`profileLimit` 20/min per IP, no cooldown).
- **Scenario:** A user takes `admin`, `FCSolver` or `support` on the public leaderboard and uses it for phishing ("DM support for free Premium codes"). Renaming freely also lets a user hold names or churn the leaderboard.
- **Evidence:** test `audit L1: staff-looking usernames are accepted`.
- **Fix:** Reserve names containing `admin`, `support`, `fcsolver`, `fc.solver`, `moderator` or `staff`, ignoring case and `._-`. Add a rename cooldown, for example once per 7 days. Admins can already clear a name (`/api/admin/daily/users/:id/clear-username`).

### I1 — Signed-out tokens are stateless (info)

- **Where:** `server/daily/tokens.ts:25-40`; `server/daily/service.ts:149-155`; `server/db/daily.ts:82-96` (`recordAnonGuess`).
- **Scenario:** A token with 4 misses can be replayed with any number of different fifth guesses, and `state: null` starts a new game. Signed-out play earns nothing, so the only effect is on admin numbers: `daily_anon_stats` and `daily_guess_counts` can be inflated by anyone at 40 guesses/min/IP (more with R1/R2). The admin Daily summary is therefore not reliable.
- **Evidence:** test `audit I1: a signed-out state token can be replayed…`.
- **Fix:** Accept this by design and label the anonymous stats "unverified" in admin. Optionally, count a signed-out game only when its first guess arrives with `state: null` and a per-IP daily cap is not exceeded.

## Checked and holding

- **Concurrent redeems of one code:** the code row is locked `FOR UPDATE` (`server/db/referrals.ts:52`). `redemptions_code_user` and `redemptions_one_invite` are unique indexes (migration `0008`). A unique-index race is mapped to `inviteUsed`/`codeUsed`. Gift codes have `maxUses: 1`, checked under the lock.
- **Double invite grant:** `grantPendingInvite` locks the `pending` row. A parallel call re-checks the `WHERE` after the commit and finds nothing. The inviter's point is unique per persona forever (`point_ledger_invite_persona`, `onConflictDoNothing`).
- **Overspending points:** `spendPoints` takes a per-user advisory lock, then reads the balance inside the transaction (`server/db/referrals.ts:102-104`).
- **Double Daily guess or point:** `guessDaily` inserts the row, then locks it `FOR UPDATE`. `point_ledger_daily` is unique on `(user_id, ref = day)` (migration `0010`), so the 7/14/30 milestones pay once per day and a streak counts only consecutive won days (test `holds: a streak only counts consecutive won days…`).
- **State tokens:** HMAC-SHA256 over the whole body, compared in constant time. `k` binds a token to its day (`d<day>`) or Practice game (`p<id>`). Yesterday's token, a Practice token and spliced tokens are refused. Size and guess count are capped (tests in `server/daily/tokens.test.ts` and `holds: yesterday's state token…`).
- **Practice:** AES-256-GCM with a random IV; `exp` is 24 h and enforced. The answer is never sent in clear before the game ends. Practice awards no points (test `holds: a practice token expires…`).
- **Stale-day guesses:** `staleDay` refuses a guess sent for another day number (`server/daily/service.ts:137`).
- **Persona proof:** a persona gets an account only through a real EA `/usermassinfo` with a SID (`server/accounts.ts:143-171`). A taken persona moves only with a fresh SID. The 3-accounts-ever limit is enforced before any EA call (test `holds: one EA persona links to at most 3…`).
- **Invite timing:** invite points and the invitee's 7 days are granted only once the invitee links an EA persona. A redemption with no link stays `pending` forever.
- **Spoofed `X-Forwarded-For` through Cloudflare:** has no effect. Cloudflare appends the real IP, Apache appends `CF-Connecting-IP`, and Fastify takes the rightmost untrusted hop. The app port is bound to `127.0.0.1` (`docker-compose.yml`). See R1 for the direct-origin path.
- **Answer pick:** `randomInt` over the pool, stored once per drop (`onConflictDoNothing` on the day), and never sent before the game ends for that client.
