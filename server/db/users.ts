// FC Solver users and which EA personas they own. Personas are never deleted here except by
// their own user ("Disconnect"); a takeover keeps the previous owner for the "taken over" notice.
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { hashToken, newLinkToken } from '../auth-rules.js';
import type { PlanRow, Tier } from '../plan.js';
import { db } from './index.js';
import { linkTokens, personas, users } from './schema.js';

const LINK_TTL_MS = 10 * 60 * 1000;

export async function touchUser(id: string): Promise<{ email: string }> {
  const [row] = await db
    .insert(users)
    .values({ id })
    .onConflictDoUpdate({ target: users.id, set: { lastSeenAt: sql`now()` } })
    .returning({ email: users.email });
  return { email: row?.email ?? '' };
}

export async function setUserEmail(id: string, email: string): Promise<void> {
  await db.update(users).set({ email }).where(eq(users.id, id));
}

export async function personaRow(personaId: number) {
  const [row] = await db
    .select({ userId: personas.userId, previousUserId: personas.previousUserId })
    .from(personas)
    .where(eq(personas.personaId, personaId));
  return row ?? null;
}

export async function personasOf(userId: string): Promise<number[]> {
  const rows = await db.select({ id: personas.personaId }).from(personas).where(eq(personas.userId, userId));
  return rows.map((r) => r.id);
}

export async function setOwner(personaId: number, userId: string): Promise<void> {
  await db
    .insert(personas)
    .values({ personaId, userId })
    .onConflictDoUpdate({
      target: personas.personaId,
      set: { previousUserId: sql`${personas.userId}`, userId, linkedAt: sql`now()` },
    });
}

export async function unlinkPersona(personaId: number, userId: string): Promise<boolean> {
  const gone = await db
    .delete(personas)
    .where(and(eq(personas.personaId, personaId), eq(personas.userId, userId)))
    .returning({ id: personas.personaId });
  return gone.length > 0;
}

export async function createLinkToken(userId: string): Promise<string> {
  // stale tokens are not history: drop them while we are here
  await db.delete(linkTokens).where(or(lt(linkTokens.expiresAt, sql`now()`), sql`${linkTokens.usedAt} is not null`));
  const token = newLinkToken();
  await db.insert(linkTokens).values({ tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + LINK_TTL_MS) });
  return token;
}

const usable = (token: string) =>
  and(eq(linkTokens.tokenHash, hashToken(token)), isNull(linkTokens.usedAt), gt(linkTokens.expiresAt, sql`now()`));

export async function linkTokenUser(token: string): Promise<string | null> {
  const [row] = await db.select({ userId: linkTokens.userId }).from(linkTokens).where(usable(token));
  return row?.userId ?? null;
}

export async function consumeLinkToken(token: string): Promise<boolean> {
  const done = await db.update(linkTokens).set({ usedAt: sql`now()` }).where(usable(token)).returning({ u: linkTokens.userId });
  return done.length > 0;
}

const planCols = { plan: users.plan, premiumUntil: users.premiumUntil, quotaStart: users.quotaStart, quotaUsed: users.quotaUsed };

export async function planRow(userId: string): Promise<PlanRow | null> {
  const [row] = await db.select(planCols).from(users).where(eq(users.id, userId));
  return row ?? null;
}

/** One found solve: opens a new 7-day window when none is open (same cutoff as quotaState), else counts on. */
export async function countSolve(userId: string): Promise<PlanRow> {
  const fresh = sql`(${users.quotaStart} is null or ${users.quotaStart} <= now() - interval '7 days')`;
  const [row] = await db
    .update(users)
    .set({
      quotaStart: sql`case when ${fresh} then now() else ${users.quotaStart} end`,
      quotaUsed: sql`case when ${fresh} then 1 else ${users.quotaUsed} + 1 end`,
    })
    .where(eq(users.id, userId))
    .returning(planCols);
  return row;
}

/** The quota columns are left alone: switching plans never refills or empties the week. */
export async function setPlan(userId: string, tier: Tier, premiumUntil: Date | null): Promise<boolean> {
  const done = await db.update(users).set({ plan: tier, premiumUntil }).where(eq(users.id, userId)).returning({ id: users.id });
  return done.length > 0;
}

export async function resetQuota(userId: string): Promise<boolean> {
  const done = await db.update(users).set({ quotaStart: null, quotaUsed: 0 }).where(eq(users.id, userId)).returning({ id: users.id });
  return done.length > 0;
}
