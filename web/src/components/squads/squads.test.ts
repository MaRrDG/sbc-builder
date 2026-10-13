import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactCoins, splitSlots } from './squads';

test('compact coins like EA under the card', () => {
  assert.equal(compactCoins(950, 'en'), '950');
  assert.equal(compactCoins(171_900, 'en'), '171.9K');
  assert.equal(compactCoins(171_900, 'ro'), '171,9K');
  assert.equal(compactCoins(1_642_000, 'it'), '1,6M');
  assert.equal(compactCoins(999_960, 'en'), '1M');
  assert.equal(compactCoins(12_000, 'en'), '12K');
});

test('starters and bench split on index 11', () => {
  const r = splitSlots([{ index: 12 }, { index: 0 }, { index: 11 }, { index: 3 }]);
  assert.deepEqual(r.starters.map((s) => s.index), [0, 3]);
  assert.deepEqual(r.bench.map((s) => s.index), [11, 12]);
});
