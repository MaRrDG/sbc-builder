import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expiredAs, isTabPoll, JOB_TIMEOUTS } from './job-rules.js';

const S = 1000;

test('isTabPoll: the background poll after hello is not a tab', () => {
  assert.equal(isTabPoll('0.9.0', '1'), true);
  assert.equal(isTabPoll('0.9.0', '0'), true); // a tab not logged in to EA yet is still a tab
  assert.equal(isTabPoll('0.9.0', undefined), false); // background poll after hello (site visit)
  assert.equal(isTabPoll('0.8.8', undefined), false);
  assert.equal(isTabPoll('0.8.7', undefined), true); // old extensions never send ready
  assert.equal(isTabPoll(null, undefined), true);
  assert.equal(isTabPoll(undefined, undefined), true);
});

test('expiredAs: queued jobs wait for a tab, but not forever', () => {
  const now = 1000 * S;
  const queued = { status: 'queued' as const, createdAt: now - 5 * S };
  assert.equal(expiredAs(queued, now, false), null); // just queued
  const old = { status: 'queued' as const, createdAt: now - JOB_TIMEOUTS.open - S };
  assert.equal(expiredAs(old, now, false), 'notStarted'); // no tab took it
  assert.equal(expiredAs(old, now, true), null); // a tab is open: it takes it next poll
});

test('expiredAs: a running job without a live tab is not running', () => {
  const now = 1000 * S;
  const fresh = { status: 'running' as const, createdAt: now - 10 * S, startedAt: now - 10 * S };
  assert.equal(expiredAs(fresh, now, true), null);
  assert.equal(expiredAs(fresh, now, false), 'notStarted'); // handed out, nobody polls: never ran
  const slow = { ...fresh, startedAt: now - JOB_TIMEOUTS.start - S };
  assert.equal(expiredAs(slow, now, true), 'notStarted'); // the tab never asked EA
  const working = { ...fresh, calledAt: now - 5 * S };
  assert.equal(expiredAs(working, now, true), null);
  assert.equal(expiredAs(working, now, false), 'stopped'); // tab closed mid-sync
  const long = { ...working, startedAt: now - JOB_TIMEOUTS.running - S };
  assert.equal(expiredAs(long, now, true), 'stopped');
  assert.equal(expiredAs({ status: 'done', createdAt: 0 }, now, false), null);
});
