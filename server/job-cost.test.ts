import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobCost, pickJob, stampBudget, UNKNOWN_CLUB_COST } from './job-cost.js';
import { jobView } from './job-view.js';
import { solveWait } from '../web/src/activity.js';

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

test('club cost never goes past the recipe maximum (5000 items)', () => {
  const max = Math.ceil(5000 / 91) + 1 + 4;
  assert.equal(jobCost({ kind: 'club' }, 5000), max);
  assert.equal(jobCost({ kind: 'club' }, 20000), max);
});

test('pickJob on a fresh day: a job costing more than the whole cap still runs', () => {
  const q = [{ status: 'queued', kind: 'club' as const }];
  assert.equal(pickJob(q, 40, 5000, 40).job, q[0]); // left === limit: nothing used today
  assert.equal(pickJob(q, 39, 5000, 40).job, null);
  assert.equal(pickJob(q, 40, 5000).job, null); // no limit given: plain fit
});

test('stampBudget with the cap fully used: every queued job shows budget, so Solve is not held', () => {
  const q: { id: string; kind: 'club' | 'sbc'; status: 'queued' | 'running'; createdAt: number; budget?: { cost: number; left: number } }[] = [
    { id: 'a', kind: 'club', status: 'queued', createdAt: 0 },
    { id: 'b', kind: 'sbc', status: 'queued', createdAt: 0 },
  ];
  const { blocked } = pickJob(q, 0, 2000);
  assert.equal(stampBudget(q, blocked, 0), true);
  assert.deepEqual(q.map((j) => j.budget), [{ cost: Math.ceil(2000 / 91) + 5, left: 0 }, { cost: 2, left: 0 }]);
  assert.equal(stampBudget(q, blocked, 0), false); // unchanged: no notify
  const ctx = { tabOpen: true, tabReady: true, pausedUntil: null, clubExpected: null };
  const views = q.map((j) => jobView(j, ctx));
  assert.equal(views[0].state, 'budget');
  assert.equal(solveWait(views), null);
});
