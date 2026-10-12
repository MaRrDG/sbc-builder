import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanProps, streakBucket, yn } from './track.js';

test('cleanProps: at most 10 keys, no undefined, strings, 255 chars', () => {
  const many = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`k${i}`, i]));
  assert.equal(Object.keys(cleanProps(many)).length, 10);
  assert.deepEqual(cleanProps({ a: undefined, b: 3, c: 'x' }), { b: '3', c: 'x' });
  assert.equal(cleanProps({ a: 'y'.repeat(300) }).a.length, 255);
  assert.deepEqual(cleanProps(undefined), {});
});

test('streak buckets', () => {
  assert.deepEqual([0, 1, 6, 7, 13, 14, 29, 30, 99].map(streakBucket), ['0', '1-6', '1-6', '7-13', '7-13', '14-29', '14-29', '30+', '30+']);
});

test('yes / no', () => {
  assert.equal(yn(true), 'yes');
  assert.equal(yn(false), 'no');
});
