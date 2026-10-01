import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterSort, progress } from './gallery.js';
import type { GallerySetResult } from '../../api.js';

const s = (p: Partial<GallerySetResult>): GallerySetResult => ({
  id: 'x', name: 'X', category: 'club', size: 20, filled: 20, missing: 0, base: 0, bonus: 0, score: 0,
  grade: 'C', next: { grade: 'B', need: 500 }, grades: { D: 10, C: 1000, B: 2000, A: 3000, S: 4000 }, rewards: {}, tags: [], badge: null, lineup: [], ...p,
});
const all = { category: 'all', state: 'all', minGrade: null } as const;

test('progress to the next grade', () => {
  assert.equal(progress(s({ score: 1500, grade: 'C', next: { grade: 'B', need: 500 } })), 0.5);
  assert.equal(progress(s({ score: 4000, grade: 'S', next: null })), 1);
  assert.equal(progress(s({ score: 0, grade: null, filled: 3, missing: 17, next: { grade: 'D', need: 10 } })), 0);
});

test('filters and sorts', () => {
  const sets = [
    s({ id: 'a', name: 'B', score: 1500, category: 'club' }),
    s({ id: 'b', name: 'A', score: 3500, grade: 'A', next: { grade: 'S', need: 500 }, category: 'league' }),
    s({ id: 'c', name: 'C', score: 100, grade: null, filled: 5, missing: 15 }),
  ];
  assert.deepEqual(filterSort(sets, all, 'score').map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(filterSort(sets, all, 'name').map((x) => x.id), ['b', 'a', 'c']);
  assert.deepEqual(filterSort(sets, { ...all, state: 'incomplete' }, 'score').map((x) => x.id), ['c']);
  assert.deepEqual(filterSort(sets, { ...all, category: 'league' }, 'score').map((x) => x.id), ['b']);
  assert.deepEqual(filterSort(sets, { ...all, minGrade: 'B' }, 'score').map((x) => x.id), ['b']);
  assert.deepEqual(filterSort(sets, all, 'grade').map((x) => x.id), ['b', 'a', 'c']);
});
