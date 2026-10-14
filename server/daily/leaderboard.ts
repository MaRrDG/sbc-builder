// All-time Daily leaderboard: wins in 2+ guesses, then fewer guesses, then who got there first. Pure; the DB
// layer passes only opted-in users (public) or everyone (admin). A 1-guess win may come from an answer seen
// elsewhere, so it never moves anyone up (ranking, average, reachedDay); it still shows as a game played and a
// win (wins, played, win %), and apart in `oneGuessWins`.
import { streakOf, type Play } from './streak.js';

export interface LbInput { userId: string; username: string; plays: Play[] }
export interface LbRow {
  rank: number; userId: string; username: string; wins: number; played: number; winPct: number;
  avgGuesses: number | null; streak: number; reachedDay: number; oneGuessWins: number;
}

export function rankLeaderboard(inputs: LbInput[], today: number): LbRow[] {
  const rows = inputs.flatMap((i) => {
    if (!i.plays.length) return [];
    const won = i.plays.filter((x) => x.won && x.guesses >= 2);
    const oneGuessWins = i.plays.filter((x) => x.won && x.guesses < 2).length;
    const wins = won.length + oneGuessWins;
    const played = i.plays.length;
    const avgGuesses = won.length ? Math.round((won.reduce((s, x) => s + x.guesses, 0) / won.length) * 10) / 10 : null;
    return [{
      row: {
        rank: 0, userId: i.userId, username: i.username, wins, played,
        winPct: Math.round((wins / played) * 100), avgGuesses,
        streak: streakOf(i.plays, today).current,
        reachedDay: won.length ? Math.max(...won.map((x) => x.day)) : Number.MAX_SAFE_INTEGER, oneGuessWins,
      },
      ranked: won.length,
    }];
  });
  rows.sort((a, b) =>
    b.ranked - a.ranked ||
    (a.row.avgGuesses ?? 99) - (b.row.avgGuesses ?? 99) ||
    a.row.reachedDay - b.row.reachedDay ||
    a.row.username.toLowerCase().localeCompare(b.row.username.toLowerCase()));
  return rows.map((r, i) => ({ ...r.row, rank: i + 1 }));
}
