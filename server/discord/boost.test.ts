import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseBoosters, reconcileBoosts } from './boost.js';

const D1 = '111111111111111111', D2 = '222222222222222222', D3 = '333333333333333333';

test('linked boosters not yet marked start; marked users who stopped boosting stop; unchanged ones are left alone', () => {
  const r = reconcileBoosts(
    [
      { userId: 'u1', discordId: D1, boostSince: null }, // started
      { userId: 'u2', discordId: D2, boostSince: 1000 }, // still boosting
      { userId: 'u3', discordId: D3, boostSince: 2000 }, // stopped
    ],
    new Map([[D1, 5000], [D2, 1000]]),
  );
  assert.deepEqual(r.start, [{ userId: 'u1', discordId: D1, since: 5000 }]);
  assert.deepEqual(r.stop, [{ userId: 'u3', discordId: D3 }]);
});

test('boosters without an FC Solver link are not in `linked`, so nothing happens for them', () => {
  assert.deepEqual(reconcileBoosts([], new Map([[D1, 5000]])), { start: [], stop: [] });
});

test('repeating a start keeps the original boost; stopping a non-boosting user does nothing', () => {
  assert.deepEqual(reconcileBoosts([{ userId: 'u1', discordId: D1, boostSince: 1000 }], new Map([[D1, 9000]])), { start: [], stop: [] });
  assert.deepEqual(reconcileBoosts([{ userId: 'u1', discordId: D1, boostSince: null }], new Map()), { start: [], stop: [] });
});

test('booster list: valid ids and times only; anything else rejects the whole list', () => {
  assert.deepEqual([...parseBoosters({ boosters: [{ discordId: D1, since: 5 }] })!], [[D1, 5]]);
  assert.deepEqual([...parseBoosters({ boosters: [] })!], []);
  assert.equal(parseBoosters({ boosters: [{ discordId: 'x', since: 5 }] }), null);
  assert.equal(parseBoosters({ boosters: [{ discordId: D1, since: -1 }] }), null);
  assert.equal(parseBoosters({}), null);
});
