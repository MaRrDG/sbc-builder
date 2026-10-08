// Daily stats, win streaks and the streak points schedule (7 → +1, 14 → +1, 30 → +2, repeating every 30).
// The web keeps a copy of streakOf / statsOf for signed-out stats (web/src/daily/stats.ts).
export interface Play { day: number; won: boolean; guesses: number } // finished games only
export interface Stats { played: number; won: number; current: number; best: number; dist: number[]; next: { target: number; points: number } }

export function pointsFor(streak: number): number {
  if (streak <= 0) return 0;
  const m = streak % 30;
  return m === 0 ? 2 : m === 7 || m === 14 ? 1 : 0;
}

export function nextMilestone(streak: number): { target: number; points: number } {
  let s = Math.max(0, streak) + 1;
  while (pointsFor(s) === 0) s++;
  return { target: s, points: pointsFor(s) };
}

export function streakOf(plays: Play[], today: number): { current: number; best: number } {
  const byDay = new Map(plays.map((p) => [p.day, p.won]));
  let d = byDay.has(today) ? today : today - 1;
  let current = 0;
  while (byDay.get(d) === true) {
    current++;
    d--;
  }
  let best = 0;
  let run = 0;
  let prev = Number.NEGATIVE_INFINITY;
  for (const day of plays.filter((p) => p.won).map((p) => p.day).sort((x, y) => x - y)) {
    run = day === prev + 1 ? run + 1 : 1;
    prev = day;
    best = Math.max(best, run);
  }
  return { current, best };
}

export function statsOf(plays: Play[], today: number): Stats {
  const { current, best } = streakOf(plays, today);
  const dist = [0, 0, 0, 0, 0];
  for (const p of plays) if (p.won && p.guesses >= 1 && p.guesses <= 5) dist[p.guesses - 1]++;
  return { played: plays.length, won: plays.filter((p) => p.won).length, current, best, dist, next: nextMilestone(current) };
}
