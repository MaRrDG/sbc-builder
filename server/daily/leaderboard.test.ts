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
  assert.deepEqual(row, { rank: 1, userId: 'a', username: 'a', wins: 3, played: 4, winPct: 75, avgGuesses: 3, streak: 2, reachedDay: 4, oneGuessWins: 0 });
  const [r2] = rankLeaderboard([u('b', [p(1, true, 3), p(2, true, 2)])], 2);
  assert.equal(r2.avgGuesses, 2.5);
});

test('1-guess wins show in wins, played and win % but never rank anyone up (order, avg, reachedDay); streak kept', () => {
  const [row] = rankLeaderboard([u('a', [p(1, true, 1), p(2, true, 3), p(3, true, 1)])], 3);
  assert.deepEqual(row, { rank: 1, userId: 'a', username: 'a', wins: 3, played: 3, winPct: 100, avgGuesses: 3, streak: 3, reachedDay: 2, oneGuessWins: 2 });
  const [only] = rankLeaderboard([u('c', [p(1, true, 1)])], 1);
  assert.equal(only.wins, 1);
  assert.equal(only.played, 1);
  assert.equal(only.winPct, 100);
  assert.equal(only.avgGuesses, null);
  assert.equal(only.oneGuessWins, 1);
  // an honest 2-guess winner beats a 1-guess-every-day account
  const r = rankLeaderboard([u('cheat', [p(1, true, 1), p(2, true, 1)]), u('honest', [p(1, true, 2)])], 2);
  assert.deepEqual(r.map((x) => x.userId), ['honest', 'cheat']);
});

test('users with no finished game are left out; only losses rank below any win', () => {
  const r = rankLeaderboard([u('none', []), u('lost', [p(1, false, 5)]), u('won', [p(1, true, 5)])], 1);
  assert.deepEqual(r.map((x) => x.userId), ['won', 'lost']);
  assert.equal(r[1].avgGuesses, null);
  assert.equal(r[1].winPct, 0);
});
