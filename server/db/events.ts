// Admin history. Writes are fire-and-forget: a DB hiccup is logged, never breaks the caller.
import { count, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { db, softly } from './index.js';
import { events, personas } from './schema.js';

export type EventType = 'solve' | 'sync' | 'ea_error' | 'ea_day';
export interface NewEvent {
  type: EventType;
  userId?: string | null;
  personaId?: number | null;
  data?: Record<string, unknown>;
}
export interface EventRow {
  id: number;
  at: number;
  type: EventType;
  personaId: number | null;
  data: Record<string, unknown>;
}

export const KEEP_DAYS = 180;

export function logEvent(e: NewEvent): void {
  void softly(`log ${e.type}`, () =>
    db.insert(events).values({ type: e.type, userId: e.userId ?? null, personaId: e.personaId ?? null, data: e.data ?? {} }),
  );
}

export async function pruneEvents(): Promise<void> {
  await softly('prune events', () => db.delete(events).where(lt(events.at, sql`now() - make_interval(days => ${KEEP_DAYS})`)));
}

/** EA personas this user owns, for `eventsCond` below. */
export async function ownedPersonaIds(userId: string): Promise<number[]> {
  const rows = await db.select({ personaId: personas.personaId }).from(personas).where(eq(personas.userId, userId));
  return rows.map((r) => r.personaId);
}

/** A user's events: their own (`user_id`, solves) plus any logged against an EA account they own
 * (sync/ea_error/ea_day rows carry only `persona_id`). */
function eventsCond(userId: string, personaIds: number[]): SQL {
  return personaIds.length ? or(eq(events.userId, userId), inArray(events.personaId, personaIds))! : eq(events.userId, userId);
}

export async function userEvents(userId: string, personaIds: number[], page: number, pageSize: number): Promise<{ rows: EventRow[]; total: number }> {
  const cond = eventsCond(userId, personaIds);
  const [{ n }] = await db.select({ n: count() }).from(events).where(cond);
  const rows = await db
    .select()
    .from(events)
    .where(cond)
    .orderBy(desc(events.at), desc(events.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    total: n,
    rows: rows.map((r) => ({ id: r.id, at: r.at.getTime(), type: r.type as EventType, personaId: r.personaId, data: r.data })),
  };
}

export async function userEventCount(userId: string, personaIds: number[]): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(events).where(eventsCond(userId, personaIds));
  return n;
}
