// Daily history: the past days (never today: its answer stays secret until the next drop) with their answer,
// how many finished games there were and how many of them were won (signed-in + signed-out), and, for a
// signed-in user, their own result. Pure; the DB layer feeds it.
import type { Play } from './streak.js';

/** Days per history page, newest first. */
export const HISTORY_DAYS = 30;

/**
 * The page that ends just before `before` (`?before=` from the client), never reaching today: a missing or bad
 * value (not an integer, today or later) is the first page. Days start at 1, so `more` = older days exist.
 */
export function historyPage(today: number, before: unknown): { until: number; from: number; more: boolean } {
  const n = typeof before === 'string' && /^\d{1,6}$/.test(before) ? Number(before) : NaN;
  const until = Number.isInteger(n) && n >= 1 && n < today ? n : today;
  const from = Math.max(1, until - HISTORY_DAYS);
  return { until, from, more: from > 1 };
}

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
  until: number,
  answers: { day: number; date: string; assetId: number }[],
  totals: Map<number, DayTotals>,
  answerOf: (assetId: number) => A | null,
): HistoryDay<A>[] {
  return answers
    .filter((a) => a.day < until && a.day >= until - HISTORY_DAYS)
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
