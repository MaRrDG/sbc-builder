import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Account } from './accounts.js';
import { isShuttingDown, waitForWork, wakeAll } from './jobs.js';

test('wakeAll answers every held poll at once and marks the shutdown', async () => {
  const a = { id: 1 } as Account;
  const b = { id: 2 } as Account;
  assert.equal(isShuttingDown(), false);
  const t0 = Date.now();
  const held = Promise.all([waitForWork(a, 10_000), waitForWork(a, 10_000), waitForWork(b, 10_000)]);
  wakeAll();
  await held;
  assert.ok(Date.now() - t0 < 1000);
  assert.equal(isShuttingDown(), true);
});
