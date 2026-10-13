import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobView, jobViews, type JobLike } from './job-view.js';

const ctx = { tabOpen: true, tabReady: true, pausedUntil: null, clubExpected: 1200 };
const base: JobLike = { id: 'a', kind: 'club', status: 'queued', createdAt: 1000 };

test('queued job: waits for the tab, then for the EA login, else queued', () => {
  assert.equal(jobView(base, { ...ctx, tabOpen: false }).state, 'waitingTab');
  assert.equal(jobView(base, { ...ctx, tabReady: false }).state, 'waitingLogin');
  assert.equal(jobView(base, ctx).state, 'queued');
});

test('EA pause wins over running and carries the resume time', () => {
  const v = jobView({ ...base, status: 'running', startedAt: 2000 }, { ...ctx, pausedUntil: 9000 });
  assert.equal(v.state, 'paused');
  assert.equal(v.resumeAt, 9000);
});

test('club progress: players loaded of the last club size, estimated', () => {
  const v = jobView({ ...base, status: 'running', startedAt: 2000, clubLoaded: 455 }, ctx);
  assert.deepEqual([v.done, v.total, v.estimated], [455, 1200, true]);
});

test('challenges progress: sets read of sets asked, capped; done shows full', () => {
  const run = jobView({ ...base, kind: 'challenges', status: 'running', setIds: [1, 2, 3], calls: 5 }, ctx);
  assert.deepEqual([run.done, run.total, run.estimated], [3, 3, false]);
  const fin = jobView({ ...base, kind: 'challenges', status: 'done', setIds: [1, 2], calls: 1, finishedAt: 5000 }, ctx);
  assert.deepEqual([fin.state, fin.done, fin.at], ['done', 2, 5000]);
});

test('failed job keeps its error and notStarted', () => {
  const v = jobView({ ...base, status: 'failed', error: 'tab closed', notStarted: true, finishedAt: 7000 }, ctx);
  assert.deepEqual([v.state, v.error, v.notStarted], ['failed', 'tab closed', true]);
});

test('jobViews: active first (oldest first), then the newest finished per kind, at most 6', () => {
  const jobs: JobLike[] = [
    { ...base, id: 'old-club', status: 'done', finishedAt: 100 },
    { ...base, id: 'new-club', status: 'done', finishedAt: 200 },
    { ...base, id: 'sbc', kind: 'sbc', status: 'running', createdAt: 50, startedAt: 60 },
    { ...base, id: 'ch', kind: 'challenges', status: 'queued', createdAt: 70, setIds: [1] },
  ];
  assert.deepEqual(jobViews(jobs, ctx).map((v) => v.id), ['sbc', 'ch', 'new-club']);
});
