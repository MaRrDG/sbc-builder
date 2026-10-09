// Own SBC / objective history: what changed between the last counted state (marks) and a fresh payload.
// EA keeps no history; counting increases of what the cache receives is the only source (docs/architecture.md).
export type HistoryKind = 'set' | 'challenge' | 'objective';
export interface Mark { count: number; done: boolean }
export interface Seen { itemId: number; count?: number; done?: boolean }
export interface HistoryRow { itemId: number; seq: number; count: number; baseline: boolean }

const countOf = (v: unknown) => (Number.isInteger(v) && (v as number) > 0 ? (v as number) : 0);

/** One entry per item: the highest count, done when any copy is done. */
function merge(seen: Seen[]): Map<number, Seen> {
  const by = new Map<number, Seen>();
  for (const s of seen) {
    if (!Number.isInteger(s.itemId) || s.itemId <= 0) continue;
    const o = by.get(s.itemId);
    by.set(s.itemId, o ? { itemId: s.itemId, count: Math.max(countOf(o.count), countOf(s.count)), done: !!o.done || !!s.done } : s);
  }
  return by;
}

/**
 * Counts (`set`, `challenge`): first sighting = baseline row of the whole count; an increase = a row of the
 * difference; a decrease (a seeded copy reset to 0) is ignored. Objectives: not done → done = one completion.
 * `seq` is the count reached, so the same completion always has the same (persona, kind, item, seq) key.
 */
export function diff(kind: HistoryKind, prev: ReadonlyMap<number, Mark>, seen: Seen[]): { rows: HistoryRow[]; marks: Map<number, Mark> } {
  const rows: HistoryRow[] = [];
  const marks = new Map<number, Mark>();
  for (const s of merge(seen).values()) {
    const p = prev.get(s.itemId);
    if (kind === 'objective') {
      const done = !!s.done;
      if (!p) {
        marks.set(s.itemId, { count: done ? 1 : 0, done });
        if (done) rows.push({ itemId: s.itemId, seq: 1, count: 1, baseline: true });
      } else if (done && !p.done) {
        const c = p.count + 1;
        marks.set(s.itemId, { count: c, done: true });
        rows.push({ itemId: s.itemId, seq: c, count: 1, baseline: false });
      } else if (!done && p.done) marks.set(s.itemId, { count: p.count, done: false });
      continue;
    }
    const n = countOf(s.count);
    if (!p) {
      marks.set(s.itemId, { count: n, done: false });
      if (n > 0) rows.push({ itemId: s.itemId, seq: n, count: n, baseline: true });
    } else if (n > p.count) {
      marks.set(s.itemId, { count: n, done: p.done });
      rows.push({ itemId: s.itemId, seq: n, count: n - p.count, baseline: false });
    }
  }
  return { rows, marks };
}
