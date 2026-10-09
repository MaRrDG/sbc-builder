// users ↔ Discord: the connected Discord account.
import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { db } from './index.js';
import { personas, users } from './schema.js';

export async function discordOf(userId: string): Promise<{ discordId: string; username: string } | null> {
  const [r] = await db.select({ id: users.discordId, name: users.discordName }).from(users).where(eq(users.id, userId));
  return r?.id ? { discordId: r.id, username: r.name ?? '' } : null;
}

/** null clears the link. A Discord account already on another user hits the unique index: 'discordTaken'. */
export async function setDiscord(userId: string, d: { discordId: string; username: string } | null): Promise<'ok' | 'discordTaken'> {
  try {
    await db
      .update(users)
      .set(d ? { discordId: d.discordId, discordName: d.username } : { discordId: null, discordName: null, boostSince: null, boostEndedAt: null })
      .where(eq(users.id, userId));
    return 'ok';
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    if (err.code === '23505' || err.cause?.code === '23505') return 'discordTaken';
    throw e;
  }
}

export async function userByDiscord(discordId: string): Promise<{ userId: string; lang: string } | null> {
  const [r] = await db.select({ id: users.id, lang: users.lang }).from(users).where(eq(users.discordId, discordId));
  return r ? { userId: r.id, lang: r.lang } : null;
}

export async function ownedPersonas(userId: string): Promise<{ personaId: number; linkedAt: number }[]> {
  const rows = await db.select({ personaId: personas.personaId, linkedAt: personas.linkedAt }).from(personas).where(eq(personas.userId, userId));
  return rows.map((r) => ({ personaId: r.personaId, linkedAt: r.linkedAt.getTime() }));
}

/** Users whose Discord id is in the list or who are marked as boosting (so a stop can be found). */
export async function boostRows(discordIds: string[]): Promise<{ userId: string; discordId: string; boostSince: number | null }[]> {
  const rows = await db
    .select({ id: users.id, discordId: users.discordId, since: users.boostSince })
    .from(users)
    .where(discordIds.length ? or(inArray(users.discordId, discordIds), isNotNull(users.boostSince)) : isNotNull(users.boostSince));
  return rows.flatMap((r) => (r.discordId ? [{ userId: r.id, discordId: r.discordId, boostSince: r.since?.getTime() ?? null }] : []));
}

/** Boosting: grace from an earlier boost is dropped. true = it really started (false: already boosting). */
export async function startBoost(userId: string, since: Date): Promise<boolean> {
  const r = await db.update(users).set({ boostSince: since, boostEndedAt: null }).where(and(eq(users.id, userId), isNull(users.boostSince))).returning({ id: users.id });
  return r.length > 0;
}

/** The boost ended now: Premium for BOOST_GRACE_MS more (server/plan.ts). true = it really stopped (false: was not boosting). */
export async function stopBoost(userId: string): Promise<boolean> {
  const r = await db.update(users).set({ boostSince: null, boostEndedAt: sql`now()` }).where(and(eq(users.id, userId), isNotNull(users.boostSince))).returning({ id: users.id });
  return r.length > 0;
}
