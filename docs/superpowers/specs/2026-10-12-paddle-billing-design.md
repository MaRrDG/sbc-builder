# Paid Premium with Paddle — design

Task 3 in `task.csv` (payments). Decided with the owner on 2026-10-12.

## Goal

Users can buy Premium inside FC Solver (5 €/month or 36 €/year, recurring) without the owner having a company or a PFA. Paddle is the **Merchant of Record**: it sells to the user, charges and remits VAT, sends receipts, handles refunds and chargebacks, and pays the owner out. The owner declares the payouts as intellectual-property income (to confirm with an accountant; not a code concern).

## Decisions

- **Provider:** Paddle Billing (v2 API, Paddle.js v2). Lemon Squeezy is the fallback, so the server keeps provider code behind one small module (`server/billing/paddle.ts`); the rest of the app only sees our own subscription rows.
- **Plans:** two Paddle prices on one product "FC Solver Premium": monthly 5 €, yearly 36 €. Prices are VAT-inclusive as shown on the landing (Paddle "tax mode: internal" / price incl. tax); Paddle localises currency and tax at checkout.
- **Checkout:** **inline** Paddle checkout embedded in our own screen `/dashboard/upgrade` (plan picker + benefits left, Paddle frame right). Sign-in required first. No card data ever touches our server.
- **Management:** "Manage subscription" in Settings opens a Paddle customer portal session (cancel, change card, invoices, switch plan).
- **Environments:** sandbox on dev / locally, live on prod, chosen by env vars only.
- **Refunds:** handled by Paddle; our policy: full refund on request within 14 days of a payment (owner may change the wording).

## Premium rules (server/plan.ts)

A new Premium source `subscription`, next to `admin`, `paid` (codes, points, founders, admin grant) and `boost`:

- A subscription counts while: `status` is `active` or `trialing` and `currentPeriodEnd > now`; or `past_due` and `now < currentPeriodEnd + 3 days` (Paddle retries the card); a subscription cancelled "at period end" stays `active` with a scheduled change until the period ends.
- `planSource` order: `admin` → `subscription` → `paid` → `boost`. Days from codes / points / founders keep counting in parallel (no pausing); the Invite page warns that spending points on yourself while subscribed runs them down at the same time (gifts unaffected).
- Lifetime Premium (founders, `plan = premium` without an end) and admins don't see upgrade buttons.

## Data (server/db/schema.ts + migration)

- `users.paddle_customer_id` (text, unique, nullable).
- `subscriptions`: `id` (Paddle subscription id, pk), `user_id`, `customer_id`, `status`, `price_id`, `interval` (`month` | `year`), `current_period_end`, `cancel_at` (scheduled cancel, nullable), `event_at` (occurred_at of the newest event applied), `created_at`, `updated_at`. Index on `user_id`.
- `billing_events`: `event_id` (pk, Paddle `event_id`), `type`, `received_at` — idempotency; pruned after 180 days like `events`.
- Admin history (`server/db/events.ts`): new type `billing` (`subscribed`, `renewed`, `canceled`, `past_due`, `refunded`, amount + currency, no card data).

## Server

`server/billing/`:
- `rules.ts` (pure, tested): `verifySignature(rawBody, header, secret, now)` (Paddle-Signature `ts=…;h1=…`, HMAC-SHA256 of `ts:body`, 5-minute tolerance, timing-safe compare); `applyEvent(row | null, event)` → next row or null when the event is older than `event_at`; `subscriptionActive(row, now)`; `intervalOf(priceId, prices)`.
- `paddle.ts`: tiny fetch client (`PADDLE_ENV` → `https://sandbox-api.paddle.com` / `https://api.paddle.com`, Bearer `PADDLE_API_KEY`): `portalUrl(customerId)` (POST `/customers/{id}/portal-sessions`), `getSubscription(id)` (for the admin "resync" button).
- `routes.ts`:
  - `GET /api/billing/config` → `{ env, clientToken, prices: { month, year } }` (public values only; 404 when billing is off).
  - `POST /api/billing/checkout` (auth) → `{ customData: { userId }, email, priceId }` for Paddle.js (`customData.userId` is how the webhook finds the user; the server, not the browser, decides it); refuses admins / lifetime / already subscribed (`msgCode`).
  - `POST /api/billing/webhook` (no auth, raw body, signature required, per-IP limit): records `event_id` (duplicate → 200, nothing done), handles `subscription.created|activated|updated|canceled|past_due|paused|resumed` (upsert row via `applyEvent`), `transaction.completed` (admin log + analytics source of truth), `adjustment.created|updated` (refund / chargeback → log). Unknown types → 200. Always 200 after a valid signature, even when the user is unknown (logged), so Paddle does not retry forever.
  - `POST /api/billing/portal` (auth) → `{ url }`.
- `/api/me` gains `billing: { subscribed, interval, status, periodEnd, cancelAt } | null`.
- `server/index.ts` CSP: `script-src https://cdn.paddle.com`, `frame-src https://buy.paddle.com https://sandbox-buy.paddle.com`, `connect-src` / `img-src` as the `[csp]` log demands during the sandbox test.
- Env: `PADDLE_ENV` (`sandbox` | `production`), `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_MONTH`, `PADDLE_PRICE_YEAR`; compose forwards them. Billing is off (no buttons, routes 404) while any is missing.

## Web

- `web/src/billing/paddle.ts`: loads `https://cdn.paddle.com/paddle/v2/paddle.js` once, `Paddle.Environment.set('sandbox')` when needed, `Paddle.Initialize({ token, eventCallback })`.
- `/dashboard/upgrade` (`components/billing/UpgradePage.tsx`, route `upgrade` in `route.ts`): monthly / yearly toggle (monthly preselected, same prices as the landing), localized prices from `Paddle.PricePreview`, benefits list (same as the landing Premium card), inline frame (`displayMode: 'inline'`, `theme: 'dark'`, `locale` = site language, `frameTarget`), `customer.email` prefilled, `customData` from the server. On `checkout.completed`: "Activating…" then poll `/api/me` until `billing.subscribed` (max 30 s, then "it can take a minute" + link to Settings).
- Entry points: landing Pricing "Go Premium" (signed out → sign-in with `next=/dashboard/upgrade`), sidebar Premium crowns / locked screens (Gallery, Objectives, quota exhausted), Settings PlanCard.
- Settings `PlanCard`: when subscribed — plan, next renewal or "ends on …" (cancel scheduled), "past due: update your card", **Manage subscription** (portal). Free — "Go Premium".
- i18n en / ro / it for every string; `npm run i18n:check`.
- Analytics (`track.ts`): `checkout_open` (`interval`), `checkout_done` (`interval`); `owt.trackPayment(amountInCents, currency, transactionId)` on `checkout.completed` (no user data).
- Legal (`web/src/legal/docs.ts`, en / ro / it): new **Refund policy** page `/refunds` (14 days, through Paddle); Terms: Paddle is the reseller / Merchant of Record and the contract for the purchase is with Paddle (Paddle buyer terms); Privacy: Paddle as processor (name, email, country, payment data held by Paddle, never by us); Cookies: Paddle checkout frame sets its own strictly necessary cookies only when it opens. `UPDATED` bumped. Footer Legal column gets "Refunds".

## Docs

`docs/billing.md` (Paddle setup per environment, products / prices, webhook URL + events, sandbox test cards, going live), `docs/api.md` (the four routes + `/api/me.billing`), `docs/deploy.md` (env vars), `CLAUDE.md` (layout line for `server/billing/`, rule: Premium state only from webhooks, never from the browser).

## Testing

Unit (`npm test`): signature (valid, wrong secret, tampered body, old timestamp, malformed header), `applyEvent` (create, renew, cancel at period end, past_due, out-of-order older event ignored, duplicate), `subscriptionActive` (each status, grace edge), `planSource` with a subscription (order, lifetime, admin). Then typecheck, build, i18n check, and an end-to-end sandbox run: buy monthly with a Paddle test card on `localhost` (webhook through a tunnel or the dev server), see Premium, cancel in the portal, see "ends on", switch to yearly.

## Out of scope

Trials, coupons through Paddle (our own codes stay), team / seat plans, a Lemon Squeezy adapter (only the seam), invoices with company VAT ids (Paddle's checkout handles B2B fields itself).
