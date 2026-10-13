// Account deletion: scheduling and the purge primitives (server/deletion-rules.ts decides which EA
// accounts go). Every purge function is idempotent: running it again deletes nothing and succeeds.
import { and, asc, eq, inArray, isNotNull, isNull, lte, sql } from 'drizzle-orm';
import { db } from './index.js';
import {
  brickReports,
  codes,
  completionMarks,
  completions,
  dailyPlays,
  dailyReminders,
  events,
  evoTrainings,
  founderSpots,
  linkTokens,
  personaLinks,
  personas,
  pointLedger,
  redemptions,
  subscriptions,
  trustedAccounts,
  users,
} from './schema.js';

/** Set the date unless one is already set. True when this call set it (only that request mails the user). */
export async function scheduleDeletion(userId: string, at: Date): Promise<boolean> {
  const rows = await db.update(users).set({ deleteAt: at }).where(and(eq(users.id, userId), isNull(users.deleteAt))).returning({ id: users.id });
  return rows.length > 0;
}

export async function clearDeletion(userId: string): Promise<void> {
  await db.update(users).set({ deleteAt: null, deleteSubs: [] }).where(eq(users.id, userId));
}

export async function deleteAtOf(userId: string): Promise<Date | null> {
  const [row] = await db.select({ at: users.deleteAt }).from(users).where(eq(users.id, userId));
  return row?.at ?? null;
}

/** Remember subscriptions whose renewal the deletion request stopped (Cancel deletion restarts exactly these). */
export async function addDeleteSubs(userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db
    .update(users)
    .set({ deleteSubs: sql`(select coalesce(jsonb_agg(distinct x), '[]'::jsonb) from jsonb_array_elements_text(${users.deleteSubs} || ${JSON.stringify(ids)}::jsonb) x)` })
    .where(eq(users.id, userId));
}

export async function deleteSubsOf(userId: string): Promise<string[]> {
  const [row] = await db.select({ subs: users.deleteSubs }).from(users).where(eq(users.id, userId));
  return row?.subs ?? [];
}

/** Users whose deletion date has come, oldest first. */
export async function dueDeletions(now: Date): Promise<string[]> {
  const rows = await db
    .select({ id: users.id })
    .from(users)
    .where(and(isNotNull(users.deleteAt), lte(users.deleteAt, now)))
    .orderBy(asc(users.deleteAt));
  return rows.map((r) => r.id);
}

/** Rows for `purgePlan`: every persona the user owns or was ever linked to, with its current owner and all its links. */
export async function personasForPurge(
  userId: string,
): Promise<{ personas: { personaId: number; ownerId: string | null }[]; links: { personaId: number; userId: string }[] }> {
  const owned = await db.select({ id: personas.personaId }).from(personas).where(eq(personas.userId, userId));
  const linked = await db.select({ id: personaLinks.personaId }).from(personaLinks).where(eq(personaLinks.userId, userId));
  const ids = [...new Set([...owned, ...linked].map((r) => r.id))];
  if (!ids.length) return { personas: [], links: [] };
  const pRows = await db.select({ personaId: personas.personaId, ownerId: personas.userId }).from(personas).where(inArray(personas.personaId, ids));
  const lRows = await db.select({ personaId: personaLinks.personaId, userId: personaLinks.userId }).from(personaLinks).where(inArray(personaLinks.personaId, ids));
  const known = new Set(pRows.map((p) => p.personaId));
  // linked once but no personas row any more: unowned
  const rows = [...pRows, ...ids.filter((id) => !known.has(id)).map((personaId) => ({ personaId, ownerId: null }))];
  return { personas: rows, links: lRows };
}

/** Admin history keeps this EA account's events without its id. Runs before its rows go, so a crash between can't skip it. */
export async function anonymizePersonaEvents(personaId: number): Promise<void> {
  await db.update(events).set({ personaId: null }).where(eq(events.personaId, personaId));
}

/** Every DB row keyed by this EA account (the cache folder goes separately, store.dropKeys(`accounts/<id>`)). */
export async function purgePersonaRows(personaId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(completionMarks).where(eq(completionMarks.personaId, personaId));
    await tx.delete(completions).where(eq(completions.personaId, personaId));
    await tx.delete(evoTrainings).where(eq(evoTrainings.personaId, personaId));
    await tx.delete(brickReports).where(eq(brickReports.personaId, personaId));
    await tx.delete(trustedAccounts).where(eq(trustedAccounts.personaId, personaId));
    await tx.delete(personaLinks).where(eq(personaLinks.personaId, personaId));
    await tx.delete(personas).where(eq(personas.personaId, personaId));
  });
}

/** Another user owns this EA account: drop only this user's link (and the personas row if it is still theirs). */
export async function unlinkUser(personaId: number, userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(personaLinks).where(and(eq(personaLinks.personaId, personaId), eq(personaLinks.userId, userId)));
    await tx.delete(personas).where(and(eq(personas.personaId, personaId), eq(personas.userId, userId)));
    await tx.update(personas).set({ previousUserId: null }).where(and(eq(personas.personaId, personaId), eq(personas.previousUserId, userId)));
  });
}

/** The user's own rows, then the user. Personas must be purged / unlinked first (personas.user_id references users). */
export async function purgeUserRows(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(linkTokens).where(eq(linkTokens.userId, userId));
    await tx.delete(subscriptions).where(eq(subscriptions.userId, userId));
    await tx.delete(dailyPlays).where(eq(dailyPlays.userId, userId));
    await tx.delete(dailyReminders).where(eq(dailyReminders.userId, userId));
    await tx.delete(redemptions).where(eq(redemptions.userId, userId));
    await tx.delete(pointLedger).where(eq(pointLedger.userId, userId));
    await tx.delete(codes).where(eq(codes.ownerId, userId));
    await tx.delete(personaLinks).where(eq(personaLinks.userId, userId));
    // other users' rows that name this user
    await tx.update(users).set({ invitedBy: null }).where(eq(users.invitedBy, userId));
    await tx.update(pointLedger).set({ ref: '' }).where(eq(pointLedger.ref, userId));
    await tx.update(personas).set({ previousUserId: null }).where(eq(personas.previousUserId, userId));
    // the Founding 50 spot is not freed: keep it (and its EA account's lock) without the user
    const [me] = await tx.select({ at: users.founderAt, persona: users.founderPersona }).from(users).where(eq(users.id, userId));
    if (me?.at) await tx.insert(founderSpots).values({ personaId: me.persona, founderAt: me.at }).onConflictDoNothing();
    await tx.delete(users).where(eq(users.id, userId));
  });
}

/** Admin history stays for the counts, without who: the user id, and the purged EA accounts' ids. */
export async function anonymizeEvents(userId: string, purgedPersonas: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    // billing rows carry Paddle ids that lead back to the person
    await tx
      .update(events)
      .set({ data: sql`${events.data} - 'customerId' - 'subscriptionId' - 'transactionId'` })
      .where(and(eq(events.userId, userId), eq(events.type, 'billing')));
    await tx.update(events).set({ userId: null }).where(eq(events.userId, userId));
    if (purgedPersonas.length) await tx.update(events).set({ personaId: null }).where(inArray(events.personaId, purgedPersonas));
  });
}
