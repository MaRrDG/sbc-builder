import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Challenge, SbcSet } from './ea.js';
import { AGREE_PERSONAS, challengesFingerprint, seedChallenges, setFingerprint, setSnapshot, shareableList, shareableSet, shareDecision } from './shared-sbc.js';

const ch = (challengeId: number, priority: number, extra: Partial<Challenge> = {}) =>
  ({ challengeId, setId: 7, name: `c${challengeId}`, priority, status: 'COMPLETED', timesCompleted: 4, formation: 'f442', repeatable: false, elgReq: [], elgOperation: 'AND', awards: [], endTime: 1, description: '', ...extra }) as Challenge;
const set = { setId: 7, challengesCount: 2, challengesCompletedCount: 0, timesCompleted: 0 };

test('seeds a fresh set, per-account fields reset, EA order', () => {
  const out = seedChallenges(set, [ch(11, 2), ch(10, 1)]);
  assert.deepEqual(out?.map((c) => c.challengeId), [10, 11]);
  assert.ok(out?.every((c) => c.status === 'NOT_STARTED' && c.timesCompleted === 0));
  assert.equal(out?.[0].formation, 'f442'); // the rest stays as EA sent it
});

test('no seed when the account has progress', () => {
  assert.equal(seedChallenges({ ...set, challengesCompletedCount: 1 }, [ch(10, 1), ch(11, 2)]), null);
  assert.equal(seedChallenges({ ...set, timesCompleted: 1 }, [ch(10, 1), ch(11, 2)]), null);
});

test('no seed from a partial, foreign or empty list', () => {
  assert.equal(seedChallenges(set, [ch(10, 1)]), null);
  assert.equal(seedChallenges(set, [ch(10, 1), ch(11, 2, { setId: 8 })]), null);
  assert.equal(seedChallenges(set, []), null);
  assert.equal(seedChallenges(set, null), null);
});

test('does not mutate the shared rows', () => {
  const shared = [ch(10, 1), ch(11, 2)];
  seedChallenges(set, shared);
  assert.equal(shared[0].status, 'COMPLETED');
});

test('a seeded points challenge starts with nothing submitted', () => {
  const out = seedChallenges(set, [ch(10, 1, { scoreRequirement: 4000, submittedScore: 1200 }), ch(11, 2)]);
  assert.equal(out?.[0].submittedScore, 0);
  assert.equal('submittedScore' in out![1], false); // squad challenges stay as EA sent them
});

test('fingerprint: same content from two accounts matches, progress and order ignored', () => {
  const a = challengesFingerprint(7, [ch(10, 1), ch(11, 2)]);
  const b = challengesFingerprint(7, [ch(11, 2, { status: 'NOT_STARTED', timesCompleted: 0 }), ch(10, 1, { submittedScore: 5 })]);
  assert.equal(a, b);
});

test('fingerprint: any shared field changes it (requirements, type, set, text)', () => {
  const base = challengesFingerprint(7, [ch(10, 1)]);
  assert.notEqual(challengesFingerprint(7, [ch(10, 1, { type: 'BRICK_CHALLENGE' })]), base);
  assert.notEqual(challengesFingerprint(7, [ch(10, 1, { elgReq: [{ type: 'TEAM_RATING', eligibilityKey: 1, eligibilityValue: 84 }] as never })]), base);
  assert.notEqual(challengesFingerprint(7, [ch(10, 1, { setId: 8 })]), base);
  assert.notEqual(challengesFingerprint(8, [ch(10, 1)]), base);
  assert.notEqual(challengesFingerprint(7, [ch(10, 1, { description: 'x' })]), base);
});

test('shareable list: 1-50 challenges of this set only', () => {
  assert.equal(shareableList(7, [ch(10, 1)]), true);
  assert.equal(shareableList(7, []), false);
  assert.equal(shareableList(7, [ch(10, 1, { setId: 8 })]), false);
  assert.equal(shareableList(7, [{ challengeId: 'x', setId: 7 }]), false);
  assert.equal(shareableList(7, Array.from({ length: 51 }, (_, i) => ch(i, i))), false);
  assert.equal(shareableList(7, null), false);
});

test('share decision: trusted alone, or enough distinct accounts agreeing', () => {
  assert.equal(shareDecision(true, 1), 'share');
  assert.equal(shareDecision(false, 1), 'hold');
  assert.equal(shareDecision(false, AGREE_PERSONAS), 'share');
});

const sbcSet = (extra: Partial<SbcSet> = {}) =>
  ({ setId: 16, name: 'Marquee Matchups', description: 'Swap', categoryId: 3, challengesCount: 4, challengesCompletedCount: 2, hidden: false, repeatable: true,
    repeatabilityMode: 'REFRESH', repeats: 1, repeatRefreshInterval: 86400, timesCompleted: 3, timesCompletedInInterval: 1, lastCompletedTime: 99,
    releaseTime: 100, endTime: 200, setImageId: 'x', awards: [{ type: 'pack', value: 1 }], ...extra }) as SbcSet;

test('set snapshot keeps only the public fields', () => {
  assert.deepEqual(setSnapshot(sbcSet()), {
    name: 'Marquee Matchups', description: 'Swap', categoryId: 3, repeatabilityMode: 'REFRESH', endTime: 200,
    raw: { releaseTime: 100, hidden: false, awards: [{ type: 'pack', value: 1 }], repeats: 1, repeatRefreshInterval: 86400, challengesCount: 4 },
  });
});

test('set snapshot: wrong types become null / empty', () => {
  const s = setSnapshot(sbcSet({ name: 5 as unknown as string, releaseTime: 'soon' as unknown as number, hidden: 'no' as unknown as boolean, awards: {} as unknown[] }));
  assert.equal(s.name, '');
  assert.equal(s.raw.releaseTime, null);
  assert.equal(s.raw.hidden, null);
  assert.deepEqual(s.raw.awards, []);
});

test('set fingerprint ignores per-account progress, follows public fields, never looks like a challenge one', () => {
  const fp = setFingerprint(16, setSnapshot(sbcSet()));
  assert.ok(fp.startsWith('set:'));
  assert.equal(setFingerprint(16, setSnapshot(sbcSet({ timesCompleted: 9, challengesCompletedCount: 0, lastCompletedTime: 1 }))), fp);
  assert.notEqual(setFingerprint(16, setSnapshot(sbcSet({ name: 'Free coins here' }))), fp);
  assert.notEqual(setFingerprint(17, setSnapshot(sbcSet())), fp);
  assert.notEqual(fp.slice(4), challengesFingerprint(16, []));
});

test('a single untrusted relay with a changed name does not write the public snapshot', () => {
  // the forged name is a new fingerprint: only its own sender has sighted it
  assert.equal(shareDecision(false, 1), 'hold');
  assert.equal(shareDecision(false, AGREE_PERSONAS), 'share');
  assert.equal(shareDecision(true, 1), 'share');
});

test('shareable set: an object with a positive integer setId', () => {
  assert.ok(shareableSet(sbcSet()));
  for (const bad of [null, [], 'x', { setId: 0 }, { setId: 1.5 }, { name: 'x' }]) assert.equal(shareableSet(bad), false);
});
