import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOnboarding, tally, FUT_YEARS } from './onboarding.js';

test('parseOnboarding', () => {
  assert.deepEqual(parseOnboarding({ heardFrom: 'tiktok', futYears: '1-3' }), { heardFrom: 'tiktok', futYears: '1-3' });
  assert.deepEqual(parseOnboarding({ skip: true }), { skip: true });
  assert.deepEqual(parseOnboarding({ skip: true, heardFrom: 'tiktok' }), { skip: true });
  assert.equal(parseOnboarding({ heardFrom: 'tiktok' }), null); // both answers needed
  assert.equal(parseOnboarding({ heardFrom: 'myspace', futYears: '1-3' }), null);
  assert.equal(parseOnboarding({ heardFrom: 'reddit', futYears: 3 }), null);
  assert.equal(parseOnboarding({ skip: 'yes' }), null);
  assert.equal(parseOnboarding(null), null);
  assert.equal(parseOnboarding('tiktok'), null);
});

test('tally', () => {
  assert.deepEqual(tally(FUT_YEARS, [{ value: '8+', n: 4 }, { value: null, n: 9 }, { value: 'lt1', n: 1 }]), [
    { value: 'lt1', count: 1 },
    { value: '1-3', count: 0 },
    { value: '4-7', count: 0 },
    { value: '8+', count: 4 },
  ]);
});
