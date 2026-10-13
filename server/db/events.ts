// Admin history. Writes are fire-and-forget: a DB hiccup is logged, never breaks the caller.
import { count, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { db, softly } from './index.js';
import { challenges, events, personas, sbcSets } from './schema.js';

export type EventType = 'solve' | 'sync' | 'ea_error' | 'ea_day' | 'boost' | 'billing' | 'account';
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
  /** SBC solves only: names from `sbc_sets` / `challenges` as EA sent them, `null` for an unknown id. */
  setName?: string | null;
  challengeName?: string | null;
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
    rows: await withSbcNames(rows.map((r) => ({ id: r.id, at: r.at.getTime(), type: r.type as EventType, personaId: r.personaId, data: r.data }))),
  };
}

const isSbcSolve = (r: EventRow) => r.type === 'solve' && r.data.kind !== 'objectives';
const idsOf = (rows: EventRow[], key: 'setId' | 'challengeId') => [...new Set(rows.map((r) => Number(r.data[key])).filter(Number.isSafeInteger))];

/** SBC solve rows get their set + challenge names: one query per table for the whole page. */
async function withSbcNames(rows: EventRow[]): Promise<EventRow[]> {
  const solves = rows.filter(isSbcSolve);
  if (!solves.length) return rows;
  const setIds = idsOf(solves, 'setId');
  const chIds = idsOf(solves, 'challengeId');
  const [sets, chs] = await Promise.all([
    setIds.length ? db.select({ id: sbcSets.setId, name: sbcSets.name }).from(sbcSets).where(inArray(sbcSets.setId, setIds)) : [],
    chIds.length ? db.select({ id: challenges.challengeId, name: challenges.name }).from(challenges).where(inArray(challenges.challengeId, chIds)) : [],
  ]);
  const setName = new Map(sets.map((s) => [s.id, s.name]));
  const chName = new Map(chs.map((c) => [c.id, c.name]));
  return rows.map((r) =>
    isSbcSolve(r) ? { ...r, setName: setName.get(Number(r.data.setId)) ?? null, challengeName: chName.get(Number(r.data.challengeId)) ?? null } : r,
  );
}

export async function userEventCount(userId: string, personaIds: number[]): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(events).where(eventsCond(userId, personaIds));
  return n;
}
