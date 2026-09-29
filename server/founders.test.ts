import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earnsSpot, foundersState } from './founders.js';

const base = { admin: false, alreadyFounder: false, taken: 12, limit: 50, personaUsed: false };

test('foundersState', () => {
  assert.deepEqual(foundersState(13, 50), { limit: 50, taken: 13, left: 37 });
  assert.deepEqual(foundersState(50, 50), { limit: 50, taken: 50, left: 0 });
  assert.deepEqual(foundersState(51, 50), { limit: 50, taken: 51, left: 0 }); // never negative
});

test('earnsSpot', () => {
  assert.equal(earnsSpot(base), true);
  assert.equal(earnsSpot({ ...base, taken: 49 }), true); // the last spot
  assert.equal(earnsSpot({ ...base, taken: 50 }), false); // full
  assert.equal(earnsSpot({ ...base, admin: true }), false); // admins are Premium anyway
  assert.equal(earnsSpot({ ...base, alreadyFounder: true }), false); // one spot per user
  assert.equal(earnsSpot({ ...base, personaUsed: true }), false); // one EA account, one spot
});
