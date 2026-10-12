// /api/billing/*: Paddle checkout data, the signed webhook (the only writer of Premium state from Paddle),
// the customer portal, and the admin resync. Every route 404s while billing is off (billingConfig()).
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { isAdmin, requireAdmin } from '../admin/auth.js';
import { siteUser } from '../auth.js';
import { applySubscriptionEvent, recordEvent, replaceSubscription, subscriptionById, subscriptionOf } from '../db/billing.js';
import { logEvent } from '../db/events.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { planRow } from '../db/users.js';
import { SessionError } from '../ea.js';
import { createLimiter } from '../limits.js';
import { billingConfig, getSubscription, portalUrl, type BillingConfig } from './paddle.js';
import { applyEvent, checkoutRefusal, intervalOf, logKind, subscriptionActive, verifySignature, type PaddleSubEvent, type SubRow } from './rules.js';

const webhookLimit = createLimiter({ windowMs: 60_000, max: 120 });
const SUB_EVENTS = new Set(['subscription.created', 'subscription.activated', 'subscription.updated', 'subscription.canceled', 'subscription.past_due', 'subscription.paused', 'subscription.resumed']);

function needConfig(): BillingConfig {
  const c = billingConfig();
  if (!c) throw new SessionError('Payments are not available.', 404, 'billingOff');
  return c;
}

/** What the site shows about my subscription (/api/me.billing); null without one or while billing is off. */
export async function billingOf(userId: string) {
  if (!billingConfig()) return null;
  const sub = await subscriptionOf(userId);
  if (!sub) return null;
  return {
    subscribed: subscriptionActive(sub, Date.now()),
    interval: sub.interval,
    status: sub.status,
    periodEnd: sub.currentPeriodEnd.getTime(),
    cancelAt: sub.cancelAt?.getTime() ?? null,
  };
}

interface Envelope {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: Record<string, unknown> & { id?: string; subscription_id?: string | null; custom_data?: { userId?: string } | null };
}

/** The FC Solver user a transaction / adjustment belongs to: our customData, else its subscription row. */
async function ownerOf(data: NonNullable<Envelope['data']>): Promise<string | null> {
  const fromCustom = data.custom_data?.userId;
  if (typeof fromCustom === 'string' && fromCustom) return fromCustom;
  const subId = data.subscription_id;
  return subId ? ((await subscriptionById(subId))?.userId ?? null) : null;
}

async function handle(c: BillingConfig, env: Required<Pick<Envelope, 'event_id' | 'event_type' | 'occurred_at'>> & { data: NonNullable<Envelope['data']> }, log: FastifyRequest['log']): Promise<void> {
  const type = env.event_type;
  const kind = logKind(type, env.data as Parameters<typeof logKind>[1]);
  if (SUB_EVENTS.has(type)) {
    const ev = { eventId: env.event_id, type, occurredAt: new Date(env.occurred_at), data: env.data as unknown as PaddleSubEvent['data'] };
    const r = await applySubscriptionEvent(ev, c.prices);
    if (!r.fresh) return;
    if (!r.row && !r.prev) {
      // a subscription we cannot place: no / unknown userId or a price that is not ours. Kept for the admin, never lost silently.
      const reason = r.unknownUser ? 'unknownUser' : ev.data.custom_data?.userId ? 'unknownPrice' : 'noUserId';
      log.warn(`[billing] unmatched ${type} ${ev.data.id}: ${reason}`);
      logEvent({ type: 'billing', userId: null, data: { kind: 'unmatched', reason, subscriptionId: ev.data.id, customerId: ev.data.customer_id } });
      return;
    }
    if (r.row && !intervalOf(r.row.priceId, c.prices)) {
      // a price that is not PADDLE_PRICE_MONTH / _YEAR (changed env, another price on the product): applied, but say so
      log.warn(`[billing] ${type} ${r.row.id}: price ${r.row.priceId} is not one of ours`);
      logEvent({ type: 'billing', userId: r.row.userId, data: { kind: 'unmatched', reason: 'unknownPrice', subscriptionId: r.row.id, customerId: r.row.customerId } });
    }
    if (kind && r.row) logEvent({ type: 'billing', userId: r.row.userId, data: { ...kind, subscriptionId: r.row.id, interval: r.row.interval } });
    return;
  }
  if (!(await recordEvent(env.event_id, type))) return;
  if (!kind) return;
  const userId = await ownerOf(env.data);
  if (!userId) log.warn(`[billing] ${type} ${env.data.id ?? ''} without a known user`);
  logEvent({ type: 'billing', userId, data: { ...kind, transactionId: env.data.id ?? null, subscriptionId: env.data.subscription_id ?? null } });
}

export function registerBillingRoutes(app: FastifyInstance) {
  /** Public values for Paddle.js: environment, client token (public by design), price ids. */
  app.get('/api/billing/config', async () => {
    const c = needConfig();
    return { env: c.env, clientToken: c.clientToken, prices: c.prices };
  });

  /** What Paddle.js needs to open a checkout for me; the server, not the browser, decides customData.userId. */
  app.post<{ Body: { interval?: unknown } }>('/api/billing/checkout', async (req) => {
    const c = needConfig();
    const userId = await siteUser(req);
    const interval = req.body?.interval === 'year' ? 'year' : 'month';
    const [row, admin, sub, [u]] = await Promise.all([
      planRow(userId),
      isAdmin(userId),
      subscriptionOf(userId),
      db.select({ email: users.email, customerId: users.paddleCustomerId }).from(users).where(eq(users.id, userId)),
    ]);
    const refusal = checkoutRefusal(row ?? { plan: 'free', premiumUntil: null }, admin, subscriptionActive(sub, Date.now()));
    if (refusal) throw new SessionError(refusal === 'alreadyPremium' ? 'You already have Premium.' : 'You already have a subscription.', 409, refusal);
    return { priceId: c.prices[interval], customData: { userId }, email: u?.email || null, customerId: u?.customerId ?? null };
  });

  /** A Paddle customer portal link for my subscription. */
  app.post('/api/billing/portal', async (req) => {
    const c = needConfig();
    const userId = await siteUser(req);
    const [sub, [u]] = await Promise.all([subscriptionOf(userId), db.select({ customerId: users.paddleCustomerId }).from(users).where(eq(users.id, userId))]);
    const customerId = u?.customerId ?? sub?.customerId;
    if (!customerId) throw new SessionError('No subscription yet.', 404, 'noSubscription');
    try {
      return { url: await portalUrl(c, customerId, sub ? [sub.id] : []) };
    } catch (e) {
      req.log.error(`[billing] portal for ${userId}: ${(e as Error).message}`);
      throw new SessionError('The payments provider did not answer, try again in a minute.', 502, 'billingDown');
    }
  });

  /** Admin: replace our row with the subscription as Paddle has it now (missed or broken webhooks). */
  app.post<{ Params: { id: string } }>('/api/admin/users/:id/billing-resync', async (req) => {
    await requireAdmin(req);
    const c = needConfig();
    const sub = await subscriptionOf(req.params.id);
    if (!sub) throw new SessionError('No subscription for this user.', 404, 'noSubscription');
    const data = await getSubscription(c, sub.id);
    const next: SubRow | null = applyEvent({ ...sub, eventAt: new Date(0) }, { eventId: 'resync', type: 'resync', occurredAt: new Date(), data }, c.prices);
    if (!next) throw new SessionError('Paddle sent a price that is not ours.', 409, 'unknownPrice');
    await replaceSubscription(next);
    return { subscription: next };
  });

  /** Admin: give a Paddle subscription that reached us without a known user (an `unmatched` event) to this user. */
  app.post<{ Params: { id: string }; Body: { subscriptionId?: unknown } }>('/api/admin/users/:id/billing-attach', async (req) => {
    await requireAdmin(req);
    const c = needConfig();
    const subId = typeof req.body?.subscriptionId === 'string' ? req.body.subscriptionId.trim() : '';
    if (!/^sub_[a-z0-9]+$/.test(subId)) throw new SessionError('Not a Paddle subscription id.', 400, 'invalid');
    const [u] = await db.select({ id: users.id }).from(users).where(eq(users.id, req.params.id));
    if (!u) throw new SessionError('No such user.', 404, 'notFound');
    const owner = (await subscriptionById(subId))?.userId;
    if (owner && owner !== u.id) throw new SessionError('This subscription belongs to another user.', 409, 'alreadySubscribed');
    let data: PaddleSubEvent['data'];
    try {
      data = await getSubscription(c, subId);
    } catch (e) {
      req.log.error(`[billing] attach ${subId}: ${(e as Error).message}`);
      throw new SessionError('The payments provider did not answer, try again in a minute.', 502, 'billingDown');
    }
    const next = applyEvent(null, { eventId: 'attach', type: 'attach', occurredAt: new Date(), data: { ...data, custom_data: { userId: u.id } } }, c.prices);
    if (!next) throw new SessionError('Paddle sent a price that is not ours.', 409, 'unknownPrice');
    await replaceSubscription(next);
    logEvent({ type: 'billing', userId: u.id, data: { kind: 'attached', subscriptionId: subId } });
    return { subscription: next };
  });

  // Encapsulated: the webhook needs the raw body for the signature; other routes keep the JSON parser.
  void app.register(async (s) => {
    s.removeContentTypeParser('application/json');
    s.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 256 * 1024 }, (_req, body, done) => done(null, body));
    s.post('/api/billing/webhook', async (req, reply) => {
      const c = billingConfig();
      if (!c) return reply.code(404).send();
      if (!webhookLimit(req.ip)) return reply.code(429).send();
      const raw = typeof req.body === 'string' ? req.body : '';
      const header = req.headers['paddle-signature'];
      if (!verifySignature(raw, typeof header === 'string' ? header : undefined, c.webhookSecret, Date.now())) return reply.code(401).send();
      let env: Envelope;
      try {
        env = JSON.parse(raw) as Envelope;
      } catch {
        return reply.code(400).send();
      }
      if (!env.event_id || !env.event_type || !env.occurred_at || !env.data) return reply.code(400).send();
      // a DB failure throws → 500 → Paddle retries; the dedupe row rolls back with it
      await handle(c, { event_id: env.event_id, event_type: env.event_type, occurred_at: env.occurred_at, data: env.data }, req.log);
      return reply.code(200).send({ ok: true });
    });
  });
}
