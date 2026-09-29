import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clubDueOnVisit } from './visit-rules.js';

const H = 60 * 60 * 1000;

test('clubDueOnVisit', () => {
  const now = 100 * H;
  assert.equal(clubDueOnVisit(null, now, 2 * H, 0, 3), true); // never synced
  assert.equal(clubDueOnVisit(now - 3 * H, now, 2 * H, 1, 3), true); // stale
  assert.equal(clubDueOnVisit(now - 2 * H, now, 2 * H, 1, 3), true); // exactly at the threshold
  assert.equal(clubDueOnVisit(now - 1 * H, now, 2 * H, 0, 3), false); // fresh
  assert.equal(clubDueOnVisit(now - 5 * H, now, 2 * H, 3, 3), false); // cap reached
  assert.equal(clubDueOnVisit(null, now, 2 * H, 3, 3), false); // cap wins over missing club
});
