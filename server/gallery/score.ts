// The one place a Gallery set's score and grade are computed. Pure.
import { TAGS, tagStats, tierPct } from './tags.js';
import { GRADES, type GalleryItem, type GallerySet, type Grade, type ScoredSet, type SetFilter, type TagResult } from './types.js';

const any = <T>(list: T[] | undefined, v: T) => !list || list.includes(v);

export function matchesFilter(f: SetFilter, i: GalleryItem): boolean {
  if (f.minRating !== undefined && i.rating < f.minRating) return false;
  if (f.gender !== undefined && i.gender !== f.gender) return false;
  const club = !f.clubs || f.clubs.includes(i.club) || !!f.assetIds?.includes(i.assetId);
  return (
    club &&
    any(f.leagues, i.league) &&
    any(f.nations, i.nation) &&
    any(f.rarities, i.rareflag) &&
    (!f.kinds || (i.kind !== null && f.kinds.includes(i.kind)))
  );
}

export function gradeFor(set: GallerySet, total: number): Grade | null {
  let g: Grade | null = null;
  for (const grade of GRADES) if (total >= set.grades[grade]) g = grade;
  return g;
}

export function nextGrade(set: GallerySet, total: number): { grade: Grade; need: number } | null {
  const grade = GRADES.find((g) => total < set.grades[g]);
  return grade ? { grade, need: set.grades[grade] - total } : null;
}

export function scoreSet(set: GallerySet, items: GalleryItem[]): ScoredSet {
  const base = items.reduce((s, i) => s + i.score, 0);
  const tags: TagResult[] = [];
  for (const tag of TAGS) {
    const { count, sum } = tagStats(tag, items);
    if (!count) continue;
    const pct = tierPct(tag, count);
    const up = tag.tiers.find(([min]) => count < min);
    tags.push({ id: tag.id, count, pct, bonus: Math.floor((sum * pct) / 100), next: up ? { min: up[0], pct: up[1] } : null });
  }
  // paying tags first (largest bonus first), then the unmet ones closest to their first tier
  const gap = (t: TagResult) => (t.next ? t.next.min - t.count : 0);
  tags.sort((a, b) => Number(b.pct > 0) - Number(a.pct > 0) || b.bonus - a.bonus || gap(a) - gap(b));
  const bonus = tags.reduce((s, t) => s + t.bonus, 0);
  const total = base + bonus;
  const filled = items.length;
  const missing = Math.max(0, set.size - filled);
  return { base, tags, bonus, total, grade: missing ? null : gradeFor(set, total), filled, missing };
}
