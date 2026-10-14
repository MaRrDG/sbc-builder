// What a card costs the solver, in coins (pure). EA's AVG (`marketAverage`, the price the web app shows on
// the card; for an untradeable it is the AVG of the tradeable version). The solver minimises the sum.
import type { Player } from './squad.js';

/** An untradeable counts at half its AVG: a tradeable is picked only when it is under half the price. */
export const UNTRADEABLE_WEIGHT = 0.5;
/** SBC storage has little room and holds duplicates: use it first. */
export const STORAGE_WEIGHT = 0.8;
/** Last resort when no card of any rating has an AVG. */
export const DEFAULT_PRICE = 200;

/**
 * Price of a card without an AVG: the median AVG of the cards with that rating, else of the nearest
 * rating that has one (the higher one on a tie), else DEFAULT_PRICE.
 */
export function fallbackPrices(cards: Player[]): (rating: number) => number {
  const by = new Map<number, number[]>();
  for (const p of cards) if (p.price) (by.get(p.rating) ?? by.set(p.rating, []).get(p.rating)!).push(p.price);
  const median = new Map([...by].map(([r, xs]) => {
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return [r, s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2];
  }));
  return (rating) => {
    for (let d = 0; d <= 99; d++) {
      const hit = median.get(rating + d) ?? median.get(rating - d);
      if (hit !== undefined) return hit;
    }
    return DEFAULT_PRICE;
  };
}

/** The card's AVG, or the fallback when EA sent none. */
export const priceOf = (p: Player, fallback: (rating: number) => number): number => p.price || fallback(p.rating);

/** Solver cost of one card: its price, ×0.5 when untradeable, ×0.8 in SBC storage. */
export function playerCost(p: Player, fallback: (rating: number) => number): number {
  let c = priceOf(p, fallback);
  if (p.untradeable) c *= UNTRADEABLE_WEIGHT;
  if (p.inStorage) c *= STORAGE_WEIGHT;
  return Math.round(c * 100) / 100;
}

/** Cost function for a pool: the fallback prices come from that same pool. */
export function costOf(pool: Player[]): (p: Player) => number {
  const fallback = fallbackPrices(pool);
  return (p) => playerCost(p, fallback);
}
