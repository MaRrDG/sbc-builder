import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Challenge } from './ea.js';
import { seedChallenges } from './shared-sbc.js';

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
