import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setQuery } from './format.js';

test('setQuery resets page on filter change and drops defaults', () => {
  assert.equal(setQuery('plan=premium&page=3', { activity: '7d' }), 'plan=premium&activity=7d');
  assert.equal(setQuery('plan=premium', { plan: 'all' }), '');
  assert.equal(setQuery('plan=premium', { page: 2 }), 'plan=premium&page=2');
  assert.equal(setQuery('page=2', { page: 1 }), '');
  assert.equal(setQuery('', { q: 'a b' }), 'q=a+b');
});
