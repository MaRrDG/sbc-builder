// Who can be the Daily / Practice answer: well-known players (top-5 leagues, high base rating) whose
// club we are sure of. Popularity is by rating only, never by how many clubs own the player.
import { DAY, baseSeen, inTransfer } from './players.js';
import type { PlayerRow } from './types.js';

export const TOP5 = [13, 53, 31, 19, 16] as const; // Premier League, LALIGA, Serie A, Bundesliga, Ligue 1
export const FRESH_MS = 30 * DAY;
export const RECENT_DAYS = 60;

export interface PoolOpts { minRating: number; minPool: number; floor: number; recent: ReadonlySet<number>; now: number }

export function eligible(r: PlayerRow, now: number): boolean {
  const seen = baseSeen(r);
  return (TOP5 as readonly number[]).includes(r.league) && seen !== null && now - seen <= FRESH_MS && !inTransfer(r, now);
}

/** Players at or above minRating; when fewer than minPool, the threshold steps down to the floor. */
export function poolOf(rows: Iterable<PlayerRow>, o: PoolOpts): { players: PlayerRow[]; minRating: number } {
  const ok = [...rows].filter((r) => eligible(r, o.now) && !o.recent.has(r.assetId));
  let minRating = o.minRating;
  let players = ok.filter((r) => r.rating >= minRating);
  while (players.length < o.minPool && minRating > o.floor) {
    minRating--;
    players = ok.filter((r) => r.rating >= minRating);
  }
  return { players, minRating };
}

export function poolSizes(rows: Iterable<PlayerRow>, now: number, from: number, to: number): Record<number, number> {
  const ok = [...rows].filter((r) => eligible(r, now));
  const out: Record<number, number> = {};
  for (let m = from; m <= to; m++) out[m] = ok.filter((r) => r.rating >= m).length;
  return out;
}
