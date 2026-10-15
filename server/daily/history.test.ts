import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHistory, HISTORY_DAYS, withMine } from './history.js';

const answers = [40, 41, 42, 10].map((day) => ({ day, date: `d${day}`, assetId: day * 100 }));
const totals = new Map([[41, { finished: 8, won: 5 }], [40, { finished: 3, won: 0 }]]);
const answerOf = (id: number) => (id === 4000 ? null : { id });

test('history: past days only (today stays secret), newest first, within 30 days', () => {
  const h = buildHistory(42, answers, totals, answerOf);
  assert.deepEqual(h.map((d) => d.day), [41, 40]); // 42 = today; 10 is older than HISTORY_DAYS
  assert.equal(HISTORY_DAYS, 30);
  assert.deepEqual(h[0], { day: 41, date: 'd41', answer: { id: 4100 }, played: 8, winPct: 63 });
  assert.equal(h[1].answer, null); // player gone from the table
  assert.equal(h[1].winPct, 0);
  assert.equal('me' in h[0], false); // signed out: no own result
});

test('history: a day nobody finished has no win %', () => {
  const [d] = buildHistory(42, [{ day: 39, date: 'd39', assetId: 1 }], new Map(), answerOf);
  assert.equal(d.played, 0);
  assert.equal(d.winPct, null);
});

test('history: signed in adds the own result, null on days not played', () => {
  const h = withMine(buildHistory(42, answers, totals, answerOf), [{ day: 41, won: true, guesses: 3 }, { day: 5, won: false, guesses: 5 }]);
  assert.deepEqual(h.map((d) => d.me), [{ won: true, guesses: 3 }, null]);
});
