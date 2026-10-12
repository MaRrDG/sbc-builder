# Billing (Paddle)

Premium can be bought as a subscription: **5 €/month** or **36 €/year**, VAT included, the same prices as the landing (`web/src/landing/pricing-rules.ts`). Paddle is the **Merchant of Record**: it sells to the user, charges and remits VAT, sends receipts, handles refunds and chargebacks, and pays the owner out. No card data ever reaches our server.

Code: `server/billing/` (`rules.ts` pure rules, `paddle.ts` the only Paddle-specific server file, `routes.ts`), `server/db/billing.ts`, `web/src/billing/`. Endpoints: [api.md](api.md#billing-paddle).

## Rules

- Premium state changes **only** from signed webhooks (or the admin resync). The checkout success callback in the browser only starts polling `/api/me`.
- A subscription counts while `active` / `trialing` and its period has not ended, or `past_due` until 3 days after the period end (Paddle retries the card). A cancel "at period end" stays `active` with `cancelAt` until then.
- `planSource` order: admin → subscription → paid (codes, points, founders, admin grant) → boost. Paid days keep counting under a subscription.
- Admins and lifetime Premium (founders) cannot open a checkout (`alreadyPremium`); a subscribed user cannot open a second one (`alreadySubscribed`).

## Paddle setup (per environment)

Sandbox (`sandbox-vendors.paddle.com`) for dev and local, live (`vendors.paddle.com`) for prod. In each:

1. **Catalog → Products**: "FC Solver Premium" (tax category: standard digital goods / SaaS). Two prices: monthly 5.00 EUR, yearly 36.00 EUR, recurring, **tax: included in price**. Copy the price ids (`pri_…`) into `PADDLE_PRICE_MONTH` / `PADDLE_PRICE_YEAR`.
2. **Developer tools → Authentication**: an API key (`PADDLE_API_KEY`, server only) with read/write on customers (portal sessions) and read on subscriptions; a client-side token (`PADDLE_CLIENT_TOKEN`, public).
3. **Developer tools → Notifications**: a destination `https://<host>/api/billing/webhook`, events `subscription.created`, `subscription.activated`, `subscription.updated`, `subscription.canceled`, `subscription.past_due`, `subscription.paused`, `subscription.resumed`, `transaction.completed`, `adjustment.created`, `adjustment.updated`. Copy its secret key into `PADDLE_WEBHOOK_SECRET`.
4. **Checkout → Checkout settings**: default payment link `https://<host>/dashboard/upgrade`; approve the website domain (live: Paddle reviews the domain, the terms, privacy and refund pages first).
5. **Customer portal**: on (cancel, update payment method, invoices, plan switch between the two prices).

Env (`.env`, forwarded by `docker-compose.yml`): `PADDLE_ENV` (`sandbox` | `production`), `PADDLE_API_KEY`, `PADDLE_CLIENT_TOKEN`, `PADDLE_WEBHOOK_SECRET`, `PADDLE_PRICE_MONTH`, `PADDLE_PRICE_YEAR`. Any one missing → billing off: no buy buttons, `/api/billing/*` answers `404`. Restart the app after a change (`docker compose up -d`).

Environments: dev `sbc-builder.mario-theodor.ro` runs sandbox (the sandbox webhook points there), prod `fc-solver.app` runs live. Locally the sandbox checkout opens on `localhost`; webhooks reach a local server only through a tunnel (e.g. `cloudflared tunnel --url http://localhost:5178`, then a second sandbox notification destination on the tunnel URL), or test the UI locally and the webhook path on dev.

Cloudflare: the webhook is a plain POST from Paddle's servers; keep Bot Fight Mode / WAF challenges off for `/api/billing/webhook` (a challenge page would make Paddle retry until it gives up).

## Sandbox test cards

Any name, any future expiry, CVC `100`:

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | succeeds |
| `4000 0027 6000 3184` | asks for 3-D Secure, then succeeds |
| `4000 0000 0000 0002` | declined |

Never enter a real card in sandbox, never a test card in production.

## Signed test webhook (local)

Sends a body signed with a webhook secret (use a throwaway secret on a local server, never the real one in a shared shell history):

```bash
# usage: send.sh URL SECRET BODY_FILE [unix-ts]
URL=$1; SECRET=$2; BODY=$(cat "$3"); TS=${4:-$(date +%s)}
H1=$(printf '%s:%s' "$TS" "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -hex | sed 's/^.* //')
curl -s -o /dev/null -w '%{http_code}\n' -X POST "$URL" -H 'Content-Type: application/json' \
  -H "Paddle-Signature: ts=$TS;h1=$H1" --data-binary "$BODY"
```

Body example (`subscription.created`; `custom_data.userId` must be a `users.id`):

```json
{"event_id":"evt_local_1","event_type":"subscription.created","occurred_at":"2026-10-12T10:00:00Z","notification_id":"ntf_1",
 "data":{"id":"sub_local","status":"active","customer_id":"ctm_local","custom_data":{"userId":"user_…"},
 "items":[{"price":{"id":"<PADDLE_PRICE_MONTH>"}}],"current_billing_period":{"ends_at":"2099-01-01T00:00:00Z"},"scheduled_change":null}}
```

Expected: `200` (sending it again → `200`, nothing changes), a wrong secret or a timestamp older than 5 minutes → `401`.

## Refunds

Paddle handles them (Paddle dashboard → Transactions → refund, or the user asks Paddle). Our policy (`/refunds`): full refund on request within 14 days of a payment. A refunded or charged-back payment shows in the user's admin history; cancelling the subscription is a separate action (portal or Paddle dashboard).

## Admin

The admin user detail shows the subscription row and the `billing` events (subscribed, renewed, canceled, payment failed, refund / chargeback, unmatched). **Resync from Paddle** replaces our row with what Paddle has now, for a missed or broken webhook. A paid subscription without a known user (`unmatched` event) is found in Paddle by its subscription id and fixed by hand.

## Going live

1. Live Paddle account verified (identity, payout details), domain `fc-solver.app` approved.
2. Live product + prices + API key + client token + notification destination `https://fc-solver.app/api/billing/webhook` (steps above).
3. The six `PADDLE_*` values with `PADDLE_ENV=production` in `/var/www/fc-solver/.env`, `docker compose up -d`.
4. Buy once with a real card, refund it from the Paddle dashboard, check the admin history.
5. Changelog entry (`shared/changelog.ts`, en / ro / it) in the release that turns it on.
