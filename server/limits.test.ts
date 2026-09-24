import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter } from './limits.js';

test('allows up to max hits per key per window, then refuses', () => {
  let now = 0;
  const hit = createLimiter({ windowMs: 1000, max: 2, now: () => now });
  assert.equal(hit('a'), true);
  assert.equal(hit('a'), true);
  assert.equal(hit('a'), false);
  assert.equal(hit('b'), true); // keys are separate
  now = 1000; // a new window
  assert.equal(hit('a'), true);
});

test('forgets idle keys so the map does not grow forever', () => {
  let now = 0;
  const hit = createLimiter({ windowMs: 1000, max: 1, now: () => now });
  for (let i = 0; i < 100; i++) hit(`k${i}`);
  now = 5000;
  hit('fresh');
  assert.equal(hit.size(), 1);
});
