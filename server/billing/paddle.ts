// The only Paddle-specific server code (a Lemon Squeezy adapter would replace this file):
// config from env, and the two API calls we need. Never writes subscription state itself.
import type { PaddleSubEvent } from './rules.js';

export interface BillingConfig {
  env: 'sandbox' | 'production';
  apiKey: string;
  clientToken: string;
  webhookSecret: string;
  prices: { month: string; year: string };
}

/** Null (billing off: routes 404, no buttons) unless every PADDLE_* variable is set. Read on use: .env loads late. */
export function billingConfig(): BillingConfig | null {
  const e = process.env;
  const env = e.PADDLE_ENV;
  if (env !== 'sandbox' && env !== 'production') return null;
  const [apiKey, clientToken, webhookSecret, month, year] = [e.PADDLE_API_KEY, e.PADDLE_CLIENT_TOKEN, e.PADDLE_WEBHOOK_SECRET, e.PADDLE_PRICE_MONTH, e.PADDLE_PRICE_YEAR];
  if (!apiKey || !clientToken || !webhookSecret || !month || !year) return null;
  return { env, apiKey, clientToken, webhookSecret, prices: { month, year } };
}

const apiBase = (c: BillingConfig) => (c.env === 'sandbox' ? 'https://sandbox-api.paddle.com' : 'https://api.paddle.com');

async function call<T>(c: BillingConfig, method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${apiBase(c)}${path}`, {
    method,
    headers: { Authorization: `Bearer ${c.apiKey}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Paddle ${method} ${path} → ${res.status}`);
  return ((await res.json()) as { data: T }).data;
}

/** A customer portal link (cancel, card, invoices, switch plan), valid for a short while. */
export async function portalUrl(c: BillingConfig, customerId: string, subscriptionIds: string[]): Promise<string> {
  const data = await call<{ urls: { general: { overview: string } } }>(c, 'POST', `/customers/${encodeURIComponent(customerId)}/portal-sessions`, { subscription_ids: subscriptionIds });
  return data.urls.general.overview;
}

/** The subscription as Paddle has it now (admin resync). */
export function getSubscription(c: BillingConfig, id: string): Promise<PaddleSubEvent['data']> {
  return call<PaddleSubEvent['data']>(c, 'GET', `/subscriptions/${encodeURIComponent(id)}`);
}
