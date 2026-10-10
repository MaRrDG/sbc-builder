// Client-side autocomplete over every known player: accent- and case-insensitive, stage name first.
import type { DailyName } from '../api';

const SPECIAL: Record<string, string> = { ø: 'o', ß: 'ss', æ: 'ae', œ: 'oe', ł: 'l', đ: 'd', ð: 'd', þ: 'th', ı: 'i' };

export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[øßæœłđðþı]/g, (c) => SPECIAL[c])
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Indexed { p: DailyName; n: string; f: string; words: string[] }

export const indexNames = (list: DailyName[]): Indexed[] =>
  list.map((p) => {
    const n = fold(p.n);
    const f = fold(p.f);
    return { p, n, f, words: [...n.split(/[\s.'-]+/), ...f.split(/[\s.'-]+/)].filter(Boolean) };
  });

export function searchNames(idx: Indexed[], q: string, exclude: ReadonlySet<number>, limit = 8): DailyName[] {
  const k = fold(q);
  if (k.length < 2) return [];
  const scored: { p: DailyName; s: number; n: string }[] = [];
  for (const e of idx) {
    if (exclude.has(e.p.i)) continue;
    const s = e.n.startsWith(k) ? 0 : e.words.some((w) => w.startsWith(k)) || e.f.startsWith(k) ? 1 : e.n.includes(k) || e.f.includes(k) ? 2 : -1;
    if (s >= 0) scored.push({ p: e.p, s, n: e.n });
  }
  scored.sort((a, b) => a.s - b.s || a.n.length - b.n.length || a.n.localeCompare(b.n));
  return scored.slice(0, limit).map((x) => x.p);
}
