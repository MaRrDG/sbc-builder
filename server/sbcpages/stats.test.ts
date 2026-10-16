import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeSolves } from './stats.js';

const r = (userId: string | null, found: boolean) => ({ userId, found });

test('hidden under 5 distinct solvers', () => {
  assert.equal(summarizeSolves([r('a', true), r('b', true), r('c', true), r('d', true), r('d', true)]), null);
});

test('distinct users, found share over users who ever found one', () => {
  const rows = [r('a', true), r('a', false), r('b', false), r('c', true), r('d', false), r('e', true), r(null, true)];
  assert.deepEqual(summarizeSolves(rows), { solvers: 5, foundPct: 60 });
});
