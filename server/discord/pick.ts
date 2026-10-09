// Autocomplete helpers for /sbc: set search over the cached SBC list, and which challenge to solve by default.
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Discord caps choice names at 100 characters. */
export const clip = (s: string, max = 100) => (s.length <= max ? s : `${s.slice(0, max - 1)}…`);

export function matchSets(categories: { name: string; sets: { setId: number; name: string }[] }[], q: string, limit = 25): { setId: number; name: string }[] {
  const f = fold(q.trim());
  const seen = new Set<number>();
  const hits: { setId: number; name: string; sort: string; rank: number }[] = [];
  for (const cat of categories)
    for (const s of cat.sets) {
      if (seen.has(s.setId)) continue; // a set can sit in two categories
      seen.add(s.setId);
      const at = f ? fold(s.name).indexOf(f) : 0;
      if (at < 0) continue;
      hits.push({ setId: s.setId, name: clip(`${s.name} · ${cat.name}`), sort: fold(s.name), rank: at === 0 ? 0 : 1 });
    }
  return hits
    .sort((a, b) => a.rank - b.rank || a.sort.localeCompare(b.sort))
    .slice(0, limit)
    .map(({ setId, name }) => ({ setId, name }));
}

export function defaultChallenge(chs: { challengeId: number; status: string }[]): number | null {
  return (chs.find((c) => c.status !== 'COMPLETED') ?? chs[0])?.challengeId ?? null;
}
