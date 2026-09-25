// Admin history. Writes are fire-and-forget: a DB hiccup is logged, never breaks the caller.
import { and, count, desc, eq, lt, sql } from 'drizzle-orm';
import { db, softly } from './index.js';
import { events } from './schema.js';

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

export async function userEvents(userId: string, page: number, pageSize: number): Promise<{ rows: EventRow[]; total: number }> {
  const [{ n }] = await db.select({ n: count() }).from(events).where(eq(events.userId, userId));
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.userId, userId)))
    .orderBy(desc(events.at), desc(events.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  return {
    total: n,
    rows: rows.map((r) => ({ id: r.id, at: r.at.getTime(), type: r.type as EventType, personaId: r.personaId, data: r.data })),
  };
}
