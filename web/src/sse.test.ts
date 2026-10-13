import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clubJobRunning, gapReload, parseSse, refetchPlan, singleFlight } from './sse';

const tick = () => new Promise((r) => setTimeout(r, 0));
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

test('singleFlight: triggers while in flight → one more run, never more than one at a time', async () => {
  const pending: { resolve: (v: number) => void }[] = [];
  let runs = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const applied: number[] = [];
  const sf = singleFlight(
    () => {
      runs++;
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      const d = deferred<number>();
      pending.push(d);
      return d.promise.finally(() => inFlight--);
    },
    (v) => applied.push(v),
  );
  sf.trigger();
  sf.trigger();
  sf.trigger();
  sf.trigger();
  assert.equal(runs, 1);
  pending[0].resolve(1);
  await tick();
  assert.equal(runs, 2); // the dirty mark ran exactly once more
  pending[1].resolve(2);
  await tick();
  assert.equal(runs, 2);
  assert.equal(maxInFlight, 1);
  assert.deepEqual(applied, [1, 2]);
});

test('singleFlight: after reset the answer in flight is dropped', async () => {
  const pending: { resolve: (v: string) => void }[] = [];
  const applied: string[] = [];
  const sf = singleFlight(
    () => {
      const d = deferred<string>();
      pending.push(d);
      return d.promise;
    },
    (v) => applied.push(v),
  );
  sf.trigger(); // account A
  sf.reset(); // switched to B
  sf.trigger(); // B
  pending[1].resolve('B');
  await tick();
  pending[0].resolve('A (late)');
  await tick();
  assert.deepEqual(applied, ['B']);
  sf.trigger(); // A's late finish did not leave it stuck in flight
  assert.equal(pending.length, 3);
});

test('singleFlight: a failed run still lets the dirty run go', async () => {
  let runs = 0;
  const sf = singleFlight(() => (++runs === 1 ? Promise.reject(new Error('down')) : Promise.resolve(runs)), () => {});
  sf.trigger();
  sf.trigger();
  await tick();
  await tick();
  assert.equal(runs, 2);
});

test('clubJobRunning: client job running or legacy club sync', () => {
  assert.equal(clubJobRunning(null), false);
  assert.equal(clubJobRunning({ running: null, jobs: [] }), false);
  assert.equal(clubJobRunning({ running: null, jobs: [{ kind: 'club', state: 'queued' }] }), false);
  assert.equal(clubJobRunning({ running: null, jobs: [{ kind: 'sbc', state: 'running' }] }), false);
  assert.equal(clubJobRunning({ running: null, jobs: [{ kind: 'club', state: 'running' }] }), true);
  assert.equal(clubJobRunning({ running: 'club', jobs: [] }), true);
});

test('gapReload: only what changed while the stream was down', () => {
  const s = { running: null, editedAt: 1, clubAt: 2, sbcAt: 3 };
  assert.deepEqual(gapReload(s, { ...s }), { club: false, sets: false, syncEnded: false });
  assert.deepEqual(gapReload(s, { ...s, clubAt: 9 }), { club: true, sets: false, syncEnded: false });
  assert.deepEqual(gapReload(s, { ...s, sbcAt: 9 }), { club: false, sets: true, syncEnded: false });
  assert.deepEqual(gapReload(s, { ...s, editedAt: 9 }), { club: false, sets: true, syncEnded: false });
  assert.deepEqual(gapReload({ ...s, running: 'club' }, s), { club: false, sets: false, syncEnded: true });
  assert.deepEqual(gapReload(s, { ...s, running: 'club' }), { club: false, sets: false, syncEnded: false });
});

test('parseSse: whole events out, partial kept, comments skipped', () => {
  const r = parseSse(': ping\n\nevent: status\ndata: {"a":1}\n\nevent: changed\ndata: {"ke');
  assert.deepEqual(r.events, [{ event: 'status', data: '{"a":1}' }]);
  assert.equal(r.rest, 'event: changed\ndata: {"ke');
  assert.deepEqual(parseSse(r.rest + 'ys":[]}\n\n').events, [{ event: 'changed', data: '{"keys":[]}' }]);
});

test('refetchPlan: only what changed', () => {
  assert.deepEqual(refetchPlan(['club'], null), { club: true, sets: false, challenges: false, other: false });
  assert.deepEqual(refetchPlan(['storage', 'squad'], null), { club: true, sets: false, challenges: false, other: false });
  assert.deepEqual(refetchPlan(['sets'], 7), { club: false, sets: true, challenges: false, other: false });
  assert.deepEqual(refetchPlan(['challenges/7'], 7), { club: false, sets: true, challenges: true, other: false });
  assert.deepEqual(refetchPlan(['challenges/8'], 7), { club: false, sets: true, challenges: false, other: false });
  assert.deepEqual(refetchPlan(['academy', 'edited'], null), { club: false, sets: false, challenges: false, other: true });
});
