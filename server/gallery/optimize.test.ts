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

test('both versions of one player are kept when Multiples pays', () => {
  // two copies of assetId 9 (different ids) at 1000 beat the singles 1050 / 1040: 2000 + 10% > 2090
  const pool = [item({ score: 1050 }), item({ score: 1040 }), item({ assetId: 9, score: 1000 }), item({ assetId: 9, score: 1000 }), item({ score: 100 })];
  const s = set({ size: 2 });
  const pick = bestLineup(s, pool);
  assert.equal(pick.filter((i) => i.assetId === 9).length, 2);
  assert.equal(new Set(pick.map((i) => i.id)).size, 2);
});

test('same-tag push completes the lineup group, not the pool-wide largest group', () => {
  // league 1 is the pool's largest group (12 cheap cards). Greedy holds 3 league-2 cards; getting league 2 to 5
  // needs two swaps at once (+1% on 5 cards beats losing 80), and no single swap pays.
  const mk = (league: number, score: number) => item({ league, score, position: 'CF' });
  const l1 = [...Array(12)].map(() => mk(1, 10));
  const l2 = [2000, 1900, 1800, 1690, 1680].map((x) => mk(2, x));
  const other = [1750, 1700].map((x) => mk(3, x));
  const pool = [...l1, ...l2, ...other];
  const s = set({ size: 5 });
  const pick = bestLineup(s, pool);
  assert.equal(pick.filter((i) => i.league === 2).length, 5);
  assert.ok(total(s, pick) > total(s, greedy(s, pool)));
});

test('fast on a ~2000 item pool', () => {
  const pool = [...Array(2000)].map((_, k) => item({
    score: ((k * 7919) % 9000) + 20,
    rating: 55 + (k % 40),
    league: k % 17, nation: k % 29, club: k % 61,
    assetId: 1000 + (k % 700),
    firstOwner: k % 5 === 0,
    kind: k % 50 === 0 ? 'icon' : k % 37 === 0 ? 'hero' : null,
    position: ['GK', 'CB', 'LB', 'CM', 'CAM', 'ST', 'RW'][k % 7],
    weakFoot: 1 + (k % 5), skillMoves: k % 5,
  }));
  const sets = [0, 1, 2, 3, 4].map((x) => set({ size: 20, filter: x ? { leagues: [x, x + 1, x + 2] } : {} }));
  const t0 = performance.now();
  const picks = sets.map((s) => bestLineup(s, pool));
  const avg = (performance.now() - t0) / sets.length;
  sets.forEach((s, k) => {
    const elig = pool.filter((i) => !s.filter.leagues || s.filter.leagues.includes(i.league));
    assert.ok(total(s, picks[k]) >= total(s, greedy(s, elig)));
  });
  assert.ok(avg < 20, `avg ${avg.toFixed(1)} ms per set`);
});
