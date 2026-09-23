import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatEur, proPrice, yearlySaving } from './pricing.js';

test('pro is 5 a month, or 3 a month billed 36 a year', () => {
  assert.deepEqual(proPrice('monthly'), { perMonth: 5, billed: 5 });
  assert.deepEqual(proPrice('yearly'), { perMonth: 3, billed: 36 });
  assert.equal(yearlySaving(), 24);
});

test('formatEur follows the site language, no decimals', () => {
  assert.equal(formatEur(5, 'en'), '€5');
  assert.match(formatEur(36, 'ro'), /^36\s€$/);
});
