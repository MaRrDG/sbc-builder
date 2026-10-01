// The 21 Gallery bonus tags (fut.gg, 27 Sept 2026). Each pays its tier percent on the items it matches.
import type { GalleryItem, RarityKind } from './types.js';

type Tier = [min: number, pct: number];
type Rule =
  | { kind: 'filter'; test: (i: GalleryItem) => boolean } // every item that passes
  | { kind: 'same'; key: (i: GalleryItem) => number | string } // the largest group sharing a value
  | { kind: 'different'; key: (i: GalleryItem) => number | string }; // best item per distinct value

export interface Tag {
  id: string;
  rule: Rule;
  tiers: Tier[]; // ascending by min
}

const STD: Tier[] = [[5, 1], [10, 2], [20, 4]];
const POS: Tier[] = [[5, 3], [10, 6], [15, 10]];
const DEF = new Set(['CB', 'LB', 'RB']);
const MID = new Set(['CDM', 'CM', 'CAM', 'LM', 'RM']);
const ATT = new Set(['ST', 'RW', 'LW']);

export const TAGS: Tag[] = [
  { id: 'sameNation', rule: { kind: 'same', key: (i) => i.nation }, tiers: STD },
  { id: 'differentNation', rule: { kind: 'different', key: (i) => i.nation }, tiers: STD },
  { id: 'sameClub', rule: { kind: 'same', key: (i) => i.club }, tiers: STD },
  { id: 'differentClub', rule: { kind: 'different', key: (i) => i.club }, tiers: STD },
  { id: 'sameLeague', rule: { kind: 'same', key: (i) => i.league }, tiers: [[5, 1], [10, 2], [20, 8]] },
  { id: 'differentLeague', rule: { kind: 'different', key: (i) => i.league }, tiers: STD },
  { id: 'bronze', rule: { kind: 'filter', test: (i) => i.rating < 65 }, tiers: [[5, 20], [10, 40], [20, 80]] },
  { id: 'silver', rule: { kind: 'filter', test: (i) => i.rating >= 65 && i.rating < 75 }, tiers: [[5, 15], [10, 30], [20, 60]] },
  { id: 'golden', rule: { kind: 'filter', test: (i) => i.rating >= 75 }, tiers: STD },
  { id: 'holographic', rule: { kind: 'filter', test: (i) => i.kind === 'holo' }, tiers: [[2, 8], [4, 12], [6, 20]] },
  { id: 'iconic', rule: { kind: 'filter', test: (i) => i.kind === 'icon' }, tiers: [[2, 10], [4, 15], [6, 25]] },
  { id: 'heroic', rule: { kind: 'filter', test: (i) => i.kind === 'hero' }, tiers: [[2, 8], [4, 12], [6, 20]] },
  { id: 'totw', rule: { kind: 'filter', test: (i) => i.kind === 'totw' }, tiers: [[3, 4], [6, 8], [10, 15]] },
  { id: 'firstOwner', rule: { kind: 'filter', test: (i) => i.firstOwner }, tiers: [[5, 150], [10, 300], [20, 500]] },
  { id: 'handsOnly', rule: { kind: 'filter', test: (i) => i.position === 'GK' }, tiers: [[3, 3], [6, 6], [10, 15]] },
  { id: 'multiples', rule: { kind: 'same', key: (i) => i.assetId }, tiers: [[2, 10], [3, 15], [4, 20]] },
  { id: 'ambidextrous', rule: { kind: 'filter', test: (i) => i.weakFoot === 5 }, tiers: [[3, 3], [5, 6], [10, 12]] },
  { id: 'skilled', rule: { kind: 'filter', test: (i) => i.skillMoves === 4 }, tiers: [[3, 3], [5, 6], [10, 12]] },
  { id: 'defensiveWall', rule: { kind: 'filter', test: (i) => DEF.has(i.position) }, tiers: POS },
  { id: 'midfieldControl', rule: { kind: 'filter', test: (i) => MID.has(i.position) }, tiers: POS },
  { id: 'allOutAttack', rule: { kind: 'filter', test: (i) => ATT.has(i.position) }, tiers: POS },
];

/** The items a tag counts. */
export function tagMatches(tag: Tag, items: GalleryItem[]): GalleryItem[] {
  const r = tag.rule;
  if (r.kind === 'filter') return items.filter(r.test);
  const groups = new Map<number | string, GalleryItem[]>();
  for (const i of items) {
    const k = r.key(i);
    const g = groups.get(k);
    if (g) g.push(i);
    else groups.set(k, [i]);
  }
  if (r.kind === 'different') return [...groups.values()].map((g) => g.reduce((a, b) => (b.score > a.score ? b : a)));
  let best: GalleryItem[] = [];
  let bestSum = -1;
  for (const g of groups.values()) {
    if (g.length < best.length) continue;
    const sum = g.reduce((s, i) => s + i.score, 0);
    if (g.length > best.length || sum > bestSum) {
      best = g;
      bestSum = sum;
    }
  }
  return best;
}

const SCRATCH_N = new Map<number | string, number>(); // reused by tagStats (single-threaded, not re-entrant)
const SCRATCH_S = new Map<number | string, number>();

/** How many items a tag counts and their score sum; same result as tagMatches without building arrays. */
export function tagStats(tag: Tag, items: GalleryItem[]): { count: number; sum: number } {
  const r = tag.rule;
  let count = 0;
  let sum = 0;
  if (r.kind === 'filter') {
    for (const i of items) if (r.test(i)) { count++; sum += i.score; }
    return { count, sum };
  }
  const cnt = SCRATCH_N;
  const tot = SCRATCH_S;
  cnt.clear();
  tot.clear();
  if (r.kind === 'different') {
    for (const i of items) {
      const k = r.key(i);
      const o = tot.get(k);
      if (o === undefined || i.score > o) tot.set(k, i.score);
    }
    for (const v of tot.values()) { count++; sum += v; }
    return { count, sum };
  }
  for (const i of items) {
    const k = r.key(i);
    cnt.set(k, (cnt.get(k) ?? 0) + 1);
    tot.set(k, (tot.get(k) ?? 0) + i.score);
  }
  for (const [k, n] of cnt) {
    const s = tot.get(k)!;
    if (n > count || (n === count && s > sum)) { count = n; sum = s; }
  }
  return { count, sum };
}

/** The tier percent for `count` matched items, 0 under the first tier. */
export function tierPct(tag: Tag, count: number): number {
  let pct = 0;
  for (const [min, p] of tag.tiers) if (count >= min) pct = p;
  return pct;
}

/** rareflag → kind, from EA's rarity names (meta.names.rarity). */
export function rarityKinds(names: Record<string, string>): Record<number, RarityKind> {
  const out: Record<number, RarityKind> = {};
  for (const [id, name] of Object.entries(names)) {
    const kind: RarityKind | null = /holo/i.test(name) ? 'holo'
      : /\bicon\b/i.test(name) ? 'icon'
      : /\bhero\b/i.test(name) ? 'hero'
      : /team of the week/i.test(name) ? 'totw'
      : null;
    if (kind) out[Number(id)] = kind;
  }
  return out;
}
