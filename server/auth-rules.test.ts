import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashToken, linkDecision, newLinkToken, overLinkLimit, PERSONA_USER_LIMIT } from './auth-rules.js';

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

test('overLinkLimit: an EA account links to at most 3 FC Solver accounts, ever', () => {
  assert.equal(PERSONA_USER_LIMIT, 3);
  assert.equal(overLinkLimit([], 'u4'), false);
  assert.equal(overLinkLimit(['u1', 'u2'], 'u4'), false);
  assert.equal(overLinkLimit(['u1', 'u2', 'u3'], 'u4'), true); // a 4th account
  assert.equal(overLinkLimit(['u1', 'u2', 'u3'], 'u2'), false); // one of the 3 comes back
  assert.equal(overLinkLimit(['u1', 'u2', 'u3', 'u5'], 'u5'), false); // already past it (backfill): known ones still link
});
