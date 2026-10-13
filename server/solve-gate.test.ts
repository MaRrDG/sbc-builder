import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGate, GateFull, userLock } from './solve-gate.js';

const deferred = () => {
  let resolve!: () => void;
  const p = new Promise<void>((r) => (resolve = r));
  return { p, resolve };
};

test('at most `max` run at once, the rest wait in order', async () => {
  const g = createGate(2, 12);
  const order: number[] = [];
  const d = [deferred(), deferred(), deferred()];
  const runs = d.map((x, i) => g.run(async () => { order.push(i); await x.p; return i; }));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(order, [0, 1]);
  assert.deepEqual(g.stats(), { running: 2, queued: 1 });
  d[0].resolve();
  await runs[0];
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(order, [0, 1, 2]);
  d[1].resolve(); d[2].resolve();
  assert.deepEqual(await Promise.all(runs), [0, 1, 2]);
  assert.deepEqual(g.stats(), { running: 0, queued: 0 });
});

test('a full queue refuses at once', async () => {
  const g = createGate(1, 1);
  const hold = deferred();
  const a = g.run(() => hold.p);
  const b = g.run(async () => 1);
  await assert.rejects(g.run(async () => 2), GateFull);
  hold.resolve();
  await a; await b;
});

test('release on throw: a failing run frees its slot', async () => {
  const g = createGate(1, 5);
  await assert.rejects(g.run(async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await g.run(async () => 7), 7);
  assert.deepEqual(g.stats(), { running: 0, queued: 0 });
});

test('userLock: one per key until released', () => {
  const l = userLock();
  assert.equal(l.take('u1'), true);
  assert.equal(l.take('u1'), false);
  assert.equal(l.take('u2'), true);
  l.release('u1');
  assert.equal(l.take('u1'), true);
});
