import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSse, refetchPlan } from './sse';

test('parseSse: whole events out, partial kept, comments skipped', () => {
  const r = parseSse(': ping\n\nevent: status\ndata: {"a":1}\n\nevent: changed\ndata: {"ke');
  assert.deepEqual(r.events, [{ event: 'status', data: '{"a":1}' }]);
  assert.equal(r.rest, 'event: changed\ndata: {"ke');
  assert.deepEqual(parseSse(r.rest + 'ys":[]}\n\n').events, [{ event: 'changed', data: '{"keys":[]}' }]);
});

test('refetchPlan: only what changed', () => {
  assert.deepEqual(refetchPlan(['club'], null), { club: true, sets: false, challenges: false, other: false });
  assert.deepEqual(refetchPlan(['storage', 'squad'], null), { club: true, sets: false, challenges: false, other: false });
  assert.deepEqual(refetchPlan(['sets'], 7), { club: false, sets: true, challenges: false, other: false });
  assert.deepEqual(refetchPlan(['challenges/7'], 7), { club: false, sets: true, challenges: true, other: false });
  assert.deepEqual(refetchPlan(['challenges/8'], 7), { club: false, sets: true, challenges: false, other: false });
  assert.deepEqual(refetchPlan(['academy', 'edited'], null), { club: false, sets: false, challenges: false, other: true });
});
