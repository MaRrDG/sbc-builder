// Which cache writes carry completion state, and the items in them (shapes: server/ea.ts, server/objectives/types.ts).
import type { HistoryKind, Seen } from './diff.js';

const KEY = /^accounts\/(\d+)\/(sets|objectives|challenges\/\d+)$/;
const DONE = new Set(['COMPLETED', 'REDEEMED']);
type Obj = Record<string, unknown>;
const list = (v: unknown): Obj[] => (Array.isArray(v) ? v.filter((x): x is Obj => !!x && typeof x === 'object') : []);

export function extract(key: string, data: unknown): { personaId: number; kind: HistoryKind; seen: Seen[] } | null {
  const m = KEY.exec(key);
  if (!m) return null;
  const personaId = Number(m[1]);
  const d = (data && typeof data === 'object' ? data : {}) as Obj;
  if (m[2] === 'sets')
    return { personaId, kind: 'set', seen: list(d.categories).flatMap((c) => list(c.sets)).map((s) => ({ itemId: Number(s.setId), count: Number(s.timesCompleted) })) };
  if (m[2] === 'objectives')
    return {
      personaId, kind: 'objective',
      seen: list(d.categories).flatMap((c) => list(c.groupsList)).flatMap((g) => list(g.objectives))
        .map((o) => ({ itemId: Number(o.objectiveId), done: DONE.has(String(o.state)) })),
    };
  return { personaId, kind: 'challenge', seen: list(data).map((c) => ({ itemId: Number(c.challengeId), count: Number(c.timesCompleted) })) };
}
