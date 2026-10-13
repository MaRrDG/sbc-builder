import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mainJob, pct, finishedNow, solveWait, toastable } from './activity';
import type { JobView } from './api';

const v = (o: Partial<JobView>): JobView => ({ id: 'a', kind: 'club', state: 'running', done: 0, total: null, estimated: false, at: 0, error: null, notStarted: false, resumeAt: null, budget: null, ...o });

test('mainJob: first active one', () => {
  assert.equal(mainJob([v({ id: 'x', state: 'done' }), v({ id: 'y', state: 'queued' })])?.id, 'y');
  assert.equal(mainJob([v({ state: 'done' })]), null);
});

test('pct: unknown total is indeterminate, active never shows 100', () => {
  assert.equal(pct(v({ total: null })), null);
  assert.equal(pct(v({ done: 50, total: 200 })), 25);
  assert.equal(pct(v({ done: 300, total: 200 })), 99);
  assert.equal(pct(v({ state: 'done', done: 200, total: 200 })), 100);
});

test('finishedNow: only jobs that were active before', () => {
  const before = [v({ id: 'a', state: 'running' }), v({ id: 'b', state: 'done' })];
  const after = [v({ id: 'a', state: 'done' }), v({ id: 'b', state: 'done' })];
  assert.deepEqual(finishedNow(before, after).map((j) => j.id), ['a']);
});

test('solveWait: a club job queued or running', () => {
  assert.equal(solveWait([v({ kind: 'sbc' })]), null);
  assert.equal(solveWait([v({ kind: 'club', state: 'queued' })])?.kind, 'club');
  assert.equal(solveWait([v({ kind: 'club', state: 'waitingTab' })]), null); // not open: solve the cached club
});

test('toastable: only a finish in the last 30 s', () => {
  const now = 1_000_000;
  const before = [v({ id: 'a', state: 'running' }), v({ id: 'b', state: 'running' })];
  const after = [v({ id: 'a', state: 'done', at: now - 5_000 }), v({ id: 'b', state: 'failed', at: now - 120_000 })];
  assert.deepEqual(toastable(before, after, now).map((j) => j.id), ['a']); // b finished long ago (a stale cached status)
  assert.deepEqual(toastable(after, after, now), []); // nothing was active before
});
