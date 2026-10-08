import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daySummary, topGuessed } from './summary.js';

test('signed-in and anonymous games add up', () => {
  const s = daySummary(
    [{ won: true, guesses: [1, 2, 9] }, { won: false, guesses: [1, 2, 3, 4, 5] }],
    { finished: 3, won: 2, dist: [0, 1, 1, 0, 0] },
  );
  assert.deepEqual(s, {
    finished: 5, won: 3, winPct: 60, dist: [0, 1, 2, 0, 0],
    signedIn: { finished: 2, won: 1 }, anon: { finished: 3, won: 2 },
  });
});

test('no games: zeros, no division by zero', () => {
  assert.deepEqual(daySummary([], null), {
    finished: 0, won: 0, winPct: 0, dist: [0, 0, 0, 0, 0], signedIn: { finished: 0, won: 0 }, anon: { finished: 0, won: 0 },
  });
});

test('top guessed merges signed-in guesses and anonymous counts', () => {
  const t = topGuessed([{ guesses: [10, 20] }, { guesses: [10] }], [{ assetId: 20, count: 5 }, { assetId: 30, count: 1 }], 2);
  assert.deepEqual(t, [{ assetId: 20, count: 6 }, { assetId: 10, count: 2 }]);
});
