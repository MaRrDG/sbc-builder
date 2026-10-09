import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diff, type Mark } from './diff.js';

const none = new Map<number, Mark>();

test('first sighting of a count item is a baseline row of the whole count', () => {
  const d = diff('set', none, [{ itemId: 4, count: 3 }, { itemId: 5, count: 0 }]);
  assert.deepEqual(d.rows, [{ itemId: 4, seq: 3, count: 3, baseline: true }]);
  assert.deepEqual([...d.marks], [[4, { count: 3, done: false }], [5, { count: 0, done: false }]]);
});

test('an increase is a witnessed row of the difference', () => {
  const d = diff('challenge', new Map([[35, { count: 1, done: false }]]), [{ itemId: 35, count: 3 }]);
  assert.deepEqual(d.rows, [{ itemId: 35, seq: 3, count: 2, baseline: false }]);
  assert.deepEqual(d.marks.get(35), { count: 3, done: false });
});

test('the same payload again changes nothing', () => {
  const d = diff('set', new Map([[4, { count: 3, done: false }]]), [{ itemId: 4, count: 3 }]);
  assert.deepEqual(d.rows, []);
  assert.equal(d.marks.size, 0);
});

test('a decrease (seeded copy reset to 0) is ignored', () => {
  const d = diff('challenge', new Map([[35, { count: 2, done: false }]]), [{ itemId: 35, count: 0 }]);
  assert.deepEqual(d.rows, []);
  assert.equal(d.marks.size, 0);
});

test('an item listed twice in one payload counts once, at its highest count', () => {
  const d = diff('set', none, [{ itemId: 6, count: 1 }, { itemId: 6, count: 2 }]);
  assert.deepEqual(d.rows, [{ itemId: 6, seq: 2, count: 2, baseline: true }]);
});

test('bad ids and counts are skipped or read as 0', () => {
  const d = diff('set', none, [{ itemId: NaN, count: 2 }, { itemId: 7, count: -1 }, { itemId: 8, count: 1.5 }]);
  assert.deepEqual(d.rows, []);
  assert.deepEqual([...d.marks.keys()], [7, 8]);
});

test('objective: first sighting done is one baseline completion', () => {
  const d = diff('objective', none, [{ itemId: 152, done: true }, { itemId: 153, done: false }]);
  assert.deepEqual(d.rows, [{ itemId: 152, seq: 1, count: 1, baseline: true }]);
  assert.deepEqual(d.marks.get(153), { count: 0, done: false });
});

test('objective: not done → done is a witnessed completion, done → done is nothing', () => {
  const prev = new Map([[1, { count: 0, done: false }], [2, { count: 1, done: true }]]);
  const d = diff('objective', prev, [{ itemId: 1, done: true }, { itemId: 2, done: true }]);
  assert.deepEqual(d.rows, [{ itemId: 1, seq: 1, count: 1, baseline: false }]);
  assert.equal(d.marks.has(2), false);
});

test('objective: a refreshed daily objective counts again after it went back to not done', () => {
  const reset = diff('objective', new Map([[9, { count: 1, done: true }]]), [{ itemId: 9, done: false }]);
  assert.deepEqual(reset.rows, []);
  assert.deepEqual(reset.marks.get(9), { count: 1, done: false });
  const again = diff('objective', reset.marks, [{ itemId: 9, done: true }]);
  assert.deepEqual(again.rows, [{ itemId: 9, seq: 2, count: 1, baseline: false }]);
});
