import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldLogRollover, type MeterData } from './meter.js';

const day = (count: number): MeterData => ({ day: '2026-09-23', count, byPath: {}, recent: [] });

test('logs a rollover only when the finished day actually saw requests', () => {
  assert.equal(shouldLogRollover(day(11)), true);
  assert.equal(shouldLogRollover(day(0)), false);
});

test('nothing to log when there was no cached day at all (first ever load)', () => {
  assert.equal(shouldLogRollover(null), false);
});
