import { STATS_MIN_SOLVERS } from './rules.js';

/** "Solved by N players · X% found a squad": per distinct user, found if any of their solves found one. */
export function summarizeSolves(rows: { userId: string | null; found: boolean }[]): { solvers: number; foundPct: number } | null {
  const users = new Map<string, boolean>();
  for (const { userId, found } of rows) if (userId) users.set(userId, (users.get(userId) ?? false) || found);
  if (users.size < STATS_MIN_SOLVERS) return null;
  const ok = [...users.values()].filter(Boolean).length;
  return { solvers: users.size, foundPct: Math.round((ok / users.size) * 100) };
}
