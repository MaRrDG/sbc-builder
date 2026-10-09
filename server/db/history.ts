// Own SBC / objective completion history (server/history): marks + rows, one transaction per payload.
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from './index.js';
import { completionMarks, completions } from './schema.js';
import { diff, type HistoryKind, type Mark, type Seen } from '../history/diff.js';

/** Diffs `seen` against the stored marks and writes the new rows and marks. Returns the rows inserted. */
export async function applyHistory(personaId: number, kind: HistoryKind, seen: Seen[]): Promise<number> {
  const ids = [...new Set(seen.map((s) => s.itemId).filter((id) => Number.isInteger(id) && id > 0))];
  if (!ids.length) return 0;
  return db.transaction(async (tx) => {
    const rows = await tx
      .select({ itemId: completionMarks.itemId, count: completionMarks.count, done: completionMarks.done })
      .from(completionMarks)
      .where(and(eq(completionMarks.personaId, personaId), eq(completionMarks.kind, kind), inArray(completionMarks.itemId, ids)));
    const prev = new Map<number, Mark>(rows.map((r) => [r.itemId, { count: r.count, done: r.done }]));
    const d = diff(kind, prev, seen);
    let inserted = 0;
    if (d.rows.length)
      inserted = (await tx.insert(completions).values(d.rows.map((r) => ({ personaId, kind, ...r }))).onConflictDoNothing().returning({ id: completions.id })).length;
    if (d.marks.size)
      await tx
        .insert(completionMarks)
        .values([...d.marks].map(([itemId, m]) => ({ personaId, kind, itemId, count: m.count, done: m.done })))
        .onConflictDoUpdate({
          target: [completionMarks.personaId, completionMarks.kind, completionMarks.itemId],
          set: { count: sql`excluded.count`, done: sql`excluded.done`, updatedAt: sql`now()` },
        });
    return inserted;
  });
}

export interface HistoryTotals { set: number; challenge: number; objective: number; since: number | null }

/** All-time sums per kind (baseline included) and when tracking started for this persona. */
export async function historyTotals(personaId: number): Promise<HistoryTotals> {
  const rows = await db
    .select({ kind: completions.kind, total: sql<number>`coalesce(sum(${completions.count}), 0)::int` })
    .from(completions)
    .where(eq(completions.personaId, personaId))
    .groupBy(completions.kind);
  const [first] = await db
    .select({ at: sql<Date | string | null>`min(${completionMarks.firstSeen})` })
    .from(completionMarks)
    .where(eq(completionMarks.personaId, personaId));
  const by = new Map(rows.map((r) => [r.kind, Number(r.total)]));
  return { set: by.get('set') ?? 0, challenge: by.get('challenge') ?? 0, objective: by.get('objective') ?? 0, since: first?.at ? new Date(first.at).getTime() : null };
}
