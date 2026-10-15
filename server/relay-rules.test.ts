import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelayBudget, relayFileRefusal, RELAY_FILE_CAP, RELAY_FILE_MAX_BYTES } from './relay-rules.js';

const HOUR = 60 * 60 * 1000;
const limits = { hourRequests: 3, hourBytes: 100, dayRequests: 5, dayBytes: 250 };

test('budget: requests per hour, then a new hour', () => {
  let t = 0;
  const b = createRelayBudget(limits, () => t);
  assert.deepEqual([b(1, 1), b(1, 1), b(1, 1), b(1, 1)], [true, true, true, false]);
  assert.equal(b(2, 1), true); // per account
  t = HOUR;
  assert.equal(b(1, 1), true);
});

test('budget: bytes per hour; a refused relay counts nothing', () => {
  const b = createRelayBudget(limits, () => 0);
  assert.equal(b(1, 90), true);
  assert.equal(b(1, 20), false);
  assert.equal(b(1, 10), true); // the refused 20 did not count
});

test('budget: the day caps across hours', () => {
  let t = 0;
  const b = createRelayBudget(limits, () => t);
  for (let h = 0; h < 2; h++) {
    t = h * HOUR;
    assert.equal(b(1, 1), true);
    assert.equal(b(1, 1), true);
  }
  t = 2 * HOUR;
  assert.equal(b(1, 1), true);
  assert.equal(b(1, 1), false); // 5 a day
  t = 24 * HOUR;
  assert.equal(b(1, 1), true);
});

test('budget: day bytes', () => {
  let t = 0;
  const b = createRelayBudget(limits, () => t);
  assert.equal(b(1, 100), true);
  t = HOUR;
  assert.equal(b(1, 100), true);
  t = 2 * HOUR;
  assert.equal(b(1, 100), false);
  assert.equal(b(1, 50), true);
});

test('budget: old windows are swept', () => {
  let t = 0;
  const b = createRelayBudget(limits, () => t);
  b(1, 1);
  b(2, 1);
  t = 25 * HOUR;
  b(3, 1);
  assert.equal(b.size(), 1);
});

test('files: an update always fits, a new file only under the cap', () => {
  const cap = RELAY_FILE_CAP.challenges;
  assert.equal(relayFileRefusal('challenges', { bytes: 10, exists: true, files: cap }), null);
  assert.equal(relayFileRefusal('challenges', { bytes: 10, exists: false, files: cap - 1 }), null);
  assert.equal(relayFileRefusal('challenges', { bytes: 10, exists: false, files: cap }), 'tooManyFiles');
});

test('files: too big', () => {
  assert.equal(relayFileRefusal('challenges', { bytes: RELAY_FILE_MAX_BYTES + 1, exists: true, files: 0 }), 'tooBig');
});

test('files: a challenge squad needs a challenge this account has cached', () => {
  assert.equal(relayFileRefusal('challengeSquads', { bytes: 10, exists: false, files: 0, known: false }), 'unknownChallenge');
  assert.equal(relayFileRefusal('challengeSquads', { bytes: 10, exists: false, files: 0, known: true }), null);
  assert.equal(relayFileRefusal('challengeSquads', { bytes: 10, exists: false, files: RELAY_FILE_CAP.challengeSquads, known: true }), 'tooManyFiles');
});
