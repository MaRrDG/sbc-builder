// Paddle subscriptions and webhook idempotency. Rows change only through signed webhooks
// (server/billing/routes.ts) or the admin resync; the rules live in server/billing/rules.ts.
import { and, desc, eq, gt, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { db, softly } from './index.js';
import { KEEP_DAYS } from './events.js';
import { billingEvents, subscriptions, users } from './schema.js';
import { applyEvent, PAST_DUE_GRACE_MS, subscriptionActive, type PaddleSubEvent, type SubRow, type SubStatus } from '../billing/rules.js';

type Row = typeof subscriptions.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const toSub = (r: Row): SubRow => ({
  id: r.id,
  userId: r.userId,
  customerId: r.customerId,
  status: r.status as SubStatus,
  priceId: r.priceId,
  interval: r.interval === 'year' ? 'year' : 'month',
  currentPeriodEnd: r.currentPeriodEnd,
  cancelAt: r.cancelAt,
  eventAt: r.eventAt,
  pastDueSince: r.pastDueSince,
});

/** The user's subscription that counts now, else their newest one (for "ended on" / past due), else null. */
export async function subscriptionOf(userId: string): Promise<SubRow | null> {
  const rows = (await db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.currentPeriodEnd))).map(toSub);
  const now = Date.now();
  return rows.find((r) => subscriptionActive(r, now)) ?? rows[0] ?? null;
}

/** Same rule as rules.ts subscriptionActive, in SQL, for the admin filters. */
export function subscriptionActiveSql(now: Date): SQL {
  const live = and(inArray(subscriptions.status, ['active', 'trialing']), gt(subscriptions.currentPeriodEnd, now));
  // raw sql: postgres-js binds strings, not Dates
  const since = sql`coalesce(${subscriptions.pastDueSince}, ${subscriptions.currentPeriodEnd})`;
  const grace = and(eq(subscriptions.status, 'past_due'), sql`${since} > ${new Date(now.getTime() - PAST_DUE_GRACE_MS).toISOString()}::timestamptz`);
  return sql`exists (select 1 from ${subscriptions} where ${subscriptions.userId} = "users"."id" and (${or(live, grace)}))`;
}

/** Of these users, the ones with a subscription that counts now. */
export async function activeSubscribers(userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const rows = (await db.select().from(subscriptions).where(inArray(subscriptions.userId, userIds))).map(toSub);
  const now = Date.now();
  return new Set(rows.filter((r) => subscriptionActive(r, now)).map((r) => r.userId));
}

/** Marks a webhook event as handled; false when it was already (a Paddle redelivery). */
async function markEvent(tx: Tx | typeof db, eventId: string, type: string): Promise<boolean> {
  const got = await tx.insert(billingEvents).values({ eventId, type }).onConflictDoNothing().returning({ id: billingEvents.eventId });
  return got.length > 0;
}

/** Non-subscription events (transactions, adjustments): only dedupe. */
export function recordEvent(eventId: string, type: string): Promise<boolean> {
  return markEvent(db, eventId, type);
}

export interface SubResult {
  fresh: boolean; // false: event already handled, nothing done
  prev: SubRow | null;
  row: SubRow | null; // null: ignored (older event, unknown price, no / unknown user)
  unknownUser?: string; // custom_data.userId that has no users row
}

/** `ordered`: webhooks never overwrite a newer row. Two first events of one subscription (created / activated / updated
 *  arrive together) can both find no row to lock, so the insert itself must refuse to go back in time. */
async function writeSub(tx: Tx, next: SubRow, ordered: boolean): Promise<void> {
  const values = { ...next, updatedAt: new Date() };
  await tx
    .insert(subscriptions)
    .values(values)
    .onConflictDoUpdate({ target: subscriptions.id, set: values, ...(ordered ? { setWhere: sql`${subscriptions.eventAt} <= excluded.event_at` } : {}) });
  // remember the customer for the portal, unless another user already has it
  await tx
    .update(users)
    .set({ paddleCustomerId: next.customerId })
    .where(and(eq(users.id, next.userId), isNull(users.paddleCustomerId), sql`not exists (select 1 from users u2 where u2.paddle_customer_id = ${next.customerId})`));
}

/** One subscription webhook, atomically: dedupe by event id, reduce over the stored row, upsert. */
export async function applySubscriptionEvent(ev: PaddleSubEvent, prices: { month: string; year: string }): Promise<SubResult> {
  return db.transaction(async (tx) => {
    if (!(await markEvent(tx, ev.eventId, ev.type))) return { fresh: false, prev: null, row: null };
    const [cur] = await tx.select().from(subscriptions).where(eq(subscriptions.id, ev.data.id)).for('update');
    const prev = cur ? toSub(cur) : null;
    const next = applyEvent(prev, ev, prices);
    if (!next) return { fresh: true, prev, row: null };
    if (!prev) {
      const [u] = await tx.select({ id: users.id }).from(users).where(eq(users.id, next.userId));
      if (!u) return { fresh: true, prev, row: null, unknownUser: next.userId };
    }
    await writeSub(tx, next, true);
    return { fresh: true, prev, row: next };
  });
}

/** Admin resync: the state Paddle has now replaces ours (no event id, no ordering check). */
export async function replaceSubscription(next: SubRow): Promise<void> {
  await db.transaction((tx) => writeSub(tx, next, false));
}

export async function subscriptionById(id: string): Promise<SubRow | null> {
  const [r] = await db.select().from(subscriptions).where(eq(subscriptions.id, id));
  return r ? toSub(r) : null;
}

export async function pruneBillingEvents(): Promise<void> {
  await softly('prune billing events', () => db.delete(billingEvents).where(lt(billingEvents.receivedAt, sql`now() - make_interval(days => ${KEEP_DAYS})`)));
}
