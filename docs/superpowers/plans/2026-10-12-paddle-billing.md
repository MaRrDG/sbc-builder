# Paddle Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recurring Premium (5 €/month, 36 €/year) bought through an inline Paddle checkout on `/dashboard/upgrade`, activated only by signed Paddle webhooks, managed through the Paddle customer portal.

**Architecture:** Paddle is the Merchant of Record. The browser only opens Paddle.js with a price id and server-issued `customData.userId`; Paddle calls `POST /api/billing/webhook`, which verifies the signature, dedupes by `event_id`, and upserts our `subscriptions` row through a pure reducer. `server/plan.ts` gets a `subscription` Premium source read from that row. Provider-specific code stays in `server/billing/paddle.ts` + `web/src/billing/paddle.ts`.

**Tech Stack:** Fastify 5, Drizzle + Postgres, React 19, Paddle Billing v2 API + Paddle.js v2, node:test.

**Spec:** `docs/superpowers/specs/2026-10-12-paddle-billing-design.md`

## Global Constraints

- Premium state changes **only** from verified webhooks (or the admin resync), never from the browser or the checkout success callback.
- No card data, no Paddle API key in the browser; the browser gets only `PADDLE_CLIENT_TOKEN` (public by design) and price ids.
- Billing is fully off (routes 404, no buttons) unless all six env vars are set: `PADDLE_ENV`, `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_MONTH`, `PADDLE_PRICE_YEAR`.
- Every user-facing string through `t()` in en / ro / it (Romanian `_one`/`_few`/`_other`, Italian `_one`/`_other`); server errors carry a `msgCode`.
- Prices shown are the landing ones (`web/src/landing/pricing-rules.ts`), VAT-inclusive; Paddle localises at checkout.
- New endpoints → `docs/api.md`; new external origins → `csp()` in `server/index.ts`.
- UI per `DESIGN.md`: `--go` green only for the primary action; controls 8px radius, containers 14px; check 390px; `prefers-reduced-motion`.

## Review Focus

- Webhooks arriving out of order (an older `subscription.updated` after a newer one) must not roll a subscription back.
- The same webhook delivered twice must not log twice or change state twice.
- A tampered body, wrong secret or 10-minute-old timestamp → 401, nothing stored.
- A user who closes the tab right after paying still gets Premium (webhook only), and a user who pays but whose `customData` is missing is logged for the admin, not lost silently.
- Founders / admins never see a buy button; a subscribed user cannot open a second checkout.

---

### Task 1: Pure billing rules
**Files:** create `server/billing/rules.ts`, `server/billing/rules.test.ts`.
**Produces:**
```ts
export type SubStatus = 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled';
export interface SubRow { id: string; userId: string; customerId: string; status: SubStatus; priceId: string; interval: 'month' | 'year'; currentPeriodEnd: Date; cancelAt: Date | null; eventAt: Date }
export interface PaddleSubEvent { eventId: string; type: string; occurredAt: Date; data: { id: string; status: SubStatus; customer_id: string; custom_data?: { userId?: string } | null; items: { price: { id: string } }[]; current_billing_period?: { ends_at: string } | null; scheduled_change?: { action: string; effective_at: string } | null } }
export function verifySignature(rawBody: string, header: string | undefined, secret: string, now: number): boolean
export function applyEvent(prev: SubRow | null, ev: PaddleSubEvent, prices: { month: string; year: string }): SubRow | null // null = ignore (older than prev.eventAt, or unknown price, or no userId on a new row)
export function subscriptionActive(row: SubRow | null, now: number): boolean // active/trialing & periodEnd>now; past_due until periodEnd+3d
export const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
```
- [ ] tests first (signature: valid, wrong secret, tampered body, `ts` older than 5 min, missing / malformed header; reducer: create, renew moves period end, scheduled cancel sets `cancelAt`, canceled, past_due, older event ignored, unknown price ignored, existing row keeps `userId` when `custom_data` is absent; active: each status + grace edges).
- [ ] implement (`crypto.createHmac('sha256', secret).update(`${ts}:${rawBody}`)`, `timingSafeEqual` on equal-length buffers; header `ts=…;h1=…`, several `h1` allowed).
- [ ] `npm test`, commit `feat(billing): pure Paddle rules`.

### Task 2: Premium source + schema
**Files:** `server/plan.ts` (+ test), `server/db/schema.ts`, migration via `npm run db:generate`, `server/db/billing.ts` (new), `server/plans.ts`.
- [ ] `PlanSource` gains `'subscription'`; `PlanRow` gains `subscriptionActive?: boolean`; order admin → subscription → paid → boost; tests for the order and for lifetime/admin.
- [ ] schema: `users.paddleCustomerId` (unique), `subscriptions`, `billingEvents` as in the spec; `db:generate`, check the SQL.
- [ ] `server/db/billing.ts`: `subscriptionOf(userId)`, `upsertSubscription(row)` (inside a transaction that also inserts `billing_events` with `onConflictDoNothing` and returns whether it was new), `pruneBillingEvents()` (hook into the existing 180-day prune).
- [ ] `server/plans.ts`: `planFor` reads the subscription and passes `subscriptionActive`.
- [ ] tests, typecheck, commit `feat(billing): subscription premium source and tables`.

### Task 3: Routes, Paddle client, CSP, env
**Files:** `server/billing/paddle.ts`, `server/billing/routes.ts`, `server/index.ts` (register, CSP, `/api/me.billing`), `server/db/events.ts` (`billing` type), `docker-compose.yml` (env), `.env.example`, `docs/api.md`, `docs/billing.md` (new), `docs/deploy.md`.
- [ ] `billingConfig()` → null unless all env vars set.
- [ ] routes exactly as in the spec; the webhook route is registered in its own plugin with `addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 256 * 1024 }, …)` so the raw body reaches `verifySignature`; per-IP limit via `server/limits.ts`; `logEvent({ type: 'billing', … })` for subscribed / renewed / canceled / past_due / refunded (amounts + currency only).
- [ ] checkout refusals: `msgCode` `billingOff`, `alreadyPremium` (admin / lifetime), `alreadySubscribed`.
- [ ] CSP additions; admin user detail shows the subscription row + a "Resync from Paddle" button (`POST /api/admin/users/:id/billing-resync`, uses `getSubscription`).
- [ ] typecheck, `curl` the webhook locally with a signed sample body (script in `docs/billing.md`), commit `feat(billing): Paddle webhook, checkout and portal routes`.

### Task 4: Upgrade screen + entry points
**Files:** `web/src/billing/paddle.ts`, `web/src/components/billing/UpgradePage.tsx`, `web/src/route.ts` (+ test: `/dashboard/upgrade`), `web/src/App.tsx` (view, sidebar / locked-screen buttons → upgrade), `web/src/components/PlanCard.tsx` (status + Manage), `web/src/landing/Pricing.tsx` (CTA), `web/src/api.ts`, `web/src/track.ts` (`checkout_open`, `checkout_done`, `trackPayment`), locales en / ro / it, `web/src/styles.css`, `docs/analytics.md`.
- [ ] Paddle.js loader (singleton promise, sandbox switch, `eventCallback` → `checkout.completed`, `checkout.closed`, `checkout.error`).
- [ ] UpgradePage: toggle, `PricePreview` prices with the landing price as fallback, benefits, inline frame, activating state with `/api/me` polling, error state; 390px layout stacks the frame under the summary.
- [ ] PlanCard: subscribed / cancel scheduled / past due / free states; Manage → `/api/billing/portal` in a new tab.
- [ ] i18n check, typecheck, build, browser check in sandbox, commit `feat(billing): upgrade screen with inline Paddle checkout`.

### Task 5: Legal pages
**Files:** `web/src/legal/docs.ts` (refunds doc en / ro / it, terms / privacy / cookies paragraphs, `UPDATED`), `web/src/route.ts` + `server/seo.ts` (`/refunds`), landing footer Legal column.
- [ ] write, i18n check, build, commit `docs(legal): refund policy and Paddle as merchant of record`.

### Task 6: End-to-end sandbox run + docs
- [ ] Sandbox: buy monthly with a Paddle test card, Premium appears; cancel in portal → "ends on"; switch to yearly; replay a webhook from the Paddle dashboard → no double log.
- [ ] `CLAUDE.md` layout line + rule; `task.csv` task 3 state; changelog entry in `shared/changelog.ts` (en / ro / it) only when going live.
- [ ] commit `docs(billing): setup and going live`.
