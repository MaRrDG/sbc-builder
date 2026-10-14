import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costOf, fallbackPrices, playerCost, DEFAULT_PRICE } from './cost.js';
import type { Player } from './squad.js';

const card = (rating: number, price?: number, extra: Partial<Player> = {}) =>
  ({ rating, untradeable: false, ...(price ? { price } : {}), ...extra }) as Player;

test('cost is the AVG; an untradeable counts half, SBC storage x0.8', () => {
  const none = () => 0;
  assert.equal(playerCost(card(84, 1000), none), 1000);
  assert.equal(playerCost(card(84, 1000, { untradeable: true }), none), 500);
  assert.equal(playerCost(card(84, 1000, { untradeable: true, inStorage: true }), none), 400);
});

test('a tradeable wins only when it is under half the untradeable AVG', () => {
  const none = () => 0;
  const u = playerCost(card(84, 1000, { untradeable: true }), none);
  assert.ok(playerCost(card(84, 400), none) < u);
  assert.ok(playerCost(card(84, 600), none) > u);
});

test('no AVG: median of that rating, else the nearest rating, else the default', () => {
  const f = fallbackPrices([card(83, 900), card(83, 1100), card(83, 5000), card(86, 4000), card(80, 300)]);
  assert.equal(f(83), 1100);
  assert.equal(f(85), 4000); // 86 is nearer than 83
  assert.equal(f(81), 300); // 80 and 82: 80 has one
  assert.equal(fallbackPrices([])(84), DEFAULT_PRICE);
  const even = fallbackPrices([card(75, 400), card(75, 600)]);
  assert.equal(even(75), 500);
});

test('costOf prices cards without an AVG from the same pool', () => {
  const pool = [card(84, 2000), card(84, undefined, { untradeable: true })];
  const cost = costOf(pool);
  assert.equal(cost(pool[1]), 1000);
});
