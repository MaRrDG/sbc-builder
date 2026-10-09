import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clip, defaultChallenge, matchSets } from './pick.js';

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

test('default challenge: first not completed, else the first, else none', () => {
  assert.equal(defaultChallenge([{ challengeId: 1, status: 'COMPLETED' }, { challengeId: 2, status: 'NOT_STARTED' }]), 2);
  assert.equal(defaultChallenge([{ challengeId: 1, status: 'COMPLETED' }]), 1);
  assert.equal(defaultChallenge([]), null);
});
