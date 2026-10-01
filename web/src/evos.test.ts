import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeLeft } from './evos.js';

test('timeLeft rounds minutes up and stops at zero', () => {
  const now = Date.UTC(2026, 9, 1, 19, 51);
  assert.deepEqual(timeLeft(now + (11 * 60 + 58) * 60e3, now), { done: false, days: 0, hours: 11, minutes: 58 });
  assert.deepEqual(timeLeft(now + 30e3, now), { done: false, days: 0, hours: 0, minutes: 1 });
  assert.deepEqual(timeLeft(now + (26 * 60) * 60e3, now), { done: false, days: 1, hours: 2, minutes: 0 });
  assert.deepEqual(timeLeft(now, now), { done: true, days: 0, hours: 0, minutes: 0 });
  assert.deepEqual(timeLeft(now - 5e3, now), { done: true, days: 0, hours: 0, minutes: 0 });
});
