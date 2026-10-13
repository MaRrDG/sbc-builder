import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.SBC_DATA_DIR = await mkdtemp(join(tmpdir(), 'fcs-meter-'));
const { RequestMeter, shouldLogRollover } = await import('./meter.js');
type MeterData = import('./meter.js').MeterData;

const day = (count: number): MeterData => ({ day: '2026-09-23', count, byPath: {}, recent: [] });

test('logs a rollover only when the finished day actually saw requests', () => {
  assert.equal(shouldLogRollover(day(11)), true);
  assert.equal(shouldLogRollover(day(0)), false);
});

test('nothing to log when there was no cached day at all (first ever load)', () => {
  assert.equal(shouldLogRollover(null), false);
});

test('a throttling pause survives a restart (a new meter on the same file)', async () => {
  const a = new RequestMeter('t/pause', 1);
  await a.pause();
  const b = new RequestMeter('t/pause', 1);
  const s = await b.summary();
  assert.ok(s.pausedUntil && s.pausedUntil > Date.now() + 14 * 60_000);
  await assert.rejects(b.check(), /slow down/);
});

test('an expired pause on disk is not a pause', async () => {
  const { writeCache } = await import('./store.js');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
  await writeCache('t/old', { day, count: 0, byPath: {}, recent: [], pausedUntil: Date.now() - 1000 });
  const m = new RequestMeter('t/old', 1);
  assert.equal((await m.summary()).pausedUntil, null);
  await m.check();
});

test('a pause carries over the day rollover', async () => {
  const { writeCache } = await import('./store.js');
  await writeCache('t/roll', { day: '2000-01-01', count: 3, byPath: {}, recent: [], pausedUntil: Date.now() + 60_000 });
  const m = new RequestMeter('t/roll', 1);
  assert.ok((await m.summary()).pausedUntil);
});
