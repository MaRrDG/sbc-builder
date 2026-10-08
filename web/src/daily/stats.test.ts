import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localStats } from './stats';

test('local stats follow the server rules: streak, best, distribution, next milestone', () => {
  const plays = [{ day: 1, won: true, guesses: 2 }, { day: 2, won: false, guesses: 5 }, { day: 3, won: true, guesses: 4 }, { day: 4, won: true, guesses: 1 }];
  assert.deepEqual(localStats(plays, 5), { played: 4, won: 3, current: 2, best: 2, dist: [1, 1, 0, 1, 0], next: { target: 7, points: 1 } });
  assert.equal(localStats(plays, 6).current, 0); // missed day 5
});
