import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashIp, ipPrefix, ipSalt } from './ip-hash.js';

test('ipPrefix: IPv4 /24, IPv6 /64, IPv4-mapped → IPv4, junk → null', () => {
  assert.equal(ipPrefix('203.0.113.77'), '203.0.113.0/24');
  assert.equal(ipPrefix('2001:db8:1:2:aaaa::1'), '2001:db8:1:2::/64');
  assert.equal(ipPrefix('2001:0DB8:0001:0002:ffff:ffff:ffff:ffff'), '2001:db8:1:2::/64');
  assert.equal(ipPrefix('::ffff:198.51.100.9'), '198.51.100.0/24');
  assert.equal(ipPrefix('fe80::1%eth0'), 'fe80:0:0:0::/64');
  for (const bad of ['', 'nope', '999.1.1.1', null, undefined]) assert.equal(ipPrefix(bad), null);
});

test('hashIp: 16 hex, same network → same hash, other network or salt → another, never the raw IP', () => {
  const h = hashIp('203.0.113.77', 's1')!;
  assert.match(h, /^[0-9a-f]{16}$/);
  assert.equal(hashIp('203.0.113.5', 's1'), h);
  assert.notEqual(hashIp('203.0.114.5', 's1'), h);
  assert.notEqual(hashIp('203.0.113.77', 's2'), h);
  assert.equal(hashIp('2001:db8:1:2::9', 's1'), hashIp('2001:db8:1:2:ffff::1', 's1'));
  assert.ok(!h.includes('203'));
  assert.equal(hashIp(null, 's1'), null);
});

test('ipSalt: IP_HASH_SALT wins; the fallback is a hash, never the secret itself', () => {
  assert.equal(ipSalt({ IP_HASH_SALT: 'abc' }), 'abc');
  const f = ipSalt({ CLERK_SECRET_KEY: 'sk_test_secret' });
  assert.match(f, /^[0-9a-f]{64}$/);
  assert.ok(!f.includes('sk_test_secret'));
  assert.notEqual(f, ipSalt({ CLERK_SECRET_KEY: 'other' }));
});
