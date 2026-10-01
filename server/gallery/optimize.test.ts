import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bestLineup } from './optimize.js';
import { scoreSet } from './score.js';
import type { GalleryItem, GallerySet } from './types.js';

let n = 1;
const item = (p: Partial<GalleryItem> = {}): GalleryItem => ({
  id: n++, assetId: n * 100, rating: 84, rareflag: 1, kind: null, score: 830,
  nation: n, league: n, club: n, gender: 0, position: 'CB', weakFoot: 3, skillMoves: 2, firstOwner: false, ...p,
});
const set = (p: Partial<GallerySet> = {}): GallerySet => ({
  id: 't', name: 'T', category: 'club', size: 5, filter: {},
  grades: { D: 10, C: 1000, B: 5000, A: 10000, S: 20000 }, ...p,
});
const total = (s: GallerySet, xs: GalleryItem[]) => scoreSet(s, xs).total;
const greedy = (s: GallerySet, pool: GalleryItem[]) => [...pool].sort((a, b) => b.score - a.score).slice(0, s.size);

test('takes the top items when no tag changes anything', () => {
  const pool = [500, 400, 300, 200, 100, 50].map((score) => item({ score, rating: 70, position: 'GK' }));
  const s = set();
  assert.deepEqual(bestLineup(s, pool).map((i) => i.score).sort((a, b) => b - a), [500, 400, 300, 200, 100]);
});

test('only items matching the filter', () => {
  const pool = [item({ club: 1, score: 10 }), item({ club: 2, score: 9999 })];
  assert.deepEqual(bestLineup(set({ filter: { clubs: [1] } }), pool).map((i) => i.club), [1]);
});

test('short pool returns what there is', () => {
  const pool = [item(), item()];
  assert.equal(bestLineup(set(), pool).length, 2);
});

test('reaches the 5th First Owner when +150% beats a higher card', () => {
  // greedy picks the 1000 non-first-owner card; 5 first owners of 300 pay 1500 + 2250 bonus
  const fo = [...Array(5)].map(() => item({ score: 300, firstOwner: true }));
  const pool = [item({ score: 1000 }), ...fo];
  const s = set();
  const pick = bestLineup(s, pool);
  assert.equal(pick.filter((i) => i.firstOwner).length, 5);
  assert.ok(total(s, pick) > total(s, greedy(s, pool)));
});

test('reaches the 2nd Icon when +10% on both beats the swap cost', () => {
  const pool = [item({ score: 5000, kind: 'icon' }), item({ score: 2000 }), item({ score: 1990, kind: 'icon' })];
  const s = set({ size: 2 });
  const pick = bestLineup(s, pool);
  assert.equal(pick.filter((i) => i.kind === 'icon').length, 2); // 6990 + 699 > 7000
});

test('never worse than greedy', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const pool = [...Array(25)].map((_, k) => item({
      score: ((seed * 7919 + k * 104729) % 9000) + 20,
      rating: 60 + ((seed + k) % 35),
      league: (seed + k) % 3,
      nation: (seed * k) % 5,
      firstOwner: (seed + k) % 4 === 0,
      position: ['GK', 'CB', 'CM', 'ST'][k % 4],
    }));
    const s = set({ size: 11 });
    assert.ok(total(s, bestLineup(s, pool)) >= total(s, greedy(s, pool)), `seed ${seed}`);
  }
});
