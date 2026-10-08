// Admin view of one Daily day: signed-in games (daily_plays) plus anonymous aggregate counters.
export interface AnonDay { finished: number; won: number; dist: number[] }
export interface SignedGame { won: boolean; guesses: number[] }
export interface DaySummary {
  finished: number; won: number; winPct: number; dist: number[];
  signedIn: { finished: number; won: number }; anon: { finished: number; won: number };
}

export function daySummary(signed: SignedGame[], anon: AnonDay | null): DaySummary {
  const dist = [0, 0, 0, 0, 0];
  for (const g of signed) if (g.won && g.guesses.length >= 1 && g.guesses.length <= 5) dist[g.guesses.length - 1]++;
  if (anon) anon.dist.forEach((n, i) => (dist[i] += n));
  const signedIn = { finished: signed.length, won: signed.filter((g) => g.won).length };
  const a = { finished: anon?.finished ?? 0, won: anon?.won ?? 0 };
  const finished = signedIn.finished + a.finished;
  const won = signedIn.won + a.won;
  return { finished, won, winPct: finished ? Math.round((won / finished) * 100) : 0, dist, signedIn, anon: a };
}

export function topGuessed(signed: { guesses: number[] }[], anonCounts: { assetId: number; count: number }[], limit = 10) {
  const counts = new Map<number, number>();
  for (const g of signed) for (const id of g.guesses) counts.set(id, (counts.get(id) ?? 0) + 1);
  for (const c of anonCounts) counts.set(c.assetId, (counts.get(c.assetId) ?? 0) + c.count);
  return [...counts].map(([assetId, count]) => ({ assetId, count }))
    .sort((a, b) => b.count - a.count || a.assetId - b.assetId)
    .slice(0, limit);
}
