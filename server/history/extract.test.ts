import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extract } from './extract.js';

test('sets: every set of every category, timesCompleted as count', () => {
  const data = { categories: [{ sets: [{ setId: 1, timesCompleted: 1 }, { setId: 11, timesCompleted: 3 }] }, { sets: [{ setId: 4, timesCompleted: 0 }] }] };
  assert.deepEqual(extract('accounts/1005/sets', data), {
    personaId: 1005, kind: 'set',
    seen: [{ itemId: 1, count: 1 }, { itemId: 11, count: 3 }, { itemId: 4, count: 0 }],
  });
});

test('challenges of a set', () => {
  assert.deepEqual(extract('accounts/7/challenges/10', [{ challengeId: 25, timesCompleted: 0, status: 'NOT_STARTED' }]), {
    personaId: 7, kind: 'challenge', seen: [{ itemId: 25, count: 0 }],
  });
});

test('objectives: COMPLETED and REDEEMED are done, missing or IN_PROGRESS are not', () => {
  const data = { categories: [{ groupsList: [{ objectives: [
    { objectiveId: 1, state: 'REDEEMED' }, { objectiveId: 2, state: 'COMPLETED' }, { objectiveId: 3, state: 'IN_PROGRESS' }, { objectiveId: 4 },
  ] }] }] };
  assert.deepEqual(extract('accounts/7/objectives', data)?.seen, [
    { itemId: 1, done: true }, { itemId: 2, done: true }, { itemId: 3, done: false }, { itemId: 4, done: false },
  ]);
});

test('other cache keys are not history', () => {
  for (const k of ['accounts/7/club', 'accounts/7/challengeSquads/35', 'accounts/7/challenges/10/x', 'static', 'accounts/x/sets'])
    assert.equal(extract(k, []), null, k);
});

test('malformed payloads give no items, never a throw', () => {
  assert.deepEqual(extract('accounts/7/sets', null)?.seen, []);
  assert.deepEqual(extract('accounts/7/sets', { categories: [] })?.seen, []);
  assert.deepEqual(extract('accounts/7/objectives', { categories: [{ groupsList: 'x' }] })?.seen, []);
  assert.deepEqual(extract('accounts/7/challenges/3', { not: 'an array' })?.seen, []);
});
