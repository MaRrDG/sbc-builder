import { test } from 'node:test';
import assert from 'node:assert/strict';
import { untilText } from './repeat';

const t = (k: string, p: Record<string, string | number> = {}) => `${k}:${JSON.stringify(p)}`;
const NOW = 1_000_000_000_000;

test('untilText: minutes, hours, days', () => {
  assert.equal(untilText(t as never, NOW + 5 * 60e3, NOW), 'time.until.min:{"m":5}');
  assert.equal(untilText(t as never, NOW + 125 * 60e3, NOW), 'time.until.hmin:{"h":2,"m":5}');
  assert.equal(untilText(t as never, NOW + (3 * 24 + 4) * 3600e3, NOW), 'time.until.dh:{"d":3,"h":4}');
});
