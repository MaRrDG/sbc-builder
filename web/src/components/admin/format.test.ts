import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setQuery, solveTarget } from './format.js';

test('setQuery resets page on filter change and drops defaults', () => {
  assert.equal(setQuery('plan=premium&page=3', { activity: '7d' }), 'plan=premium&activity=7d');
  assert.equal(setQuery('plan=premium', { plan: 'all' }), '');
  assert.equal(setQuery('plan=premium', { page: 2 }), 'plan=premium&page=2');
  assert.equal(setQuery('page=2', { page: 1 }), '');
  assert.equal(setQuery('', { q: 'a b' }), 'q=a+b');
});

test('solveTarget: set › challenge, set alone, or null to fall back to ids', () => {
  assert.equal(solveTarget('Premium Mixed Leagues', 'Libertadores'), 'Premium Mixed Leagues › Libertadores');
  assert.equal(solveTarget('Marquee Matchups', 'Marquee Matchups'), 'Marquee Matchups');
  assert.equal(solveTarget('Marquee Matchups', ' marquee matchups '), 'Marquee Matchups');
  assert.equal(solveTarget('Daily Bronze Upgrade', ''), 'Daily Bronze Upgrade');
  assert.equal(solveTarget('Daily Bronze Upgrade', null), 'Daily Bronze Upgrade');
  assert.equal(solveTarget(null, 'Libertadores'), null);
  assert.equal(solveTarget('  ', 'x'), null);
  assert.equal(solveTarget(undefined, undefined), null);
});
