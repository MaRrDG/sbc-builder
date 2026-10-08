import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextMilestone, pointsFor, statsOf, streakOf, type Play } from './streak.js';

test('points at 7, 14, 30 and every 30 after', () => {
  const got = Object.fromEntries([0, 1, 6, 7, 8, 14, 29, 30, 31, 37, 44, 60, 67, 74, 90].map((s) => [s, pointsFor(s)]));
  assert.deepEqual(got, { 0: 0, 1: 0, 6: 0, 7: 1, 8: 0, 14: 1, 29: 0, 30: 2, 31: 0, 37: 1, 44: 1, 60: 2, 67: 1, 74: 1, 90: 2 });
});

const won = (from: number, to: number): Play[] => Array.from({ length: to - from + 1 }, (_, i) => ({ day: from + i, won: true, guesses: 3 }));

test('current streak counts back from today, or from yesterday when today is not finished', () => {
  assert.deepEqual(streakOf(won(1, 7), 7), { current: 7, best: 7 });
  assert.deepEqual(streakOf(won(1, 7), 8), { current: 7, best: 7 }); // today still open
  assert.deepEqual(streakOf(won(1, 7), 9), { current: 0, best: 7 }); // missed day 8
});

test('a lost day resets the streak', () => {
  const plays = [...won(1, 5), { day: 6, won: false, guesses: 5 }, ...won(7, 8)];
  assert.deepEqual(streakOf(plays, 8), { current: 2, best: 5 });
  assert.deepEqual(streakOf(plays.slice(0, 6), 6), { current: 0, best: 5 });
});

test('stats: played, won, distribution of winning guesses, next milestone', () => {
  const plays: Play[] = [{ day: 1, won: true, guesses: 1 }, { day: 2, won: true, guesses: 3 }, { day: 3, won: false, guesses: 5 }, { day: 4, won: true, guesses: 3 }];
  const s = statsOf(plays, 4);
  assert.equal(s.played, 4);
  assert.equal(s.won, 3);
  assert.deepEqual(s.dist, [1, 0, 2, 0, 0]);
  assert.equal(s.current, 1);
  assert.deepEqual(s.next, { target: 7, points: 1 });
});

test('next milestone after 7 is 14, after 14 is 30, after 30 is 37', () => {
  assert.deepEqual(nextMilestone(7), { target: 14, points: 1 });
  assert.deepEqual(nextMilestone(14), { target: 30, points: 2 });
  assert.deepEqual(nextMilestone(30), { target: 37, points: 1 });
});
