import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEEK_MS, effectivePlan, quotaState, weeklyLimit, type PlanRow } from './plan.js';

const NOW = Date.UTC(2026, 8, 24, 12);
const row = (p: Partial<PlanRow> = {}): PlanRow => ({ plan: 'free', premiumUntil: null, quotaStart: null, quotaUsed: 0, ...p });

test('effectivePlan', () => {
  assert.equal(effectivePlan(row(), false, NOW), 'free');
  assert.equal(effectivePlan(row(), true, NOW), 'premium'); // admins
  assert.equal(effectivePlan(row({ plan: 'premium' }), false, NOW), 'premium'); // no end date
  assert.equal(effectivePlan(row({ plan: 'premium', premiumUntil: new Date(NOW + 1000) }), false, NOW), 'premium');
  assert.equal(effectivePlan(row({ plan: 'premium', premiumUntil: new Date(NOW) }), false, NOW), 'free'); // ended
  assert.equal(effectivePlan(row({ plan: 'bogus' }), false, NOW), 'free');
});

test('quotaState: no window yet', () => {
  assert.deepEqual(quotaState(row(), 20, NOW), { used: 0, limit: 20, resetsAt: null });
});

test('quotaState: open window', () => {
  const start = new Date(NOW - 2 * 24 * 3600e3);
  assert.deepEqual(quotaState(row({ quotaStart: start, quotaUsed: 12 }), 20, NOW), { used: 12, limit: 20, resetsAt: start.getTime() + WEEK_MS });
});

test('quotaState: window ends exactly at start + 7 days', () => {
  const start = new Date(NOW - WEEK_MS);
  assert.deepEqual(quotaState(row({ quotaStart: start, quotaUsed: 20 }), 20, NOW), { used: 0, limit: 20, resetsAt: null });
  assert.equal(quotaState(row({ quotaStart: new Date(NOW - WEEK_MS + 1), quotaUsed: 20 }), 20, NOW).used, 20);
});

test('quotaState ignores the plan (ending Premium does not refill the week)', () => {
  const start = new Date(NOW - 3600e3);
  assert.equal(quotaState(row({ plan: 'premium', quotaStart: start, quotaUsed: 7 }), 20, NOW).used, 7);
});

test('weeklyLimit', () => {
  assert.equal(weeklyLimit(undefined), 20);
  assert.equal(weeklyLimit(''), 20);
  assert.equal(weeklyLimit('15'), 15);
  assert.equal(weeklyLimit('0'), 20);
  assert.equal(weeklyLimit('abc'), 20);
});
