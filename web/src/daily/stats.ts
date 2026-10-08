// Signed-out stats in the browser; same rules as server/daily/streak.ts (keep them in step).
import type { DailyStats } from '../api';

export interface LocalPlay { day: number; won: boolean; guesses: number }

const pointsFor = (s: number) => (s <= 0 ? 0 : s % 30 === 0 ? 2 : s % 30 === 7 || s % 30 === 14 ? 1 : 0);

export function localStats(plays: LocalPlay[], today: number): DailyStats {
  const byDay = new Map(plays.map((p) => [p.day, p.won]));
  let d = byDay.has(today) ? today : today - 1;
  let current = 0;
  while (byDay.get(d) === true) { current++; d--; }
  let best = 0, run = 0, prev = Number.NEGATIVE_INFINITY;
  for (const day of plays.filter((p) => p.won).map((p) => p.day).sort((a, b) => a - b)) {
    run = day === prev + 1 ? run + 1 : 1;
    prev = day;
    best = Math.max(best, run);
  }
  const dist = [0, 0, 0, 0, 0];
  for (const p of plays) if (p.won && p.guesses >= 1 && p.guesses <= 5) dist[p.guesses - 1]++;
  let target = current + 1;
  while (pointsFor(target) === 0) target++;
  return { played: plays.length, won: plays.filter((p) => p.won).length, current, best, dist, next: { target, points: pointsFor(target) } };
}
