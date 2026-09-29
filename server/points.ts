// Points SBCs ("Player SBCs"): EA asks for a points total instead of a squad. A card is worth its
// gradingScore as EA sends it; requirements apply to every card on its own.
import { Key, Scope, ATTRIBUTE_NAMES, type Requirement } from './sbc.js';
import { matchesKey, type Player } from './squad.js';

export const isPointsChallenge = (c: { scoreRequirement?: number }) => (c.scoreRequirement ?? 0) > 0;

/** Points still missing: a challenge can be handed in over several submissions. */
export const pointsTarget = (c: { scoreRequirement?: number; submittedScore?: number }) =>
  Math.max(0, (c.scoreRequirement ?? 0) - (c.submittedScore ?? 0));

// attribute id (key 41) -> the card's value for it; ids missing here cannot be checked
const ATTRIBUTE_VALUE: Record<number, (p: Player) => number> = { 1: (p) => p.rating };
// single-key requirements every card must meet (count -1): matchesKey knows them
const EVERY_CARD = new Set<number>([
  Key.NATION_ID, Key.LEAGUE_ID, Key.CLUB_ID, Key.PLAYER_RARITY, Key.PLAYER_RARITY_GROUP, Key.PLAYER_LEVEL,
  Key.PLAYER_MIN_OVR, Key.PLAYER_MAX_OVR, Key.PLAYER_EXACT_OVR, Key.PLAYER_TRADABILITY,
]);

/** A requirement as a test every card must pass, or null when we cannot check it. */
export function cardRule(r: Requirement): ((p: Player) => boolean) | null {
  const cmp = (a: number, v: number) => (r.scope === Scope.GREATER ? a >= v : r.scope === Scope.LOWER ? a <= v : a === v);
  const attr = r.keys.get(Key.ATTRIBUTE_ID)?.[0];
  if (attr !== undefined) {
    const read = ATTRIBUTE_VALUE[attr];
    const v = r.keys.get(Key.ATTRIBUTE_VALUE)?.[0];
    return read !== undefined && attr in ATTRIBUTE_NAMES && v !== undefined && r.keys.size === 2 ? (p) => cmp(read(p), v) : null;
  }
  if (r.combined || r.count !== -1 || r.keys.size !== 1) return null;
  const [key, vals] = [...r.keys][0];
  if (key === Key.PLAYER_QUALITY) return (p) => cmp(p.tier, vals[0]);
  return EVERY_CARD.has(key) ? (p) => matchesKey(p, key, vals) : null;
}

export interface PointsCheck {
  total: number;
  overshoot: number;
  results: { text: string; met: boolean; actual: number | string; unchecked?: boolean }[];
  allMet: boolean;
}

/** The exact re-check of a selection: `found` comes from here, never from the solver. */
export function checkPoints(cards: Player[], target: number, reqs: Requirement[]): PointsCheck {
  const total = cards.reduce((s, p) => s + p.points, 0);
  const results = reqs.map((r) => {
    const rule = cardRule(r);
    if (!rule) return { text: r.text, met: false, actual: '?', unchecked: true };
    const off = cards.filter((p) => !rule(p)).length;
    return { text: r.text, met: off === 0, actual: cards.length - off };
  });
  const unique = new Set(cards.map((p) => p.id)).size === cards.length;
  const allMet = target > 0 && total >= target && unique && cards.every((p) => p.points > 0) && results.every((x) => x.met);
  return { total, overshoot: Math.max(0, total - target), results, allMet };
}

/** Points the club can really offer: the solver takes one card per assetId, so only the best copy counts. */
export function usablePoints(cards: Player[]): number {
  const best = new Map<number, number>();
  for (const p of cards) best.set(p.assetId, Math.max(best.get(p.assetId) ?? 0, p.points));
  let sum = 0;
  for (const v of best.values()) sum += v;
  return sum;
}
