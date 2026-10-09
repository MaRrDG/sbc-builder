import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOOST_GRACE_MS, boostState, effectivePlan, planSource, type PlanRow } from './plan.js';

const NOW = Date.UTC(2026, 9, 9, 12);
const H = 3_600_000;
const free: PlanRow = { plan: 'free', premiumUntil: null, quotaStart: null, quotaUsed: 0, discordId: '123456789012345678' };
const at = (ms: number) => new Date(ms);

test('grace is 12 hours', () => assert.equal(BOOST_GRACE_MS, 12 * H));

test('boosting gives Premium from the boost', () => {
  const row = { ...free, boostSince: at(NOW - 5 * 24 * H) };
  assert.equal(effectivePlan(row, false, NOW), 'premium');
  assert.equal(planSource(row, false, NOW), 'boost');
  assert.deepEqual(boostState(row, NOW), { since: NOW - 5 * 24 * H, graceUntil: null });
});

test('boost ended 11h59m ago: still Premium (grace)', () => {
  const ended = NOW - (11 * H + 59 * 60_000);
  const row = { ...free, boostSince: null, boostEndedAt: at(ended) };
  assert.equal(effectivePlan(row, false, NOW), 'premium');
  assert.equal(planSource(row, false, NOW), 'boost');
  assert.deepEqual(boostState(row, NOW), { since: null, graceUntil: ended + 12 * H });
});

test('boost ended 12h01m ago: Free', () => {
  const row = { ...free, boostSince: null, boostEndedAt: at(NOW - (12 * H + 60_000)) };
  assert.equal(effectivePlan(row, false, NOW), 'free');
  assert.equal(boostState(row, NOW), null);
  assert.equal(planSource(row, false, NOW), null);
});

test('boost + paid Premium: shown as paid, boost still reported', () => {
  const row = { ...free, plan: 'premium', premiumUntil: at(NOW + 30 * 24 * H), boostSince: at(NOW - H) };
  assert.equal(planSource(row, false, NOW), 'paid');
  assert.equal(effectivePlan(row, false, NOW), 'premium');
  assert.notEqual(boostState(row, NOW), null);
});

test('no boost columns (cleared on unlink): Free', () => {
  assert.equal(effectivePlan({ ...free, boostSince: null, boostEndedAt: null }, false, NOW), 'free');
});

test('unchanged rules: admins, expired paid Premium', () => {
  assert.equal(planSource(free, true, NOW), 'admin');
  assert.equal(effectivePlan({ ...free, plan: 'premium', premiumUntil: at(NOW - 1) }, false, NOW), 'free');
  assert.equal(effectivePlan({ ...free, plan: 'premium', premiumUntil: null }, false, NOW), 'premium');
});

test('boost_since set but no Discord id: Free', () => {
  const row = { ...free, discordId: null, boostSince: at(NOW - H), boostEndedAt: at(NOW - H) };
  assert.equal(effectivePlan(row, false, NOW), 'free');
  assert.equal(boostState(row, NOW), null);
});
