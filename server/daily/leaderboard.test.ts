import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankLeaderboard, type LbInput } from './leaderboard.js';
import type { Play } from './streak.js';

const p = (day: number, won: boolean, guesses: number): Play => ({ day, won, guesses });
const u = (userId: string, plays: Play[], username = userId): LbInput => ({ userId, username, plays });

test('more wins rank higher', () => {
  const r = rankLeaderboard([u('a', [p(1, true, 3)]), u('b', [p(1, true, 4), p(2, true, 4)])], 2);
  assert.deepEqual(r.map((x) => [x.rank, x.userId]), [[1, 'b'], [2, 'a']]);
});

test('ties on wins: fewer average guesses first, then who reached it earlier, then name', () => {
  const r = rankLeaderboard([
    u('slow', [p(1, true, 5)]),
    u('late', [p(3, true, 2)]),
    u('early', [p(2, true, 2)]),
    u('Bee', [p(2, true, 2)]),
    u('ant', [p(2, true, 2)]),
  ], 3);
  assert.deepEqual(r.map((x) => x.userId), ['ant', 'Bee', 'early', 'late', 'slow']);
});

test('row values: played, win %, avg on wins only (1 decimal), current streak, reachedDay', () => {
  const [row] = rankLeaderboard([u('a', [p(1, true, 2), p(2, false, 5), p(3, true, 3), p(4, true, 4)])], 4);
  assert.deepEqual(row, { rank: 1, userId: 'a', username: 'a', wins: 3, played: 4, winPct: 75, avgGuesses: 3, streak: 2, reachedDay: 4 });
  const [r2] = rankLeaderboard([u('b', [p(1, true, 1), p(2, true, 2)])], 2);
  assert.equal(r2.avgGuesses, 1.5);
});

test('users with no finished game are left out; only losses rank below any win', () => {
  const r = rankLeaderboard([u('none', []), u('lost', [p(1, false, 5)]), u('won', [p(1, true, 5)])], 1);
  assert.deepEqual(r.map((x) => x.userId), ['won', 'lost']);
  assert.equal(r[1].avgGuesses, null);
  assert.equal(r[1].winPct, 0);
});
