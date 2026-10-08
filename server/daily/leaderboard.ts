// All-time Daily leaderboard: wins, then fewer guesses, then who got there first. Pure; the DB layer
// passes only opted-in users (public) or everyone (admin).
import { streakOf, type Play } from './streak.js';

export interface LbInput { userId: string; username: string; plays: Play[] }
export interface LbRow {
  rank: number; userId: string; username: string; wins: number; played: number; winPct: number;
  avgGuesses: number | null; streak: number; reachedDay: number;
}

export function rankLeaderboard(inputs: LbInput[], today: number): LbRow[] {
  const rows = inputs.flatMap((i) => {
    if (!i.plays.length) return [];
    const won = i.plays.filter((x) => x.won);
    const wins = won.length;
    const avgGuesses = wins ? Math.round((won.reduce((s, x) => s + x.guesses, 0) / wins) * 10) / 10 : null;
    return [{
      rank: 0, userId: i.userId, username: i.username, wins, played: i.plays.length,
      winPct: Math.round((wins / i.plays.length) * 100), avgGuesses,
      streak: streakOf(i.plays, today).current,
      reachedDay: wins ? Math.max(...won.map((x) => x.day)) : Number.MAX_SAFE_INTEGER,
    }];
  });
  rows.sort((a, b) =>
    b.wins - a.wins ||
    (a.avgGuesses ?? 99) - (b.avgGuesses ?? 99) ||
    a.reachedDay - b.reachedDay ||
    a.username.toLowerCase().localeCompare(b.username.toLowerCase()));
  rows.forEach((r, i) => (r.rank = i + 1));
  return rows;
}
