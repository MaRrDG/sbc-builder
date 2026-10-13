// What a saved squad is worth: the sum of EA's marketAverage of its cards (EA's "AVG" on the card).
import type { SquadSlot } from './parse.js';

export const STARTERS = 11;

/** The item fields the value reads (club cache item or the squad response's itemData). */
export interface PricedItem {
  marketAverage?: unknown;
  loansInfo?: unknown;
  loans?: unknown;
}

export interface SlotValue {
  index: number;
  itemId: number;
  /** coins; null when neither the club nor the squad response has a price */
  value: number | null;
  /** where the price came from */
  source: 'club' | 'squad' | null;
  /** a loan card: counts 0 */
  loan: boolean;
}

export interface SquadValue {
  starters: number;
  bench: number;
  total: number;
  /** cards without a price (not counted) */
  unknown: number;
  /** loan cards (counted as 0) */
  loans: number;
}

const price = (i: PricedItem | undefined) =>
  i && typeof i.marketAverage === 'number' && Number.isFinite(i.marketAverage) && i.marketAverage >= 0 ? i.marketAverage : null;
const isLoan = (i: PricedItem | undefined) => !!i && (!!i.loansInfo || (typeof i.loans === 'number' && i.loans > 0));

/** Per slot value (club cache first, then the squad's own itemData) and the totals; starters are index < 11. */
export function squadValue(players: SquadSlot[], clubById: ReadonlyMap<number, PricedItem>): { slots: SlotValue[]; value: SquadValue } {
  const value: SquadValue = { starters: 0, bench: 0, total: 0, unknown: 0, loans: 0 };
  const slots = players.map((p): SlotValue => {
    const club = clubById.get(p.itemId);
    const own = p.item as PricedItem | undefined;
    if (isLoan(club) || isLoan(own)) {
      value.loans++;
      return { index: p.index, itemId: p.itemId, value: 0, source: null, loan: true };
    }
    const fromClub = price(club);
    const v = fromClub ?? price(own);
    const source = fromClub !== null ? 'club' : v !== null ? 'squad' : null;
    if (v === null) value.unknown++;
    else if (p.index < STARTERS) value.starters += v;
    else value.bench += v;
    return { index: p.index, itemId: p.itemId, value: v, source, loan: false };
  });
  value.total = value.starters + value.bench;
  return { slots, value };
}
