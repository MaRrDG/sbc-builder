// Daily history: the past days (never today: its answer stays secret until the next drop) with their answer,
// how many finished games there were and how many of them were won (signed-in + signed-out), and, for a
// signed-in user, their own result. Pure; the DB layer feeds it.
import type { Play } from './streak.js';

/** Days the history shows, newest first. */
export const HISTORY_DAYS = 30;

export interface DayTotals { finished: number; won: number }

export interface HistoryDay<A> {
  day: number;
  date: string;
  /** null when the player is no longer in the players table */
  answer: A | null;
  /** finished games that day, signed in and signed out */
  played: number;
  /** 0-100, null when nobody finished that day */
  winPct: number | null;
  /** signed in only: the user's finished game that day, null when not played (absent for signed-out callers) */
  me?: { won: boolean; guesses: number } | null;
}

export function buildHistory<A>(
  today: number,
  answers: { day: number; date: string; assetId: number }[],
  totals: Map<number, DayTotals>,
  answerOf: (assetId: number) => A | null,
): HistoryDay<A>[] {
  return answers
    .filter((a) => a.day < today && a.day >= today - HISTORY_DAYS)
    .sort((a, b) => b.day - a.day)
    .map((a) => {
      const t = totals.get(a.day) ?? { finished: 0, won: 0 };
      return {
        day: a.day,
        date: a.date,
        answer: answerOf(a.assetId),
        played: t.finished,
        winPct: t.finished ? Math.round((t.won / t.finished) * 100) : null,
      };
    });
}

/** The days with a signed-in user's own finished game on each (null = not played). */
export function withMine<A>(days: HistoryDay<A>[], plays: Play[]): HistoryDay<A>[] {
  const own = new Map(plays.map((p) => [p.day, p]));
  return days.map((d) => {
    const p = own.get(d.day);
    return { ...d, me: p ? { won: p.won, guesses: p.guesses } : null };
  });
}
