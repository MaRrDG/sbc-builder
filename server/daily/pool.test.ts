import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY } from './players.js';
import { eligible, pickPool, poolOf, poolSizes, shares } from './pool.js';
import { HERO_CLUB_ID, LEGENDS_CLUB_ID, LEGENDS_LEAGUE_ID } from '../meta.js';
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

const icon = (p: Partial<PlayerRow> = {}) =>
  row({ league: LEGENDS_LEAGUE_ID, club: LEGENDS_CLUB_ID, rareflag: 12, cardType: 'icon', rating: 89, baseClubs: [], firstSeen: 0, lastSeen: 0, ...p });

test('eligible icons: any Icon of either gender, no league / freshness / transfer check; heroes never', () => {
  assert.equal(eligible(icon(), NOW, 'icons'), true);
  assert.equal(eligible(icon({ gender: 1 }), NOW, 'icons'), true);
  assert.equal(eligible(icon({ rareflag: 160 }), NOW, 'icons'), true); // synced from a special icon card
  assert.equal(eligible(icon(), NOW), false); // never in the men's pool
  assert.equal(eligible(icon({ gender: 1 }), NOW, 'women'), false);
  assert.equal(eligible(row(), NOW, 'icons'), false);
  const hero = row({ club: HERO_CLUB_ID, cardType: 'hero', baseClubs: [] });
  for (const side of ['men', 'women', 'icons'] as const) assert.equal(eligible(hero, NOW, side), false);
});

test('poolOf builds the icon pool: recent dropped, min rating 0 keeps all', () => {
  const rows = [row({ assetId: 1 }), icon({ assetId: 2 }), icon({ assetId: 3, gender: 1, rating: 87 }), icon({ assetId: 4 })];
  const p = poolOf(rows, { minRating: 0, minPool: 0, floor: 0, recent: new Set([4]), now: NOW, side: 'icons' });
  assert.deepEqual(p.players.map((r) => r.assetId), [2, 3]);
  assert.deepEqual(poolOf(rows, { minRating: 88, minPool: 0, floor: 0, recent: new Set(), now: NOW, side: 'icons' }).players.map((r) => r.assetId), [2, 4]);
  assert.deepEqual(poolSizes(rows, NOW, 88, 89, 'icons'), { 88: 2, 89: 2 });
});

test('shares: each clamped to [0, 1], women keep theirs, icons get at most what is left', () => {
  assert.deepEqual(shares(0.15, 0.2), { women: 0.15, icons: 0.2 });
  assert.deepEqual(shares(0.7, 0.6), { women: 0.7, icons: 1 - 0.7 });
  assert.deepEqual(shares(7, 1), { women: 1, icons: 0 });
  assert.deepEqual(shares(-1, 2), { women: 0, icons: 1 });
  assert.deepEqual(shares(NaN, NaN), { women: 0, icons: 0 });
});

test('pickPool: shares, hard minimums and fallbacks', () => {
  const men = ['m1', 'm2'];
  const women = ['w1', 'w2', 'w3'];
  const icons = ['i1', 'i2', 'i3', 'i4'];
  const p = { men, women, icons };
  const o = { womenShare: 0.15, iconShare: 0.2, womenHardMin: 3, iconHardMin: 4 };
  // [0, 0.15) women, [0.15, 0.35) icons, [0.35, 1) men: the ranges don't overlap
  assert.equal(pickPool(p, 0, o), women);
  assert.equal(pickPool(p, 0.1499, o), women);
  assert.equal(pickPool(p, 0.15, o), icons);
  assert.equal(pickPool(p, 0.3499, o), icons);
  assert.equal(pickPool(p, 0.35, o), men);
  assert.equal(pickPool(p, 0.999, o), men);
  for (const r of [0, 0.2, 0.5, 0.999]) assert.equal(pickPool(p, r, { ...o, womenShare: 0, iconShare: 0 }), men); // shares 0: always men
  for (const r of [0, 0.5, 0.999]) assert.equal(pickPool(p, r, { ...o, womenShare: 0, iconShare: 1 }), icons); // icon share 1: icons when big enough
  assert.equal(pickPool(p, 0.2, { ...o, iconHardMin: 5 }), men); // too small icon pool: men
  assert.equal(pickPool(p, 0.1, { ...o, womenHardMin: 4 }), men); // too small women pool: men
  assert.equal(pickPool({ men, women, icons: [] }, 0.2, { ...o, iconHardMin: 0 }), men); // empty never chosen
  assert.equal(pickPool({ men: [], women, icons }, 0.9, o), women); // no men: the first usable other pool
  assert.equal(pickPool({ men: [], women, icons }, 0.2, o), icons); // no men: the chosen pool when usable
  assert.equal(pickPool({ men: [], women: [], icons }, 0.9, o), icons);
  assert.equal(pickPool({ men: [], women: [], icons: [] }, 0.9, o).length, 0); // nothing usable: an empty pool
  // sum > 1: women keep 0.7, icons get the remaining 0.3, men get nothing
  const over = { ...o, womenShare: 0.7, iconShare: 0.6 };
  assert.equal(pickPool(p, 0.69, over), women);
  assert.equal(pickPool(p, 0.7, over), icons);
  assert.equal(pickPool(p, 0.999, over), icons);
  assert.equal(pickPool(p, 0.5, { ...o, womenShare: 7, iconShare: 0 }), women); // clamped to 1
  assert.equal(pickPool(p, 0, { ...o, womenShare: -1, iconShare: -1 }), men); // clamped to 0
});
