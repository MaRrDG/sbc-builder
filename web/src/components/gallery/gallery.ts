// Gallery list filters and sort (pure, tested).
import type { GalleryGrade, GallerySetResult } from '../../api';

export type GallerySort = 'score' | 'progress' | 'grade' | 'name';
export interface GalleryFilter {
  category: 'all' | GallerySetResult['category'];
  state: 'all' | 'complete' | 'incomplete';
  minGrade: GalleryGrade | null;
}
export const GRADE_ORDER: GalleryGrade[] = ['D', 'C', 'B', 'A', 'S'];
const rank = (g: GalleryGrade | null) => (g ? GRADE_ORDER.indexOf(g) : -1);

/** 0..1 of the way from the current grade's threshold to the next; 1 at S, 0 when incomplete. */
export function progress(s: GallerySetResult): number {
  if (s.missing > 0) return 0;
  if (!s.next) return 1;
  const from = s.grade ? s.grades[s.grade] : 0;
  const to = s.grades[s.next.grade];
  return to > from ? Math.max(0, Math.min(1, (s.score - from) / (to - from))) : 0;
}

export function filterSort(sets: GallerySetResult[], f: GalleryFilter, sort: GallerySort): GallerySetResult[] {
  const kept = sets.filter((s) =>
    (f.category === 'all' || s.category === f.category) &&
    (f.state === 'all' || (f.state === 'complete' ? s.missing === 0 : s.missing > 0)) &&
    (f.minGrade === null || rank(s.grade) >= rank(f.minGrade)));
  const by: Record<GallerySort, (a: GallerySetResult, b: GallerySetResult) => number> = {
    score: (a, b) => b.score - a.score,
    progress: (a, b) => progress(b) - progress(a) || b.score - a.score,
    grade: (a, b) => rank(b.grade) - rank(a.grade) || b.score - a.score,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  return kept.sort(by[sort]);
}
