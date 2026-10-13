import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiter, limitKey } from './limits.js';

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

test('limitKey: IPv6 counts per /64, IPv4 and other keys stay as they are', () => {
  assert.equal(limitKey('2001:db8:1:2::1'), '2001:db8:1:2::/64');
  assert.equal(limitKey('2001:0DB8:0001:0002:ffff:1:2:3'), '2001:db8:1:2::/64');
  assert.equal(limitKey('2001:db8::1'), '2001:db8:0:0::/64');
  assert.equal(limitKey('::1'), '0:0:0:0::/64');
  assert.equal(limitKey('fe80::1%eth0'), 'fe80:0:0:0::/64');
  assert.equal(limitKey('64:ff9b::1.2.3.4'), '64:ff9b:0:0::/64');
  assert.equal(limitKey('::ffff:203.0.113.7'), '203.0.113.7');
  assert.equal(limitKey('203.0.113.7'), '203.0.113.7');
  assert.equal(limitKey('user_2abcDEF'), 'user_2abcDEF');
});

test('IPv6 addresses of one /64 share a bucket; another /64 does not', () => {
  const hit = createLimiter({ windowMs: 60_000, max: 1, now: () => 0 });
  assert.equal(hit('2001:db8:1:2::1'), true);
  assert.equal(hit('2001:db8:1:2::2'), false);
  assert.equal(hit('2001:db8:1:3::1'), true);
});
