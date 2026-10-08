// Which cache writes carry EA player items for the Daily players table, and where they sit.
import { collectSquadItems } from '../gallery/ledger.js';

// Mirrors the cache key layout written by server/events.ts / sync (accounts/<personaId>/<name>).
const WATCHED = /^accounts\/\d+\/(club|storage|unassigned|objectives|challengeSquads\/\d+)$/;

export function collectRewardItems(v: unknown, out: unknown[] = [], depth = 0): unknown[] {
  if (depth > 12 || !v || typeof v !== 'object') return out;
  if (Array.isArray(v)) {
    for (const x of v) collectRewardItems(x, out, depth + 1);
    return out;
  }
  const o = v as Record<string, unknown>;
  if (o.itemType === 'player') out.push(o);
  else for (const x of Object.values(o)) collectRewardItems(x, out, depth + 1);
  return out;
}

export function itemsFromCache(key: string, data: unknown): unknown[] {
  const kind = WATCHED.exec(key)?.[1];
  if (!kind) return [];
  if (kind.startsWith('challengeSquads/')) return collectSquadItems(data);
  if (kind === 'objectives') return collectRewardItems(data);
  return Array.isArray(data) ? data : [];
}
