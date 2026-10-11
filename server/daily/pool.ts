// Who can be the Daily / Practice answer: well-known players (top leagues, high base rating) whose
// club we are sure of. Popularity is by rating only, never by how many clubs own the player.
// Two pools: men (the usual answer) and women (now and then, see pickPool).
import { DAY, baseSeen, inTransfer } from './players.js';
import type { PlayerRow } from './types.js';

export const TOP5 = [13, 53, 31, 19, 16] as const; // Premier League, LALIGA, Serie A, Bundesliga, Ligue 1
// Barclays WSL, Liga F, Frauen-Bundesliga, D1 Arkema, Serie A Femminile
export const TOP_WOMEN = [2216, 2222, 2215, 2218, 2236] as const;
export const FRESH_MS = 30 * DAY;
export const RECENT_DAYS = 60;

export type Side = 'men' | 'women';
const SIDES: Record<Side, { leagues: readonly number[]; gender: number }> = {
  men: { leagues: TOP5, gender: 0 },
  women: { leagues: TOP_WOMEN, gender: 1 },
};

export interface PoolOpts { minRating: number; minPool: number; floor: number; recent: ReadonlySet<number>; now: number; side?: Side }

export function eligible(r: PlayerRow, now: number, side: Side = 'men'): boolean {
  const s = SIDES[side];
  const seen = baseSeen(r);
  return s.leagues.includes(r.league) && r.gender === s.gender && seen !== null && now - seen <= FRESH_MS && !inTransfer(r, now);
}

/** Players at or above minRating; when fewer than minPool, the threshold steps down to the floor. */
export function poolOf(rows: Iterable<PlayerRow>, o: PoolOpts): { players: PlayerRow[]; minRating: number } {
  const ok = [...rows].filter((r) => eligible(r, o.now, o.side) && !o.recent.has(r.assetId));
  let minRating = o.minRating;
  let players = ok.filter((r) => r.rating >= minRating);
  while (players.length < o.minPool && minRating > o.floor) {
    minRating--;
    players = ok.filter((r) => r.rating >= minRating);
  }
  return { players, minRating };
}

export interface PickOpts { /** chance of the women pool, clamped to [0, 1] */ share: number; /** smallest usable women pool */ womenHardMin: number }

/** Which pool the answer comes from. `roll` is uniform in [0, 1): below `share` → women, when that pool is
 *  big enough; a too-small chosen pool falls back to the other one. */
export function pickPool<T>(men: T[], women: T[], roll: number, o: PickOpts): T[] {
  const share = Math.min(1, Math.max(0, Number.isFinite(o.share) ? o.share : 0));
  const womenOk = women.length > 0 && women.length >= o.womenHardMin;
  if (roll < share && womenOk) return women;
  if (men.length) return men;
  return womenOk ? women : men;
}

export function poolSizes(rows: Iterable<PlayerRow>, now: number, from: number, to: number, side: Side = 'men'): Record<number, number> {
  const ok = [...rows].filter((r) => eligible(r, now, side));
  const out: Record<number, number> = {};
  for (let m = from; m <= to; m++) out[m] = ok.filter((r) => r.rating >= m).length;
  return out;
}
