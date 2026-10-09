import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clip, defaultChallenge, matchSets, setAvailable } from './pick.js';

const cats = [
  { name: 'Upgrades', sets: [{ setId: 1, name: 'Bronze Upgrade' }, { setId: 2, name: 'Silver Upgrade' }] },
  { name: 'Challenges', sets: [{ setId: 3, name: 'Manchester Calling' }, { setId: 4, name: 'Atlético Derby' }] },
  { name: 'Featured', sets: [{ setId: 2, name: 'Silver Upgrade' }] },
];

test('empty query lists every set once, alphabetically, with its category', () => {
  assert.deepEqual(matchSets(cats, '').map((s) => s.setId), [4, 1, 3, 2]);
  assert.equal(matchSets(cats, '')[0].name, 'Atlético Derby · Challenges');
});

test('substring match, prefix matches first, accents and case ignored', () => {
  assert.deepEqual(matchSets(cats, 'upgr').map((s) => s.setId), [1, 2]);
  assert.deepEqual(matchSets(cats, 'silver').map((s) => s.setId), [2]);
  assert.deepEqual(matchSets(cats, 'up').map((s) => s.setId), [1, 2]);
  assert.deepEqual(matchSets(cats, 'ATLETICO').map((s) => s.setId), [4]);
  assert.deepEqual(matchSets(cats, 's').map((s) => s.setId), [2, 3]); // "Silver…" starts with it, "Manchester…" only contains it
});

test('at most 25 choices, names at most 100 characters', () => {
  const many = [{ name: 'X', sets: Array.from({ length: 40 }, (_, i) => ({ setId: i + 1, name: `Set ${i} ${'y'.repeat(120)}` })) }];
  const r = matchSets(many, '');
  assert.equal(r.length, 25);
  assert.ok(r.every((c) => c.name.length <= 100));
});

test('clip', () => {
  assert.equal(clip('abc', 5), 'abc');
  assert.equal(clip('abcdef', 5), 'abcd…');
});

test('clip does not cut an emoji in half', () => {
  const r = clip('⚽'.repeat(10), 5);
  assert.equal(r, '⚽⚽⚽⚽…');
  assert.equal(clip('😀😀😀😀', 3), '😀😀…');
});

test('setAvailable follows the repeatability mode', () => {
  const base = { challengesCount: 3, challengesCompletedCount: 0 };
  assert.equal(setAvailable({ ...base, repeatable: true }), true);
  assert.equal(setAvailable({ ...base, repeatabilityMode: 'NON_REPEATABLE', challengesCompletedCount: 3 }), false);
  assert.equal(setAvailable({ ...base, repeatabilityMode: 'NON_REPEATABLE', challengesCompletedCount: 2 }), true);
  const now = 10 * 86400 * 1000 + 5000; // 5 s into day 10
  const refresh = { ...base, repeatabilityMode: 'REFRESH' as const, repeats: 2, repeatRefreshInterval: 86400, releaseTime: 0 };
  assert.equal(setAvailable({ ...refresh, timesCompletedInInterval: 2, lastCompletedTime: 10 * 86400 + 1 }, now), false);
  assert.equal(setAvailable({ ...refresh, timesCompletedInInterval: 1, lastCompletedTime: 10 * 86400 + 1 }, now), true);
  assert.equal(setAvailable({ ...refresh, timesCompletedInInterval: 2, lastCompletedTime: 9 * 86400 }, now), true); // old window
});

test('default challenge: first not completed, else the first, else none', () => {
  assert.equal(defaultChallenge([{ challengeId: 1, status: 'COMPLETED' }, { challengeId: 2, status: 'NOT_STARTED' }]), 2);
  assert.equal(defaultChallenge([{ challengeId: 1, status: 'COMPLETED' }]), 1);
  assert.equal(defaultChallenge([]), null);
});
