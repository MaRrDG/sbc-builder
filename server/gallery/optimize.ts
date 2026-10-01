// Best Gallery lineup from the ledger: greedy by score, then push tag tiers, then single swaps
// while the exact total (scoreSet) rises. Pure.
import { matchesFilter, scoreSet } from './score.js';
import { TAGS, tagMatches } from './tags.js';
import type { GalleryItem, GallerySet } from './types.js';

const MAX_ROUNDS = 40;

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

  for (let round = 0; round < MAX_ROUNDS; round++) {
    let improved = false;
    // 1. tier push: for each tag, bring in enough matching items to reach each higher tier
    for (const tag of TAGS) {
      const inLineup = new Set(tagMatches(tag, cur).map((i) => i.id));
      const outside = tagMatches(tag, eligible).filter((i) => !cur.some((c) => c.id === i.id));
      for (const [min] of tag.tiers) {
        const need = min - inLineup.size;
        if (need <= 0 || need > outside.length) continue;
        const drop = cur.filter((i) => !inLineup.has(i.id)).sort((a, b) => a.score - b.score).slice(0, need);
        if (drop.length < need) continue;
        const dropIds = new Set(drop.map((i) => i.id));
        if (tryLineup([...cur.filter((i) => !dropIds.has(i.id)), ...outside.slice(0, need)])) {
          improved = true;
          break;
        }
      }
    }
    // 2. single swaps: first one that raises the total
    const ids = new Set(cur.map((i) => i.id));
    swap: for (let k = 0; k < cur.length; k++) {
      for (const inn of eligible) {
        if (ids.has(inn.id)) continue;
        const next = cur.slice();
        next[k] = inn;
        if (tryLineup(next)) {
          improved = true;
          break swap;
        }
      }
    }
    if (!improved) break;
  }
  return cur;
}
