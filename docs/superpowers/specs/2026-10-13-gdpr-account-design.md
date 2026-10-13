# Account deletion, data export, legal texts — design

Date: 2026-10-13. Status: approved in chat, sections 1-3. Stage 3 of the production-readiness audit fixes (stages 1 EA safety and 2 ops are live).

## Goal

A user can export their data and delete their account from Settings without emailing anyone; deletion waits 7 days (undo by signing in), stops any Paddle renewal and then removes everything we hold about them, sparing an EA account's data only while another FC Solver account still uses it. The privacy policy, terms, checkout and ban FAQ say truthfully what the product does.

Non-goals: refunds (only on request, by the owner in the Paddle dashboard, per the 14-day refund policy), deleting Paddle's own records (Paddle is Merchant of Record and keeps invoices), purging backups early (they expire within 14 days), operator address / PFA (owner adds later; name + contact suffice under GDPR art. 13).

## Owner decisions (2026-10-13)

- EA account data (cache, history, gallery, evos, brick reports) is deleted only when no other FC Solver user currently has that persona linked (`personas.userId` of another user). The leaving user's own links are always removed.
- An active Paddle subscription is cancelled by the server; no automatic refund.
- Deletion is scheduled 7 days ahead and can be undone by signing in.

## Findings (2026-10-13)

- No delete or export endpoint. Unlink persona only deletes the `personas` row (`server/db/users.ts:70`). No FKs have `onDelete`. Several tables reference users without FKs (`persona_links`, `events`, `redemptions`, `codes.ownerId`, `point_ledger`, `daily_plays`, `daily_reminders`).
- Persona-keyed data: `data/accounts/<personaId>/` (account incl. owner email, club, sets, challenges, challengeSquads, ea-requests, gallery ledger), DB `completion_marks`, `completions`, `evo_trainings`, `brick_reports`, `trusted_accounts`. Up to 3 users per persona over time (`PERSONA_USER_LIMIT`), takeover moves `personas.userId`.
- External: Clerk (identity; only `deleteUserExternalAccount` used today), Paddle (cancel only via the customer portal; our only Paddle calls live in `server/billing/paddle.ts`), Resend (evo + Daily reminder emails), Discord (link, bot, boost), Cloudflare (proxy + Turnstile), OpenWebTrack (cookieless, self-hosted), EA CDN (card images loaded by the browser).
- Privacy policy misses Resend, Discord as processor, Turnstile, EA CDN, onboarding survey, invites/points; deletion is "by email within 30 days". Terms do not mention lifetime Premium (Founding 50, invites). The ban FAQ (`landing.faq.ban.a`) reads as a safety promise. UpgradePage links only `/refunds`.

## 1. Account deletion

- Schema: `users.delete_at timestamptz null` (additive migration).
- `POST /api/me/delete` `{ confirm: string }` — `confirm` must equal the localized word (`DELETE` / `ȘTERGE` / `ELIMINA`, the site sends what the user typed; the server accepts any of the three). Sets `delete_at = now() + 7 days` (idempotent: an existing date stays). For every `subscriptions` row of the user with status active/trialing/past_due: Paddle `POST /subscriptions/{id}/cancel` `{ effective_from: 'next_billing_period' }`. Sends a confirmation email (Resend, if configured) with the date and "sign in and press Cancel deletion to keep your account". Logs an event `account` `{ action: 'deleteRequested' }`. Answers the updated `/api/me` fields.
- `POST /api/me/delete/cancel` — clears `delete_at`; for each subscription with a scheduled cancel, Paddle `PATCH /subscriptions/{id}` `{ scheduled_change: null }`. Local subscription state still changes only through the signed webhook (CLAUDE.md rule); the server never writes `subscriptions` from these calls.
- `/api/me` exposes `deleteAt: number | null`; the site shows a top banner "Your account will be deleted on <date>" with "Cancel deletion" on every screen while set.
- Ticker (hourly, also once at start): users with `delete_at <= now()`, one at a time, each step idempotent, each failure → `alert('deletion', …)` (new AlertKind) and retry next hour:
  1. Paddle: cancel immediately (`effective_from: 'immediately'`) any subscription not yet canceled.
  2. Clerk: `users.deleteUser(id)` (404 = already gone, ok).
  3. For each persona the user owns (`personas.userId`) or is linked to (`persona_links`): if no OTHER user currently owns it (`personas.userId` ≠ this user) — delete `data/accounts/<personaId>/` and its DB rows (`completion_marks`, `completions`, `evo_trainings`, `brick_reports`, `trusted_accounts`, `personas`, `persona_links`), and drop it from the in-memory account map / caches (store shared cache, live subscriptions). Otherwise only this user's `persona_links` row.
  4. Delete the user's rows: `link_tokens`, `subscriptions`, `daily_plays`, `daily_reminders`, `redemptions`, `point_ledger` (as `userId`), `codes` owned by the user, then `users`. `point_ledger.ref` / `users.invited_by` pointing at the deleted user are set to null on other rows.
  5. `events`: `user_id = null` for the user; `persona_id = null` where that persona's data was deleted.
  The founder spot is not freed (the count of founders stays).
- Pure helpers with unit tests: which personas to purge (`purgePlan(userId, owners, links)`), the confirm-word check, the 7-day date.

## 2. Data export

- `GET /api/me/export` → `application/json` attachment `fc-solver-<YYYY-MM-DD>.json`, `Cache-Control: no-store`, 1 per minute per user (per-user limiter).
- Contents: `account` (email, lang, plan + source, premiumUntil, quota, founder flag, evoEmails, dailyReminder, onboarding answers, username, leaderboard, discordName, boost dates, createdAt, deleteAt); `subscriptions` (status, price name/interval, period start/end, canceledAt — no Paddle ids); `eaAccounts` (per linked persona: personaName, clubName, linkedAt, club items from cache (id, name, rating, positions, untradeable…, as cached), completions history, evo trainings, today's EA request count); `daily` (plays, reminders); `invites` (own codes, redemptions, points ledger); `events` (own, last 180 days, `data` as stored).
- Never: extension access keys, link tokens, SIDs, Paddle customer/subscription ids, other users' data, shared SBC/challenge catalogues.
- `docs/api.md` documents both endpoints.

## 3. Legal texts, checkout, lifetime Premium, ban FAQ

- `web/src/legal/docs.ts` (en / ro / it, each written, not machine-translated; section ids stay in step — `docs.test.ts`):
  - Privacy "data": add onboarding answers, invites / codes / points, EA request counters, admin event history (180 days), Daily reminders.
  - Privacy "who": add Resend (emails), Discord (account link, bot, server roles, boost), Cloudflare Turnstile (bot check at sign-in), EA's content servers (the browser loads card images from them, so EA sees the IP).
  - Privacy "why": legal basis per purpose — contract (account, solving, Premium), legitimate interest (security, abuse limits, admin history, backups), consent (emails, leaderboard, Discord link).
  - Privacy "keep" / "rights": deletion and export from Settings, 7-day undo, what remains (Paddle invoices, backups ≤ 14 days, anonymous events ≤ 180 days).
  - Terms "paid": lifetime Premium (Founding 50, invites) lasts while FC Solver runs and the account exists; not transferable; ends with account deletion; no cash value.
  - Terms "end": delete from Settings.
  - `UPDATED` = release day.
- `landing.faq.ban.a` (en/ro/it): FC Solver only reads what your own web app tab loads, with a daily cap, and never buys, sells or submits; the risk is low but not zero — EA's rules on third-party tools apply and the choice is yours.
- UpgradePage: Terms and Privacy links next to the refunds link.
- Changelog entry (en/ro/it): delete account and download your data from Settings.

## Rules kept

All strings via `t()` (en/ro/it, Romanian plurals); server errors carry `msgCode`; Paddle calls only in `server/billing/paddle.ts` and never change local subscription state; no EA calls; `docs/api.md`, `docs/billing.md` (cancel calls), `CLAUDE.md` layout line for new files.

## Testing

Unit (pure): purge plan (sole owner / another owner / only a past link), confirm word, delete date, export shape sanitizer (no keys/ids). `npm run typecheck`, `npm test`, `npm run build`, `npm run i18n:check`. Dev (Paddle sandbox, Clerk dev instance): a throwaway account with a linked persona and a sandbox subscription → request deletion (Paddle shows scheduled cancel) → cancel deletion (scheduled cancel removed) → request again → force `delete_at` into the past → ticker runs → Clerk user gone, rows gone, cache folder gone, events anonymized; a second account sharing the persona keeps its data. Export downloaded and checked for absent secrets.
