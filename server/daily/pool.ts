// Who can be the Daily / Practice answer: well-known players (top leagues, high base rating) whose
// club we are sure of, or an Icon. Popularity is by rating only, never by how many clubs own the player.
// Three pools: men (the usual answer), women and icons (now and then, see pickPool). Heroes never.
import { DAY, baseSeen, inTransfer } from './players.js';
import type { PlayerRow } from './types.js';

export const TOP5 = [13, 53, 31, 19, 16] as const; // Premier League, LALIGA, Serie A, Bundesliga, Ligue 1
// Barclays WSL, Liga F, Frauen-Bundesliga, D1 Arkema, Serie A Femminile
export const TOP_WOMEN = [2216, 2222, 2215, 2218, 2236] as const;
export const FRESH_MS = 30 * DAY;
export const RECENT_DAYS = 60;

export type Side = 'men' | 'women' | 'icons';
const SIDES: Record<'men' | 'women', { leagues: readonly number[]; gender: number }> = {
  men: { leagues: TOP5, gender: 0 },
  women: { leagues: TOP_WOMEN, gender: 1 },
};

export interface PoolOpts { minRating: number; minPool: number; floor: number; recent: ReadonlySet<number>; now: number; side?: Side }

/** men / women: a top league of that gender, base card seen lately, not mid-transfer. icons: any Icon,
 *  either gender (icons don't move clubs: no league / freshness / transfer check). */
export function eligible(r: PlayerRow, now: number, side: Side = 'men'): boolean {
  if (side === 'icons') return r.cardType === 'icon';
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

export interface PickOpts {
  /** chance of the women pool */
  womenShare: number;
  /** chance of the icon pool */
  iconShare: number;
  /** smallest usable women pool */
  womenHardMin: number;
  /** smallest usable icon pool */
  iconHardMin: number;
}

const unit = (v: number) => Math.min(1, Math.max(0, Number.isFinite(v) ? v : 0));

/** Each share clamped to [0, 1]; when they add up to more than 1 the women keep theirs and the icons get
 *  what is left (the men's share ends at 0, never below). */
export function shares(womenShare: number, iconShare: number): { women: number; icons: number } {
  const women = unit(womenShare);
  return { women, icons: Math.min(unit(iconShare), 1 - women) };
}

export interface Pools<T> { men: T[]; women: T[]; icons: T[] }

/** Which pool the answer comes from. `roll` is uniform in [0, 1): [0, women) → women, [women, women + icons)
 *  → icons, the rest → men. A chosen pool under its hard minimum falls back to men; with no men, to
 *  whichever other pool is usable. */
export function pickPool<T>(p: Pools<T>, roll: number, o: PickOpts): T[] {
  const s = shares(o.womenShare, o.iconShare);
  const ok: Record<Side, boolean> = {
    men: p.men.length > 0,
    women: p.women.length > 0 && p.women.length >= o.womenHardMin,
    icons: p.icons.length > 0 && p.icons.length >= o.iconHardMin,
  };
  const want: Side = roll < s.women ? 'women' : roll < s.women + s.icons ? 'icons' : 'men';
  if (ok[want]) return p[want];
  if (ok.men) return p.men;
  const other = (['women', 'icons'] as const).find((k) => ok[k]);
  return other ? p[other] : p.men;
}

export function poolSizes(rows: Iterable<PlayerRow>, now: number, from: number, to: number, side: Side = 'men'): Record<number, number> {
  const ok = [...rows].filter((r) => eligible(r, now, side));
  const out: Record<number, number> = {};
  for (let m = from; m <= to; m++) out[m] = ok.filter((r) => r.rating >= m).length;
  return out;
}
