// Timed evolution training rows (server/evos.ts parses them) and the user prefs the emails need.
import { and, eq, gt, inArray, isNotNull, isNull, lt, lte, notInArray, sql } from 'drizzle-orm';
import type { EvoTraining } from '../evos.js';
import { asLang, chunk, MAX_TRIES, STALE_MS, type AlertKey, type MailLang } from '../evo-rules.js';
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

/** Mirrors isDue() in server/evo-rules.ts; oldest first, at most `limit` (one tick's worth). */
export const dueTrainings = (now: Date, limit: number) =>
  db.select().from(evoTrainings).where(and(
    isNotNull(evoTrainings.endsAt), lte(evoTrainings.endsAt, now), gt(evoTrainings.endsAt, new Date(now.getTime() - STALE_MS)),
    isNull(evoTrainings.notifiedAt), lt(evoTrainings.tries, MAX_TRIES),
  )).orderBy(evoTrainings.endsAt, evoTrainings.personaId, evoTrainings.slotId, evoTrainings.level).limit(limit);

const keysIn = (keys: AlertKey[]) =>
  sql`(${evoTrainings.personaId}, ${evoTrainings.slotId}, ${evoTrainings.level}) in (${sql.join(keys.map((k) => sql`(${k.personaId}, ${k.slotId}, ${k.level})`), sql`, `)})`;

/** Closes rows (mailed or skipped); a row already closed keeps its first time. */
export async function markNotified(keys: AlertKey[]): Promise<void> {
  for (const part of chunk(keys, 500))
    await db.update(evoTrainings).set({ notifiedAt: sql`now()` }).where(and(isNull(evoTrainings.notifiedAt), keysIn(part)));
}

export async function failedTry(keys: AlertKey[]): Promise<void> {
  for (const part of chunk(keys, 500))
    await db.update(evoTrainings).set({ tries: sql`${evoTrainings.tries} + 1` }).where(keysIn(part));
}

/** Owner of each persona (personas without an owner are missing from the map). */
export async function ownersOf(personaIds: number[]) {
  const out = new Map<number, { userId: string; email: string; lang: MailLang; evoEmails: boolean }>();
  for (const part of chunk(personaIds, 500)) {
    const rows = await db.select({ personaId: personas.personaId, userId: users.id, email: users.email, lang: users.lang, evoEmails: users.evoEmails })
      .from(personas).innerJoin(users, eq(users.id, personas.userId)).where(inArray(personas.personaId, part));
    for (const { personaId, ...r } of rows) out.set(personaId, { ...r, lang: asLang(r.lang) });
  }
  return out;
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
