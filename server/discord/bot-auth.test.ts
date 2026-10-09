import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botTokenOk } from './bot-auth.js';

const good = 'a'.repeat(40);

test('the configured token passes', () => assert.equal(botTokenOk(good, good), true));
test('a different token fails', () => assert.equal(botTokenOk('b'.repeat(40), good), false));
test('no token configured, or one shorter than 32, disables the API', () => {
  assert.equal(botTokenOk('', ''), false);
  assert.equal(botTokenOk(undefined, undefined), false);
  assert.equal(botTokenOk('short', 'short'), false);
});
test('a missing or repeated header fails', () => {
  assert.equal(botTokenOk(undefined, good), false);
  assert.equal(botTokenOk([good, good], good), false);
});
