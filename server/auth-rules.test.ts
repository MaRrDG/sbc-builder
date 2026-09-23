import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashToken, linkDecision, newLinkToken } from './auth-rules.js';

test('linkDecision', () => {
  assert.equal(linkDecision(null, 'user_a', false), 'link');
  assert.equal(linkDecision('user_a', 'user_a', false), 'already');
  assert.equal(linkDecision('user_b', 'user_a', false), 'needSid');
  assert.equal(linkDecision('user_b', 'user_a', true), 'takeover');
  assert.equal(linkDecision(null, 'user_a', true), 'link');
});

test('link tokens are random and hashed', () => {
  const a = newLinkToken(), b = newLinkToken();
  assert.notEqual(a, b);
  assert.match(a, /^[\w-]{43}$/);
  assert.match(hashToken(a), /^[0-9a-f]{64}$/);
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), hashToken(b));
});
