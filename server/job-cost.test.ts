import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobCost, pickJob, UNKNOWN_CLUB_COST } from './job-cost.js';

test('club cost: pages of 91 plus a spare page plus 4 fixed calls', () => {
  assert.equal(jobCost({ kind: 'club' }, 4950), Math.ceil(4950 / 91) + 1 + 4); // 60
  assert.equal(jobCost({ kind: 'club' }, 91), 1 + 1 + 4);
  assert.equal(jobCost({ kind: 'club' }, 0), UNKNOWN_CLUB_COST);
  assert.equal(jobCost({ kind: 'club' }, null), UNKNOWN_CLUB_COST);
});

test('other kinds', () => {
  assert.equal(jobCost({ kind: 'challenges', setIds: [1, 2, 3] }, null), 3);
  assert.equal(jobCost({ kind: 'challenges', setIds: Array.from({ length: 50 }, (_, i) => i) }, null), 40);
  assert.equal(jobCost({ kind: 'sbc' }, null), 2);
  assert.equal(jobCost({ kind: 'academy' }, null), 1);
  assert.equal(jobCost({ kind: 'challengeSquad' }, null), 1);
});

test('pickJob takes the first queued job that fits and reports the ones that do not', () => {
  const q = [
    { status: 'done', kind: 'sbc' as const },
    { status: 'queued', kind: 'club' as const },
    { status: 'queued', kind: 'sbc' as const },
  ];
  const r = pickJob(q, 10, 2000);
  assert.equal(r.job, q[2]);
  assert.deepEqual(r.blocked.map((b) => [b.job, b.cost]), [[q[1], Math.ceil(2000 / 91) + 5]]);
});

test('pickJob at the edge: cost equal to what is left fits', () => {
  const q = [{ status: 'queued', kind: 'sbc' as const }];
  assert.equal(pickJob(q, 2, null).job, q[0]);
  assert.equal(pickJob(q, 1, null).job, null);
});
