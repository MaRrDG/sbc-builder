import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { BrickSlot } from './layout.js';
import { canonicalBricks, chooseLayout, isBrickChallenge, layoutHash, rejectReason, type Report } from './bricks.js';

const brick = (index: number, over: Partial<BrickSlot> = {}): BrickSlot => ({
  index, custom: false, nation: 0, league: 0, club: 0, rareflag: 0, positions: null, ...over,
});

test('isBrickChallenge', () => {
  assert.equal(isBrickChallenge('BRICK_CHALLENGE'), true);
  assert.equal(isBrickChallenge('CUSTOM_BRICK_CHALLENGE'), true);
  assert.equal(isBrickChallenge('OPEN_CHALLENGE'), false);
  assert.equal(isBrickChallenge(undefined), false);
});

test('hash ignores order and extra keys', () => {
  const a = [brick(3), brick(1, { custom: true, club: 5 })];
  const b = [{ ...brick(1, { custom: true, club: 5 }), extra: 1 } as BrickSlot, brick(3)];
  assert.equal(layoutHash(a), layoutHash(b));
  assert.deepEqual(canonicalBricks(a).map((x) => x.index), [1, 3]);
  assert.notEqual(layoutHash(a), layoutHash([brick(3), brick(2)]));
});

test('rejectReason accepts a sane layout', () => {
  assert.equal(rejectReason('BRICK_CHALLENGE', [brick(0), brick(10)]), null);
  assert.equal(rejectReason('CUSTOM_BRICK_CHALLENGE', [brick(4, { custom: true, positions: ['ST'] })]), null);
});

test('rejectReason refuses broken layouts', () => {
  assert.match(rejectReason('OPEN_CHALLENGE', [brick(0)])!, /not a brick/);
  assert.match(rejectReason('BRICK_CHALLENGE', [])!, /no locked/);
  assert.match(rejectReason('BRICK_CHALLENGE', Array.from({ length: 11 }, (_, i) => brick(i)))!, /every slot/);
  assert.match(rejectReason('BRICK_CHALLENGE', [brick(12)])!, /out of range/);
  assert.match(rejectReason('BRICK_CHALLENGE', [brick(2), brick(2)])!, /twice/);
  assert.match(rejectReason('BRICK_CHALLENGE', [brick(2, { club: -1 })])!, /invalid id/);
  assert.match(rejectReason('BRICK_CHALLENGE', [brick(2, { positions: [1] as unknown as string[] })])!, /positions/);
});

const rep = (personaId: number, bricks: BrickSlot[], capturedAt: number): Report => ({
  personaId, bricks, hash: layoutHash(bricks), capturedAt,
});

test('chooseLayout: none', () => {
  assert.equal(chooseLayout([], new Set()), null);
});

test('chooseLayout: untrusted layout needs 3 distinct accounts', () => {
  const real = [brick(1)];
  assert.equal(chooseLayout([rep(1, real, 1)], new Set()), null);
  assert.equal(chooseLayout([rep(1, real, 1), rep(1, real, 2), rep(1, real, 3), rep(2, real, 4)], new Set()), null);
  assert.deepEqual(chooseLayout([rep(1, real, 1), rep(2, real, 2), rep(3, real, 3)], new Set()), real);
});

test('chooseLayout: majority of distinct accounts wins', () => {
  const real = [brick(1)], fake = [brick(9)];
  const fakes = [rep(1, fake, 1), rep(2, fake, 2), rep(3, fake, 3)];
  const reals = [rep(4, real, 4), rep(5, real, 5), rep(6, real, 6), rep(7, real, 7)];
  assert.deepEqual(chooseLayout([...fakes, ...reals], new Set()), real);
});

test('chooseLayout: tie goes to the earliest', () => {
  const a = [brick(1)], b = [brick(2)];
  const reports = [rep(1, b, 20), rep(2, b, 21), rep(3, b, 22), rep(4, a, 10), rep(5, a, 30), rep(6, a, 31)];
  assert.deepEqual(chooseLayout(reports, new Set()), a);
});

test('chooseLayout: one trusted report is enough', () => {
  const a = [brick(1)];
  assert.deepEqual(chooseLayout([rep(9, a, 1)], new Set([9])), a);
});

test('chooseLayout: newest trusted report wins over majority', () => {
  const a = [brick(1)], b = [brick(2)], c = [brick(3)];
  const reports = [rep(1, a, 1), rep(2, a, 2), rep(9, b, 3), rep(9, c, 4)];
  assert.deepEqual(chooseLayout(reports, new Set([9])), c);
});
