// users ↔ Discord: the connected Discord account.
import { eq } from 'drizzle-orm';
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
      .set(d ? { discordId: d.discordId, discordName: d.username } : { discordId: null, discordName: null })
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
