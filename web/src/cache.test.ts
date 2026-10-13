import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheKey, ownedBy, stale } from './cache';

test('cacheKey: per user and persona', () => {
  assert.equal(cacheKey('user_1', 42, 'data'), 'user_1:42:data');
  assert.equal(cacheKey('user_1', null, 'me'), 'user_1:0:me');
});

test('ownedBy: only that user, never a prefix of another id', () => {
  assert.equal(ownedBy('user_1:42:data', 'user_1'), true);
  assert.equal(ownedBy('user_10:42:data', 'user_1'), false);
});

test("stale: only this user's data keys for personas no longer linked", () => {
  assert.equal(stale('user_1:42:data', 'user_1', [7]), true);
  assert.equal(stale('user_1:7:data', 'user_1', [7]), false);
  assert.equal(stale('user_1:0:me', 'user_1', []), false); // the me copy is kept
  assert.equal(stale('user_10:42:data', 'user_1', []), false); // another user (cacheKeep's job)
});
