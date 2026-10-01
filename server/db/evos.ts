// Timed evolution training rows (server/evos.ts parses them) and the user prefs the emails need.
import { and, eq, gt, isNotNull, isNull, lt, lte, notInArray, sql } from 'drizzle-orm';
import type { EvoTraining } from '../evos.js';
import { asLang, MAX_TRIES, STALE_MS, type MailLang } from '../evo-rules.js';
import { db } from './index.js';
import { evoTrainings, personas, users } from './schema.js';

export type TrainingRow = typeof evoTrainings.$inferSelect;
const sec = (s: number | null) => (s === null ? null : new Date(s * 1000));

/** Upsert what a response showed; a full list also drops slots no longer in it (claimed / expired). */
export async function saveTrainings(personaId: number, list: EvoTraining[], full: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    if (full)
      await tx.delete(evoTrainings).where(
        list.length ? and(eq(evoTrainings.personaId, personaId), notInArray(evoTrainings.slotId, [...new Set(list.map((t) => t.slotId))])) : eq(evoTrainings.personaId, personaId),
      );
    for (const t of list) {
      // a level left behind once the slot moved on (claimed) goes away
      await tx.delete(evoTrainings).where(and(eq(evoTrainings.personaId, personaId), eq(evoTrainings.slotId, t.slotId), lt(evoTrainings.level, t.level)));
      await tx
        .insert(evoTrainings)
        .values({ personaId, slotId: t.slotId, level: t.level, levelCount: t.levelCount, slotName: t.slotName, itemId: t.itemId, player: t.player, startedAt: sec(t.startedAt), endsAt: sec(t.endsAt), ready: t.ready })
        .onConflictDoUpdate({
          target: [evoTrainings.personaId, evoTrainings.slotId, evoTrainings.level],
          set: {
            levelCount: t.levelCount, slotName: t.slotName, itemId: t.itemId, player: t.player, ready: t.ready, updatedAt: sql`now()`,
            // seen running before, ready now: keep the times we saw (and with them the email)
            startedAt: sql`coalesce(excluded.started_at, ${evoTrainings.startedAt})`,
            endsAt: sql`coalesce(excluded.ends_at, ${evoTrainings.endsAt})`,
          },
        });
    }
  });
}

export const trainingsOf = (personaId: number) =>
  db.select().from(evoTrainings).where(eq(evoTrainings.personaId, personaId)).orderBy(evoTrainings.endsAt);

/** Mirrors isDue() in server/evo-rules.ts. */
export const dueTrainings = (now: Date) =>
  db.select().from(evoTrainings).where(and(
    isNotNull(evoTrainings.endsAt), lte(evoTrainings.endsAt, now), gt(evoTrainings.endsAt, new Date(now.getTime() - STALE_MS)),
    isNull(evoTrainings.notifiedAt), lt(evoTrainings.tries, MAX_TRIES),
  ));

const key = (p: number, s: number, l: number) => and(eq(evoTrainings.personaId, p), eq(evoTrainings.slotId, s), eq(evoTrainings.level, l));
export async function markNotified(p: number, s: number, l: number) { await db.update(evoTrainings).set({ notifiedAt: sql`now()` }).where(key(p, s, l)); }
export async function failedTry(p: number, s: number, l: number) { await db.update(evoTrainings).set({ tries: sql`${evoTrainings.tries} + 1` }).where(key(p, s, l)); }

export async function ownerOf(personaId: number) {
  const [r] = await db.select({ userId: users.id, email: users.email, lang: users.lang, evoEmails: users.evoEmails })
    .from(personas).innerJoin(users, eq(users.id, personas.userId)).where(eq(personas.personaId, personaId));
  return r ? { ...r, lang: asLang(r.lang) } : null;
}

export async function prefsOf(userId: string): Promise<{ lang: MailLang; evoEmails: boolean }> {
  const [r] = await db.select({ lang: users.lang, evoEmails: users.evoEmails }).from(users).where(eq(users.id, userId));
  return { lang: asLang(r?.lang), evoEmails: r?.evoEmails ?? true };
}

export async function setPrefs(userId: string, p: { lang?: MailLang; evoEmails?: boolean }) {
  const set: Partial<typeof users.$inferInsert> = {};
  if (p.lang) set.lang = p.lang;
  if (typeof p.evoEmails === 'boolean') set.evoEmails = p.evoEmails;
  if (Object.keys(set).length) await db.update(users).set(set).where(eq(users.id, userId));
}
