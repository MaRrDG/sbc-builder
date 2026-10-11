import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY } from './players.js';
import { eligible, pickPool, poolOf, poolSizes } from './pool.js';
import type { PlayerRow } from './types.js';

const NOW = 2_000 * DAY;
const row = (p: Partial<PlayerRow> = {}): PlayerRow => ({
  assetId: 1, name: 'A', fullName: 'A A', nation: 14, league: 13, club: 1, position: 'ST', rating: 85, rareflag: 1, cardType: 'normal', gender: 0,
  baseClubs: [{ club: 1, league: 13, lastSeen: NOW - DAY }], firstSeen: 0, lastSeen: NOW, ...p,
});
const woman = (p: Partial<PlayerRow> = {}) => row({ league: 2216, gender: 1, baseClubs: [{ club: 9, league: 2216, lastSeen: NOW - DAY }], ...p });
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
  assert.deepEqual(poolSizes([...rows, woman({ assetId: 3 })], NOW, 84, 85, 'women'), { 84: 1, 85: 1 });
});

test('eligible by side: men = top 5 + gender 0, women = top women leagues + gender 1', () => {
  assert.equal(eligible(row({ gender: 1 }), NOW), false); // a woman in a men's league id never counts as men
  assert.equal(eligible(woman(), NOW), false);
  assert.equal(eligible(woman(), NOW, 'women'), true);
  assert.equal(eligible(woman({ gender: 0 }), NOW, 'women'), false);
  assert.equal(eligible(woman({ league: 2221 }), NOW, 'women'), false); // NWSL is not in the women's top leagues
  assert.equal(eligible(row(), NOW, 'women'), false);
  assert.equal(eligible(woman({ baseClubs: [] }), NOW, 'women'), false);
});

test('poolOf builds the women pool with its own options', () => {
  const rows = [row({ assetId: 1 }), woman({ assetId: 2, rating: 80 }), woman({ assetId: 3, rating: 77 })];
  const p = poolOf(rows, { ...opts, side: 'women' });
  assert.deepEqual(p.players.map((r) => r.assetId), [2, 3]);
  assert.equal(p.minRating, 77);
});

test('pickPool: share, hard minimum and fallbacks', () => {
  const men = ['m1', 'm2'];
  const women = ['w1', 'w2', 'w3'];
  const o = { share: 0.15, womenHardMin: 3 };
  assert.equal(pickPool(men, women, 0.1, o), women);
  assert.equal(pickPool(men, women, 0.15, o), men);
  assert.equal(pickPool(men, women, 0, { ...o, share: 0 }), men); // share 0: always men
  assert.equal(pickPool(men, women, 0.999, { ...o, share: 1 }), women); // share 1: women when big enough
  assert.equal(pickPool(men, women, 0.1, { ...o, womenHardMin: 4 }), men); // too small: men
  assert.equal(pickPool(men, [], 0.1, { ...o, womenHardMin: 0 }), men); // empty never chosen
  assert.equal(pickPool([], women, 0.9, o), women); // no men: women
  assert.equal(pickPool(men, women, 0.5, { ...o, share: 7 }), women); // clamped to 1
  assert.equal(pickPool(men, women, 0, { ...o, share: -1 }), men); // clamped to 0
});
