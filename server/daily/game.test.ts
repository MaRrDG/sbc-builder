import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGuess, gameView, progressOf } from './game.js';
import type { PlayerRow } from './types.js';

const row = (assetId: number, p: Partial<PlayerRow> = {}): PlayerRow => ({
  assetId, name: `P${assetId}`, fullName: `Player ${assetId}`, nation: 18, league: 13, club: 1, position: 'ST', rating: 86, rareflag: 1,
  cardType: 'normal', baseClubs: [], firstSeen: 0, lastSeen: 0, ...p,
});
const ANSWER = row(100);
const rows = new Map([100, 1, 2, 3, 4, 5].map((id) => [id, id === 100 ? ANSWER : row(id, { club: id + 10 })]));
const known = (id: number) => rows.has(id);

test('a right guess wins and finishes', () => {
  assert.deepEqual(applyGuess([1], 100, 100, known), { guesses: [1, 100], won: true, finished: true });
});

test('five wrong guesses lose', () => {
  assert.deepEqual(progressOf([1, 2, 3, 4, 5], 100), { guesses: [1, 2, 3, 4, 5], won: false, finished: true });
});

test('guess errors: finished, unknown, repeat', () => {
  assert.deepEqual(applyGuess([1, 2, 3, 4, 5], 100, 100, known), { error: 'dailyFinished' });
  assert.deepEqual(applyGuess([100], 1, 100, known), { error: 'dailyFinished' });
  assert.deepEqual(applyGuess([1], 999, 100, known), { error: 'dailyUnknownPlayer' });
  assert.deepEqual(applyGuess([1], 1, 100, known), { error: 'dailyRepeat' });
});

test('no answer and no silhouette before 3 misses', () => {
  const v = gameView(progressOf([1, 2], 100), ANSWER, (id) => rows.get(id));
  assert.equal(v.rows.length, 2);
  assert.equal(v.answer, undefined);
  assert.equal(v.silhouette, undefined);
});

test('silhouette after 3 misses carries only rating, position, rarity, card type', () => {
  const v = gameView(progressOf([1, 2, 3], 100), ANSWER, (id) => rows.get(id));
  assert.deepEqual(v.silhouette, { rating: 86, position: 'ST', rareflag: 1, cardType: 'normal' });
  assert.equal(v.answer, undefined);
  assert.equal(JSON.stringify(v).includes('"P100"'), false);
  assert.equal(JSON.stringify(v).includes('100'), false);
});

test('the finished view reveals the answer and drops the silhouette', () => {
  const v = gameView(progressOf([1, 2, 3, 4, 5], 100), ANSWER, (id) => rows.get(id));
  assert.equal(v.silhouette, undefined);
  assert.equal(v.answer?.id, 100);
  assert.equal(v.answer?.fullName, 'Player 100');
  assert.equal(v.rows[0].tiles.club.state, 'miss');
});
