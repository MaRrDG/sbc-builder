// Invites, promo and gift codes, points. Every write runs in a transaction: a code row is locked
// FOR UPDATE while it is used, and a user's points under a per-user advisory lock.
import { and, desc, eq, sql } from 'drizzle-orm';
import { checkRedeem, checkSpend, extendPremium, generateCode, INVITE_DAYS, isLifetime, normalizeCode, PRICES, rewardDays,
  type CodeKind, type CodeRow, type RedeemError, type SpendDays } from '../referrals.js';
import { db } from './index.js';
import { codes, personas, pointLedger, redemptions, users } from './schema.js';

const POINTS_LOCK = 4151; // per user: (POINTS_LOCK, hashtext(userId))
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function freshCode(tx: Tx | typeof db): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const c = generateCode();
    const [hit] = await tx.select({ code: codes.code }).from(codes).where(eq(codes.code, c));
    if (!hit) return c;
  }
  throw new Error('no free code after 8 tries');
}

export async function ownInviteCode(userId: string): Promise<string> {
  const [have] = await db.select({ code: codes.code }).from(codes).where(and(eq(codes.ownerId, userId), eq(codes.kind, 'invite')));
  if (have) return have.code;
  const code = await freshCode(db);
  await db.insert(codes).values({ code, kind: 'invite', ownerId: userId }).onConflictDoNothing();
  const [row] = await db.select({ code: codes.code }).from(codes).where(and(eq(codes.ownerId, userId), eq(codes.kind, 'invite')));
  return row!.code; // a parallel call may have won: either way there is exactly one
}

/** Adds `days` (null = for life) to a user's Premium inside `tx`; false when nothing changed. */
async function addPremium(tx: Tx, userId: string, days: number | null): Promise<boolean> {
  const [u] = await tx.select({ plan: users.plan, premiumUntil: users.premiumUntil }).from(users).where(eq(users.id, userId)).for('update');
  if (!u) return false;
  const next = extendPremium(u, days, Date.now());
  if (!next) return false;
  await tx.update(users).set(next).where(eq(users.id, userId));
  return true;
}

const isFounder = async (userId: string) =>
  !!(await db.select({ f: users.founderAt }).from(users).where(eq(users.id, userId)))[0]?.f;

const isUniqueViolation = (e: unknown) =>
  (e as { code?: string })?.code === '23505' || (e as { cause?: { code?: string } })?.cause?.code === '23505';

export async function redeem(userId: string, raw: string) {
  const c = normalizeCode(raw);
  let wasInvite = true; // a unique-index race below can only come from an invite or a repeated code
  let result;
  try {
    result = await db.transaction(async (tx) => {
      const [row] = c ? await tx.select().from(codes).where(eq(codes.code, c)).for('update') : [];
      wasInvite = row?.kind === 'invite';
      const [inv] = await tx.select({ id: redemptions.id }).from(redemptions).where(and(eq(redemptions.userId, userId), eq(redemptions.kind, 'invite')));
      const [mine] = c ? await tx.select({ id: redemptions.id }).from(redemptions).where(and(eq(redemptions.userId, userId), eq(redemptions.code, c))) : [];
      const err = checkRedeem((row as CodeRow | undefined) ?? null, { userId, usedInvite: !!inv, usedThis: !!mine, now: Date.now() });
      if (err) return { ok: false as const, code: err };
      const code = row as CodeRow;
      await tx.update(codes).set({ uses: sql`${codes.uses} + 1` }).where(eq(codes.code, code.code));
      if (code.kind === 'invite') {
        await tx.insert(redemptions).values({ code: code.code, kind: 'invite', userId, status: 'pending' });
        await tx.update(users).set({ invitedBy: code.ownerId }).where(eq(users.id, userId));
        return { ok: true as const, kind: code.kind, days: INVITE_DAYS };
      }
      await tx.insert(redemptions).values({ code: code.code, kind: code.kind, userId, status: 'granted', grantedAt: new Date() });
      await addPremium(tx, userId, rewardDays(code));
      return { ok: true as const, kind: code.kind as CodeKind, days: rewardDays(code) };
    });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    return { ok: false as const, code: (wasInvite ? 'inviteUsed' : 'codeUsed') as RedeemError };
  }
  if (!result.ok) return result;
  let pending = false;
  if (result.kind === 'invite') {
    const [p] = await db.select({ id: personas.personaId }).from(personas).where(eq(personas.userId, userId)).limit(1);
    pending = !(p && (await grantPendingInvite(userId, p.id)));
  }
  return { ...result, pending, founder: await isFounder(userId) };
}

/** On an EA link: the 7 days for a pending invite, and the inviter's point (one per persona, ever). */
export async function grantPendingInvite(userId: string, personaId: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(redemptions)
      .where(and(eq(redemptions.userId, userId), eq(redemptions.kind, 'invite'), eq(redemptions.status, 'pending'))).for('update');
    if (!r) return false;
    const [code] = await tx.select({ ownerId: codes.ownerId }).from(codes).where(eq(codes.code, r.code));
    await tx.update(redemptions).set({ status: 'granted', grantedAt: new Date() }).where(eq(redemptions.id, r.id));
    await addPremium(tx, userId, INVITE_DAYS); // a founder is for life already: no change
    if (code?.ownerId)
      await tx.insert(pointLedger).values({ userId: code.ownerId, delta: 1, reason: 'invite', ref: userId, personaId }).onConflictDoNothing();
    return true;
  });
}

const balanceIn = async (tx: Tx | typeof db, userId: string) =>
  (await tx.select({ n: sql<number>`coalesce(sum(${pointLedger.delta}), 0)::int` }).from(pointLedger).where(eq(pointLedger.userId, userId)))[0]?.n ?? 0;

export async function spendPoints(userId: string, days: SpendDays, gift: boolean) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${POINTS_LOCK}, hashtext(${userId}))`);
    const [u] = await tx.select({ plan: users.plan, premiumUntil: users.premiumUntil }).from(users).where(eq(users.id, userId));
    const err = checkSpend(await balanceIn(tx, userId), days, gift, !!u && isLifetime(u));
    if (err) return { ok: false as const, code: err };
    if (gift) {
      const giftCode = await freshCode(tx);
      await tx.insert(codes).values({ code: giftCode, kind: 'gift', ownerId: userId, days, maxUses: 1 });
      await tx.insert(pointLedger).values({ userId, delta: -PRICES[days], reason: 'gift', ref: giftCode });
      return { ok: true as const, giftCode };
    }
    await addPremium(tx, userId, days);
    await tx.insert(pointLedger).values({ userId, delta: -PRICES[days], reason: 'spend', ref: String(days) });
    const [after] = await tx.select({ premiumUntil: users.premiumUntil }).from(users).where(eq(users.id, userId));
    return { ok: true as const, premiumUntil: after?.premiumUntil?.getTime() ?? null };
  });
}

export interface ReferralSummary {
  code: string;
  points: number;
  invited: number;
  pendingInvites: number;
  usedInvite: boolean;
  gifts: { code: string; days: number; usedAt: number | null }[];
  ledger: { delta: number; reason: string; at: number }[];
}

export async function referralSummary(userId: string): Promise<ReferralSummary> {
  const code = await ownInviteCode(userId);
  const [counts] = await db.select({
    invited: sql<number>`count(*) filter (where ${redemptions.status} = 'granted')::int`,
    pending: sql<number>`count(*) filter (where ${redemptions.status} = 'pending')::int`,
  }).from(redemptions).where(eq(redemptions.code, code));
  const [used] = await db.select({ id: redemptions.id }).from(redemptions).where(and(eq(redemptions.userId, userId), eq(redemptions.kind, 'invite')));
  const gifts = await db.select({ code: codes.code, days: codes.days, usedAt: redemptions.at }).from(codes)
    .leftJoin(redemptions, eq(redemptions.code, codes.code))
    .where(and(eq(codes.ownerId, userId), eq(codes.kind, 'gift'))).orderBy(desc(codes.createdAt));
  const ledger = await db.select({ delta: pointLedger.delta, reason: pointLedger.reason, at: pointLedger.at }).from(pointLedger)
    .where(eq(pointLedger.userId, userId)).orderBy(desc(pointLedger.at)).limit(20);
  return {
    code,
    points: await balanceIn(db, userId),
    invited: counts?.invited ?? 0,
    pendingInvites: counts?.pending ?? 0,
    usedInvite: !!used,
    gifts: gifts.map((g) => ({ code: g.code, days: g.days ?? 0, usedAt: g.usedAt?.getTime() ?? null })),
    ledger: ledger.map((l) => ({ delta: l.delta, reason: l.reason, at: l.at.getTime() })),
  };
}

export type { RedeemError };
