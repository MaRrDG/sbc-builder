import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayFor, dropDate, nextDropAfter } from './day.js';
import { DAY } from './players.js';

test('day 1 is the first stored answer; later drops count on, DST hours round away', () => {
  const first = { day: 1, dropAt: Date.UTC(2026, 9, 9, 17, 1) };
  assert.equal(dayFor(first.dropAt, null), 1);
  assert.equal(dayFor(first.dropAt, first), 1);
  assert.equal(dayFor(first.dropAt + 3 * DAY, first), 4);
  assert.equal(dayFor(first.dropAt + 30 * DAY + 3_600_000, first), 31); // 25-hour day across DST
});

test('dropDate is the calendar date in the drop time zone', () => {
  assert.equal(dropDate(Date.UTC(2026, 9, 9, 17, 1), 'Europe/Bucharest'), '2026-10-09');
});

test('nextDropAfter asks lastDrop for a moment past the next drop', () => {
  const drops = [Date.UTC(2026, 9, 9, 17, 1), Date.UTC(2026, 9, 10, 17, 1)];
  const last = (d: Date) => [...drops].reverse().find((x) => x <= d.getTime()) ?? 0;
  assert.equal(nextDropAfter(last, drops[0] + 60_000), drops[1]);
  assert.equal(nextDropAfter(last, drops[1] - 60_000), drops[1]);
});
