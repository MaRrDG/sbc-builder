// Pure Paddle billing rules: webhook signature, subscription reducer, active check.
import { createHmac, timingSafeEqual } from 'node:crypto';

export type SubStatus = 'active' | 'trialing' | 'past_due' | 'paused' | 'canceled';

export interface SubRow {
  id: string;
  userId: string;
  customerId: string;
  status: SubStatus;
  priceId: string;
  interval: 'month' | 'year';
  currentPeriodEnd: Date;
  cancelAt: Date | null;
  eventAt: Date;
}

export interface PaddleSubEvent {
  eventId: string;
  type: string;
  occurredAt: Date;
  data: {
    id: string;
    status: SubStatus;
    customer_id: string;
    custom_data?: { userId?: string } | null;
    items: { price: { id: string } }[];
    current_billing_period?: { ends_at: string } | null;
    scheduled_change?: { action: string; effective_at: string } | null;
  };
}

/** Paddle retries the card for a while; keep Premium this long after the period ends. */
export const PAST_DUE_GRACE_MS = 3 * 24 * 60 * 60 * 1000;
const SIGNATURE_TOLERANCE_S = 5 * 60;

/** `Paddle-Signature: ts=<unix s>;h1=<hex>[;h1=<hex>]`, HMAC-SHA256 of `ts:body`. */
export function verifySignature(rawBody: string, header: string | undefined, secret: string, now: number): boolean {
  if (!header || !secret) return false;
  let ts: number | null = null;
  const sigs: string[] = [];
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === 'ts' && /^\d+$/.test(value)) ts = Number(value);
    else if (key === 'h1') sigs.push(value);
  }
  if (ts === null || sigs.length === 0) return false;
  if (Math.abs(now / 1000 - ts) > SIGNATURE_TOLERANCE_S) return false;
  const expected = createHmac('sha256', secret).update(`${ts}:${rawBody}`).digest();
  return sigs.some((sig) => {
    if (!/^[0-9a-f]+$/i.test(sig)) return false;
    const got = Buffer.from(sig, 'hex');
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

export function intervalOf(priceId: string, prices: { month: string; year: string }): 'month' | 'year' | null {
  if (priceId === prices.month) return 'month';
  if (priceId === prices.year) return 'year';
  return null;
}

/** Next row for a subscription event; null = ignore (older than the row, unknown price, or no user for a new row). */
export function applyEvent(prev: SubRow | null, ev: PaddleSubEvent, prices: { month: string; year: string }): SubRow | null {
  if (prev && ev.occurredAt.getTime() < prev.eventAt.getTime()) return null;
  const priceId = ev.data.items[0]?.price.id ?? '';
  const interval = intervalOf(priceId, prices);
  if (!interval) return null;
  const userId = prev?.userId ?? ev.data.custom_data?.userId;
  if (!userId) return null;
  const endsAt = ev.data.current_billing_period?.ends_at;
  const change = ev.data.scheduled_change;
  return {
    id: ev.data.id,
    userId,
    customerId: ev.data.customer_id,
    status: ev.data.status,
    priceId,
    interval,
    currentPeriodEnd: endsAt ? new Date(endsAt) : prev?.currentPeriodEnd ?? ev.occurredAt,
    cancelAt: change?.action === 'cancel' ? new Date(change.effective_at) : null,
    eventAt: ev.occurredAt,
  };
}

export function subscriptionActive(row: SubRow | null, now: number): boolean {
  if (!row) return false;
  const end = row.currentPeriodEnd.getTime();
  if (row.status === 'active' || row.status === 'trialing') return end > now;
  if (row.status === 'past_due') return now < end + PAST_DUE_GRACE_MS;
  return false;
}

export type LogKind =
  | { kind: 'subscribed' | 'renewed'; amount: number; currency: string }
  | { kind: 'canceled' | 'past_due' }
  | { kind: 'refunded'; amount: number; currency: string; action: string };

interface LooseData {
  origin?: string;
  currency_code?: string;
  details?: { totals?: { grand_total?: string } } | null;
  action?: string;
  status?: string;
  totals?: { total?: string; currency_code?: string } | null;
}

/** What a webhook means for the admin history (amounts in minor units, no card or customer data); null = nothing to log. */
export function logKind(type: string, data: LooseData): LogKind | null {
  switch (type) {
    case 'transaction.completed':
      return { kind: data.origin === 'subscription_recurring' ? 'renewed' : 'subscribed', amount: Number(data.details?.totals?.grand_total ?? 0), currency: data.currency_code ?? '' };
    case 'subscription.canceled':
      return { kind: 'canceled' };
    case 'subscription.past_due':
      return { kind: 'past_due' };
    case 'adjustment.created':
    case 'adjustment.updated':
      if ((data.action !== 'refund' && data.action !== 'chargeback') || data.status !== 'approved') return null;
      return { kind: 'refunded', amount: Number(data.totals?.total ?? 0), currency: data.totals?.currency_code ?? '', action: data.action };
    default:
      return null;
  }
}

/** Who may not open a checkout: admins and lifetime Premium (nothing to buy), and anyone already subscribed. */
export function checkoutRefusal(row: { plan: string; premiumUntil: Date | null }, admin: boolean, subscribed: boolean): 'alreadyPremium' | 'alreadySubscribed' | null {
  if (admin || (row.plan === 'premium' && row.premiumUntil === null)) return 'alreadyPremium';
  return subscribed ? 'alreadySubscribed' : null;
}
