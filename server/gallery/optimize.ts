// Best Gallery lineup from the ledger: greedy by score, then push tag tiers, then single swaps
// while the exact total (scoreSet) rises. Pure.
import { matchesFilter, scoreSet } from './score.js';
import { TAGS, type Tag } from './tags.js';
import type { GalleryItem, GallerySet } from './types.js';

const MAX_ROUNDS = 40;
const TOP_GROUPS = 2; // pool-wide groups tried for `same` tags besides the lineup's own
const SWAP_POOL = 1; // swap candidates: the top SWAP_POOL x size items by score

type Key = number | string;

/** One way to raise a tag's count: `counted` items already in the lineup, `outside` items that would add to it. */
interface Option {
  counted: number;
  keep: Set<number>; // ids in the lineup that must not be dropped
  outside: GalleryItem[];
}

export function bestLineup(set: GallerySet, pool: GalleryItem[]): GalleryItem[] {
  const eligible = pool.filter((i) => matchesFilter(set.filter, i)).sort((a, b) => b.score - a.score);
  if (eligible.length <= set.size) return eligible;
  let cur = eligible.slice(0, set.size);
  let best = scoreSet(set, cur).total;
  const tryLineup = (next: GalleryItem[]) => {
    const t = scoreSet(set, next).total;
    if (t > best) {
      cur = next;
      best = t;
      return true;
    }
    return false;
  };

  // Per tag, built once: eligible items by score (filter), by group (same), best per value (different).
  const matching = new Map<Tag, GalleryItem[]>();
  const groups = new Map<Tag, Map<Key, GalleryItem[]>>();
  const topKeys = new Map<Tag, Key[]>();
  const bestPer = new Map<Tag, GalleryItem[]>();
  for (const tag of TAGS) {
    const r = tag.rule;
    if (r.kind === 'filter') {
      matching.set(tag, eligible.filter(r.test));
      continue;
    }
    const g = new Map<Key, GalleryItem[]>();
    for (const i of eligible) {
      const k = r.key(i);
      const list = g.get(k);
      if (list) list.push(i);
      else g.set(k, [i]);
    }
    if (r.kind === 'different') {
      bestPer.set(tag, [...g.values()].map((l) => l[0]).sort((a, b) => b.score - a.score)); // each list is score-descending
    } else {
      groups.set(tag, g);
      const sum = (l: GalleryItem[]) => l.reduce((s, i) => s + i.score, 0);
      topKeys.set(tag, [...g.entries()]
        .sort((a, b) => b[1].length - a[1].length || sum(b[1]) - sum(a[1]))
        .slice(0, TOP_GROUPS)
        .map(([k]) => k));
    }
  }

  const options = (tag: Tag): Option[] => {
    const r = tag.rule;
    const ids = new Set(cur.map((i) => i.id));
    const free = (l: GalleryItem[]) => l.filter((i) => !ids.has(i.id));
    if (r.kind === 'filter') {
      const keep = new Set(cur.filter(r.test).map((i) => i.id));
      return [{ counted: keep.size, keep, outside: free(matching.get(tag)!) }];
    }
    if (r.kind === 'same') {
      const inCur = new Map<Key, number>();
      for (const i of cur) inCur.set(r.key(i), (inCur.get(r.key(i)) ?? 0) + 1);
      const own = [...inCur.entries()].sort((a, b) => b[1] - a[1]).slice(0, TOP_GROUPS).map(([k]) => k);
      const keys = new Set<Key>([...own, ...topKeys.get(tag)!]);
      return [...keys].map((k) => {
        const keep = new Set(cur.filter((i) => r.key(i) === k).map((i) => i.id));
        return { counted: keep.size, keep, outside: free(groups.get(tag)!.get(k) ?? []) };
      });
    }
    // different: the lineup's best per value counts; new values come from the pool's best per value
    const bestIn = new Map<Key, GalleryItem>();
    for (const i of cur) {
      const k = r.key(i);
      const o = bestIn.get(k);
      if (!o || i.score > o.score) bestIn.set(k, i);
    }
    const keep = new Set([...bestIn.values()].map((i) => i.id));
    return [{ counted: keep.size, keep, outside: bestPer.get(tag)!.filter((i) => !bestIn.has(r.key(i))) }];
  };

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let improved = false;
    // 1. tier push: for each tag, bring in enough matching items to reach each higher tier
    for (const tag of TAGS) {
      let hit = false;
      for (const o of options(tag)) {
        for (const [min] of tag.tiers) {
          const need = min - o.counted;
          if (need <= 0 || need > o.outside.length) continue;
          const drop = cur.filter((i) => !o.keep.has(i.id)).sort((a, b) => a.score - b.score).slice(0, need);
          if (drop.length < need) continue;
          const dropIds = new Set(drop.map((i) => i.id));
          if (tryLineup([...cur.filter((i) => !dropIds.has(i.id)), ...o.outside.slice(0, need)])) {
            improved = hit = true;
            break;
          }
        }
        if (hit) break;
      }
    }
    if (improved) continue; // keep pushing tiers while that pays
    // 2. single swaps among the top candidates, only once the tier push is stable: keep every swap that raises the total
    const ids = new Set(cur.map((i) => i.id));
    const cand = eligible.slice(0, set.size * SWAP_POOL);
    for (let k = 0; k < cur.length; k++) {
      for (const inn of cand) {
        if (inn.score <= cur[k].score) break; // cand is score-descending; lower swaps are the tier push's job
        if (ids.has(inn.id)) continue;
        const out = cur[k];
        const next = cur.slice();
        next[k] = inn;
        if (tryLineup(next)) {
          ids.delete(out.id);
          ids.add(inn.id);
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return cur;
}
