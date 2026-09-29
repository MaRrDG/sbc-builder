import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clubDueOnVisit, clubManualAt } from './visit-rules.js';

const H = 60 * 60 * 1000;
const M = 60 * 1000;

test('clubDueOnVisit', () => {
  const now = 100 * H;
  assert.equal(clubDueOnVisit(null, now, 2 * H), true); // never synced
  assert.equal(clubDueOnVisit(now - 3 * H, now, 2 * H), true); // stale
  assert.equal(clubDueOnVisit(now - 2 * H, now, 2 * H), true); // exactly at the threshold
  assert.equal(clubDueOnVisit(now - 1 * H, now, 2 * H), false); // fresh
});

test('clubManualAt', () => {
  const now = 100 * H;
  assert.equal(clubManualAt(null, now, 15 * M), null); // never synced: go
  assert.equal(clubManualAt(now - 20 * M, now, 15 * M), null); // cooldown over
  assert.equal(clubManualAt(now - 15 * M, now, 15 * M), null); // exactly at the end
  assert.equal(clubManualAt(now - 5 * M, now, 15 * M), now + 10 * M); // wait 10 more minutes
});
