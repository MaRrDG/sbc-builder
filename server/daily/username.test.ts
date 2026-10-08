import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeUsername, usernameKey } from './username.js';

test('valid usernames are trimmed and kept as typed', () => {
  assert.equal(normalizeUsername('  Mario_10 '), 'Mario_10');
  assert.equal(normalizeUsername('a.b-c'), 'a.b-c');
  assert.equal(normalizeUsername('abc'), 'abc');
  assert.equal(normalizeUsername('x'.repeat(16)), 'x'.repeat(16));
});

test('invalid usernames are refused', () => {
  for (const bad of ['ab', 'x'.repeat(17), 'two words', 'émile', 'a/b', '...', '_-_', '', '   ', 42, null, undefined, {}])
    assert.equal(normalizeUsername(bad), null, String(bad));
});

test('usernameKey folds case', () => {
  assert.equal(usernameKey('MaRiO'), 'mario');
});
