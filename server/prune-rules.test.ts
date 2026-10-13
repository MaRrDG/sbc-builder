import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPrunable, selectPrunable, type PruneSignals } from './prune-rules.js';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 13);
const old = now - 120 * DAY;
const s = (o: Partial<PruneSignals> = {}): PruneSignals => ({
  personaId: 1,
  owned: false,
  trusted: false,
  live: false,
  lastCache: old,
  lastEvent: null,
  lastLink: null,
  ...o,
});

test('ownerless and quiet for 90 days: pruned', () => {
  assert.equal(isPrunable(s(), now), true);
  assert.equal(isPrunable(s({ lastEvent: old, lastLink: old }), now), true);
});

test('any owner, trust, live tab or unknown signal keeps it', () => {
  assert.equal(isPrunable(s({ owned: true }), now), false);
  assert.equal(isPrunable(s({ trusted: true }), now), false);
  assert.equal(isPrunable(s({ live: true }), now), false);
  assert.equal(isPrunable(s({ unknown: true }), now), false);
});

test('recent activity of any kind keeps it', () => {
  assert.equal(isPrunable(s({ lastCache: now - 89 * DAY }), now), false);
  assert.equal(isPrunable(s({ lastEvent: now - 10 * DAY }), now), false);
  assert.equal(isPrunable(s({ lastLink: now - 1 * DAY }), now), false);
  assert.equal(isPrunable(s({ lastCache: now - 90 * DAY }), now), false); // exactly 90 days: not yet
  assert.equal(isPrunable(s({ lastCache: now - 90 * DAY - 1 }), now), true);
});

test('no readable cache, bad ids or future dates keep it', () => {
  assert.equal(isPrunable(s({ lastCache: null }), now), false);
  assert.equal(isPrunable(s({ lastCache: 0 }), now), false);
  assert.equal(isPrunable(s({ lastCache: NaN }), now), false);
  assert.equal(isPrunable(s({ personaId: 0 }), now), false);
  assert.equal(isPrunable(s({ personaId: 1.5 }), now), false);
  assert.equal(isPrunable(s({ lastEvent: now + 5 * DAY }), now), false);
});

test('selectPrunable: oldest first, capped', () => {
  const list = [
    s({ personaId: 3, lastCache: now - 100 * DAY }),
    s({ personaId: 2, lastCache: now - 200 * DAY }),
    s({ personaId: 4, owned: true }),
    s({ personaId: 5, lastCache: now - 95 * DAY }),
  ];
  assert.deepEqual(selectPrunable(list, now), [2, 3, 5]);
  assert.deepEqual(selectPrunable(list, now, 90, 2), [2, 3]);
  assert.deepEqual(selectPrunable([], now), []);
});
