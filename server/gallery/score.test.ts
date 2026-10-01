import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchesFilter, scoreSet, gradeFor, nextGrade } from './score.js';
import { rarityKinds } from './tags.js';
import type { GalleryItem, GallerySet } from './types.js';

let nextId = 1;
const item = (p: Partial<GalleryItem> = {}): GalleryItem => ({
  id: nextId++, assetId: nextId * 100, rating: 84, rareflag: 1, kind: null, score: 830,
  nation: nextId, league: 13, club: nextId, gender: 0, position: 'CB', weakFoot: 3, skillMoves: 2, firstOwner: false, ...p,
});
const set = (p: Partial<GallerySet> = {}): GallerySet => ({
  id: 't', name: 'T', category: 'club', size: 5, filter: {},
  grades: { D: 10, C: 1000, B: 5000, A: 10000, S: 20000 }, ...p,
});
const tag = (r: ReturnType<typeof scoreSet>, id: string) => r.tags.find((t) => t.id === id);

test('base is the sum of item scores; grade from thresholds', () => {
  const r = scoreSet(set(), [1000, 1000, 1000, 1000, 1000].map((score) => item({ score, rating: 70 })));
  assert.equal(r.base, 5000);
  assert.equal(r.filled, 5);
  assert.equal(r.missing, 0);
  assert.equal(gradeFor(set(), 4999), 'C');
  assert.equal(gradeFor(set(), 5000), 'B');
  assert.equal(gradeFor(set(), 9), null);
  assert.deepEqual(nextGrade(set(), 5000), { grade: 'A', need: 5000 });
  assert.equal(nextGrade(set(), 20000), null);
});

test('incomplete set has no grade', () => {
  const r = scoreSet(set(), [item(), item()]);
  assert.equal(r.grade, null);
  assert.equal(r.missing, 3);
  assert.ok(r.total > 0);
});

test('Silver tier: 5 silver items +15%, floored', () => {
  const items = [101, 101, 101, 101, 101].map((score) => item({ score, rating: 70 }));
  const r = scoreSet(set(), items);
  assert.deepEqual(tag(r, 'silver'), { id: 'silver', count: 5, pct: 15, bonus: 75, next: { min: 10, pct: 30 } }); // floor(505 * .15) = 75
});

test('below the first tier a tag pays nothing but is listed with the tier it needs, after the paying ones', () => {
  const r = scoreSet(set(), [70, 70, 70, 70, 90].map((rating) => item({ rating, score: 100 })));
  assert.deepEqual(tag(r, 'silver'), { id: 'silver', count: 4, pct: 0, bonus: 0, next: { min: 5, pct: 15 } }); // 4 silver < 5
  assert.equal(tag(r, 'bronze'), undefined); // count 0: not listed
  assert.equal(r.bonus, r.tags.reduce((s, t) => s + t.bonus, 0));
  const firstUnmet = r.tags.findIndex((t) => t.pct === 0);
  assert.ok(firstUnmet > 0 && r.tags.slice(firstUnmet).every((t) => t.pct === 0), 'met tags come first');
  assert.equal(tag(scoreSet(set({ size: 20 }), [...Array(20)].map(() => item({ score: 10 }))), 'golden')?.next, null); // top tier
});

test('Same League pays on the largest group only', () => {
  const items = [...Array(5)].map(() => item({ league: 13, score: 1000 })).concat([item({ league: 53, score: 9999 })]);
  const r = scoreSet(set({ size: 6 }), items);
  assert.deepEqual(tag(r, 'sameLeague'), { id: 'sameLeague', count: 5, pct: 1, bonus: 50, next: { min: 10, pct: 2 } });
});

test('Different Nation counts distinct nations, best item per nation', () => {
  const items = [1, 2, 3, 4, 5].map((nation) => item({ nation, score: 1000 })).concat([item({ nation: 1, score: 50 })]);
  const r = scoreSet(set({ size: 6 }), items);
  assert.deepEqual(tag(r, 'differentNation'), { id: 'differentNation', count: 5, pct: 1, bonus: 50, next: { min: 10, pct: 2 } });
});

test('Multiples counts two versions of the same player (Arsenal: 6875 + 4100 → 1097)', () => {
  const r = scoreSet(set({ size: 2 }), [item({ assetId: 7, score: 6875 }), item({ assetId: 7, score: 4100 })]);
  assert.deepEqual(tag(r, 'multiples'), { id: 'multiples', count: 2, pct: 10, bonus: 1097, next: { min: 3, pct: 15 } });
});

test('Golden 20 items +4% matches fut.gg Arsenal (base 92,790 → 3,711)', () => {
  const scores = [11000, 8300, 8300, 8300, 8300, 6875, 6875, 5500, 5500, 4100, 4100, 4100, 4100, 2100, 2100, 830, 830, 830, 410, 340];
  const r = scoreSet(set({ size: 20 }), scores.map((score) => item({ score, rating: 84 })));
  assert.equal(r.base, 92790);
  assert.equal(tag(r, 'golden')?.bonus, 3711);
});

test('First Owner 5 items +150%', () => {
  const r = scoreSet(set(), [...Array(5)].map(() => item({ firstOwner: true, score: 100 })));
  assert.deepEqual(tag(r, 'firstOwner'), { id: 'firstOwner', count: 5, pct: 150, bonus: 750, next: { min: 10, pct: 300 } });
});

test('Iconic 2 items +10%, kind from rarity names', () => {
  const kinds = rarityKinds({ '3': 'Team of the Week', '12': 'Base Icon', '72': 'Base Hero', '1': 'Rare', '200': 'Holographic' });
  assert.deepEqual(kinds, { 3: 'totw', 12: 'icon', 72: 'hero', 200: 'holo' });
  // real EA names (data/static.json item.raretype*): plurals, upper case, abbreviations
  assert.deepEqual(
    rarityKinds({
      '155': 'Team of the Year ICON', '171': 'UEFA Heroes (Mens)', '172': 'UEFA Heroes (Womens)', '77': 'Trophy Titans Hero',
      '21': 'Prime Hero', '9': 'Base Hall of FUT', '5': 'Team of the Year', '0': 'Common', '150': 'Ones to Watch', '300': 'TOTW Moments',
    }),
    { 155: 'icon', 171: 'hero', 172: 'hero', 77: 'hero', 21: 'hero', 300: 'totw' },
  );
  const r = scoreSet(set({ size: 2 }), [item({ kind: 'icon', score: 1000 }), item({ kind: 'icon', score: 1000 })]);
  assert.deepEqual(tag(r, 'iconic'), { id: 'iconic', count: 2, pct: 10, bonus: 200, next: { min: 4, pct: 15 } });
});

test('position, weak foot and skill tags', () => {
  const gk = [...Array(3)].map(() => item({ position: 'GK', score: 100 }));
  assert.equal(tag(scoreSet(set({ size: 3 }), gk), 'handsOnly')?.pct, 3);
  const wf = [...Array(3)].map(() => item({ weakFoot: 5, score: 100 }));
  assert.equal(tag(scoreSet(set({ size: 3 }), wf), 'ambidextrous')?.pct, 3);
  const sm = [...Array(3)].map(() => item({ skillMoves: 4, score: 100 })); // EA 0-based: 4 = 5★
  assert.equal(tag(scoreSet(set({ size: 3 }), sm), 'skilled')?.pct, 3);
  const mid = [...Array(5)].map(() => item({ position: 'CAM', score: 100 }));
  assert.equal(tag(scoreSet(set(), mid), 'midfieldControl')?.pct, 3);
});

test('matchesFilter: OR inside a key, AND between keys, assetIds widen clubs', () => {
  const a = item({ club: 1, league: 13 });
  assert.equal(matchesFilter({ clubs: [1, 2] }, a), true);
  assert.equal(matchesFilter({ clubs: [2] }, a), false);
  assert.equal(matchesFilter({ clubs: [1], leagues: [53] }, a), false);
  assert.equal(matchesFilter({ clubs: [2], assetIds: [a.assetId] }, a), true);
  assert.equal(matchesFilter({ kinds: ['icon'] }, item({ kind: 'icon' })), true);
  assert.equal(matchesFilter({ minRating: 85 }, a), false);
  assert.equal(matchesFilter({}, a), true);
});
