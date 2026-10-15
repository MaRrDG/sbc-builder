# Pre-launch audit, 2026-10-15

Read-only review of the code on `dev` (1a58949) plus a local solver load check. No critical / high findings.

## Security

### Medium
1. **Shared SBC data poisoning.** `/api/webapp-event` (`server/index.ts:701`) → `events.ts:169-174` → `saveChallenges` (`db/sbcs.ts:37-63`) upserts the shared `challenges` table for any setId from any key holder. A forged `/sbs/setId/<id>/challenges` seeds every other user's first open (`jobs.ts:222-226`); forged brick reports then pass `reportBricks` and win `sharedBricks` uncontested. Fix: only trusted relays (or 2+ personas agreeing) seed others; never overwrite setId / type from an untrusted relay.
2. **Disk / DB fill.** Same route, 2 MB bodies; `challengeSquads/<any id>` (6 raw answers each) and `challenges/<any setId>` uncapped per account. Fix: per-account byte / request budget, accept challengeSquads only for cached challenge ids, cap file count.
3. **`/api/hello` proof limit skipped with any valid key.** `proofLimit` (`index.ts:560`) only counts unknown keys; a valid key + other personaId reaches a real EA `/usermassinfo` call with a supplied SID (`accounts.ts:105-111`). Spamming fills the global window and risks EA throttling the server IP. Fix: `proofLimit` per IP and per key whenever a SID proof runs.

### Low
4. Paddle `customData.userId` is unsigned (`billing/rules.ts:74`); a payer can attach a subscription to another user. Fix: HMAC `{userId, ts}`.
5. Refund / chargeback only logs (`rules.ts:124-127`); Premium stays until Paddle cancels. Decide + document.
6. Any key holder sets the global `content.guid` (`accounts.ts:101`) and can break card art for everyone. Fix: only after a SID proof or once `players.json` loads with it.
7. 3-links-per-persona check races (`index.ts:579` / `:587`). Fix: per-persona advisory lock.
8. No per-user limit on Clerk / Paddle calling routes (`/api/me/discord`, `/api/billing/portal`). Fix: ~10/min per user.
9. CSP still report-only (`CSP_ENFORCE` empty).
10. Admin by stored email (`admin/auth.ts`), verification not re-checked (unconfirmed). Fix: `ADMIN_USER_IDS`.
11. `SITE_ORIGINS` empty in compose → defaults include localhost (`origins.ts:220-221`) (unconfirmed). Fix: set it in prod.

Checked OK: Paddle webhook HMAC / window / dedupe / ordering, persona ownership + takeover, link tokens, IDOR (squads, export, delete, referrals, Daily, Discord), every admin route gated, bot token, Daily tokens, extension origin checks + read-only recipes, no `dangerouslySetInnerHTML`, SEO escaping, export secret filter, `npm audit --omit=dev` 0, no secrets in git.

## Solver capacity

Gate: 2 CP-SAT runs at once, 12 waiting, 20 s wait then 503 `solverBusy` (`server/solver.ts:216`); 4 workers each; 10 s limit (30 s deep). Prod has 8 cores, so 2 slots (cores / 4) is right; more slots only make squads dearer.

Measured (i7, real dumps): easy 0.4 s / 99 MB, medium 3.4 s / 161 MB, hard 10.5 s (limit) / 208 MB, ~40 CPU-s. Past cores / 4 concurrent runs the wall time stays flat but answers get worse (N=16: hard squads +54% median cost, some none at all).

Capacity on prod: ~11 hard solves / min, ~4 / min if all deep. Waiters further than ~4th in line time out after 20 s.

Recommendations: `SOLVER_SLOTS` env (keep 2 on 8 cores); answer "busy" at once with retry-after instead of a 20 s hang, or move solves to async jobs; per-user limit on `/api/solve` (~6/min, nothing-found solves are free today) and limit `deep`; optional `relative_gap_limit` 0.5–1%; hold the gate slot across all passes of an OR challenge.
