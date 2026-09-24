# Free and Premium plans (sub-project 3, part 1)

Date: 2026-09-24. Status: approved design, awaiting spec review.

## Context and scope

Users exist since sub-project 2 (`users` keyed by Clerk id, `server/auth.ts`). Every signed-in user can solve without limit today. This part adds two plans, set by hand from the admin screen:

- **Free**: 20 solves per rolling 7-day window. Per-SBC settings and the per-SBC player exclusion stay available; global solver settings are locked.
- **Premium**: unlimited solves + global solver settings.

Goals:
- Admin can switch any user between Free and Premium, with an optional end date, see their quota and reset it.
- The server enforces the quota; the site shows it next to the Solve button, in a Settings card, on the landing page and in the Terms.

Non-goals: payment (Stripe, 5 EUR/month) — a later part that writes the same columns; per-persona quota; changing how solves run.

## Rules

- Quota is per user (all their EA personas share it).
- Only a solve that returns `found: true` costs a token. "No solution", errors and 4xx cost nothing.
- Every solver run counts the same: first solve, "Cheaper?" (deep), "Try with SBC storage", re-solve after excluding a player.
- Window (Claude-style): starts at the first counted solve when no window is open; resets 7 days after its start (`used` back to 0, window closed until the next counted solve).
- Limit: `FREE_WEEKLY_SOLVES` in `.env`, default 20.
- Effective plan: `premium` if `plan = 'premium'` and (`premium_until` is null or in the future); otherwise `free`. Admins (`ADMIN_EMAILS`) are always premium.
- Global settings lock is UI-only: the site already sends merged options, and a free user may set the same values per SBC, so the server does not tell them apart.

## Schema (Drizzle migration on `users`)

| Column | Type | Default |
|---|---|---|
| `plan` | text, `'free' \| 'premium'` | `'free'` |
| `premium_until` | timestamptz, nullable | null (no end) |
| `quota_start` | timestamptz, nullable | null (no open window) |
| `quota_used` | integer | 0 |

## Server

- `server/plan.ts`, pure and unit-tested (`plan.test.ts`):
  - `effectivePlan(row, isAdmin, now)` → `'free' | 'premium'`.
  - `quotaState(row, limit, now)` → `{ used, limit, resetsAt | null }` (expired window reads as `used = 0`, `resetsAt = null`).
- DB helpers in `server/db/users.ts`: `planFor(userId)` (row + admin + quota state), `countSolve(userId, now)` — one atomic `UPDATE` that restarts an expired/empty window (`quota_start = now, quota_used = 1`) or increments, returning the new state. `setPlan(userId, tier, premiumUntil)`, `resetQuota(userId)` (`quota_start = null, quota_used = 0`).
- `/api/solve`:
  - before the solver: a free user with `used >= limit` gets **403** `{ code: 'quotaExhausted', params: { resetsAt } }` (translated as `err.quotaExhausted`).
  - after a `found: true` result for a free user: `countSolve`; the response carries `quota` (`{ used, limit, resetsAt }` or `null` for premium).
  - Two parallel solves right at the limit may overshoot by one; accepted.
- `/api/me` adds `plan: { tier, premiumUntil, quota }`.
- Admin (behind `requireAdmin`):
  - `POST /api/admin/plan { userId, tier: 'free' | 'premium', premiumUntil: string | null }`.
  - `POST /api/admin/quota-reset { userId }`.
  - `adminStats().userList[]` adds `plan`, `premiumUntil`, `quota`.
- `docs/api.md` updated for all of the above.

## Web

- **Solve bar** (`App.tsx` set screen): a free user sees "14 / 20 solves left · resets in 3d 4h" with an (i) button opening a short explanation (what costs a token, the 7-day window, what Premium adds). At 0 the Solve / Cheaper / storage / exclude-and-resolve actions are disabled and the reset time is shown. Premium sees "Premium · unlimited". The counter updates from `solve().quota`; a `quotaExhausted` error refreshes it from `/api/me`.
- **Settings**: new "Plan" card beside Account / EA requests: tier, premium end date, tokens left, reset time, what Premium includes, and "Premium: coming soon" (no purchase yet). For a free user the global settings card stays visible but disabled with a Premium badge; the solver then uses `DEFAULT_OPTIONS`, and global values stored in `localStorage` are ignored (kept, so they return with Premium). Per-set local settings and exclusions are unchanged.
- **Admin, members list** (`AdminView.tsx`): per user a Free/Premium select, an optional "until" date, "12/20 · resets in 2d" and a "Reset quota" button.
- **Landing** (`web/src/landing/`): a Free vs Premium section (20 solves / week vs unlimited + global settings; Premium marked "coming soon").
- **Terms** (`web/src/legal/docs.ts`, EN + RO): a paragraph on plans, the weekly quota and that Premium can be granted or ended by the operator.
- All strings via `t()` in `en.ts` + `ro.ts` (Romanian plurals `_one/_few/_other`), `npm run i18n:check`. Requirement/limit state never by color alone; check 390px.

## Testing

- `npm test`: `plan.test.ts` (effective plan with/without end date and admin, window start, expiry, reset time, limit edge).
- `npm run typecheck`, `npm run build`, `npm run i18n:check`.
- Browser: free user solves until 0 (counter, disabled actions, 403 message), admin switches to Premium (counter gone, global settings unlocked), end date in the past falls back to Free, quota reset from admin; phone width 390px.
