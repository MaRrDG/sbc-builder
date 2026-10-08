import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY } from './players.js';
import { eligible, poolOf, poolSizes } from './pool.js';
import type { PlayerRow } from './types.js';

const NOW = 2_000 * DAY;
const row = (p: Partial<PlayerRow> = {}): PlayerRow => ({
  assetId: 1, name: 'A', fullName: 'A A', nation: 14, league: 13, club: 1, position: 'ST', rating: 85, rareflag: 1, cardType: 'normal',
  baseClubs: [{ club: 1, league: 13, lastSeen: NOW - DAY }], firstSeen: 0, lastSeen: NOW, ...p,
});
const opts = { minRating: 82, minPool: 2, floor: 75, recent: new Set<number>(), now: NOW };

test('eligible: top 5 league, fresh base card, not in transfer', () => {
  assert.equal(eligible(row(), NOW), true);
  assert.equal(eligible(row({ league: 10 }), NOW), false);
  assert.equal(eligible(row({ baseClubs: [] }), NOW), false); // special cards only
  assert.equal(eligible(row({ baseClubs: [{ club: 1, league: 13, lastSeen: NOW - 31 * DAY }] }), NOW), false);
  assert.equal(eligible(row({ baseClubs: [{ club: 2, league: 13, lastSeen: NOW - DAY }, { club: 1, league: 13, lastSeen: NOW - 2 * DAY }] }), NOW), false);
});

test('poolOf keeps ratings at or above the threshold and drops recent answers', () => {
  const rows = [row({ assetId: 1, rating: 90 }), row({ assetId: 2, rating: 82 }), row({ assetId: 3, rating: 81 }), row({ assetId: 4, rating: 88 })];
  const p = poolOf(rows, { ...opts, recent: new Set([4]) });
  assert.deepEqual(p.players.map((r) => r.assetId).sort(), [1, 2]);
  assert.equal(p.minRating, 82);
});

test('poolOf steps the threshold down until the pool is big enough, not below the floor', () => {
  const rows = [row({ assetId: 1, rating: 83 }), row({ assetId: 2, rating: 79 }), row({ assetId: 3, rating: 74 })];
  const p = poolOf(rows, opts);
  assert.equal(p.minRating, 79);
  assert.equal(p.players.length, 2);
  const floor = poolOf(rows, { ...opts, minPool: 10 });
  assert.equal(floor.minRating, 75);
  assert.equal(floor.players.length, 2);
});

test('poolOf on nothing is empty', () => {
  assert.deepEqual(poolOf([], opts).players, []);
});

test('poolSizes counts per threshold', () => {
  const rows = [row({ assetId: 1, rating: 83 }), row({ assetId: 2, rating: 79 })];
  assert.deepEqual(poolSizes(rows, NOW, 78, 84), { 78: 2, 79: 2, 80: 1, 81: 1, 82: 1, 83: 1, 84: 0 });
});
