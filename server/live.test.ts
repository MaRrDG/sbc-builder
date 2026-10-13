import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyOwner, sseFrame, subscribe, notify, takeStream, dropStream, MAX_STREAMS } from './live.js';

test('keyOwner: account keys only', () => {
  assert.deepEqual(keyOwner('accounts/42/club'), { personaId: 42, name: 'club' });
  assert.deepEqual(keyOwner('accounts/42/challenges/9001'), { personaId: 42, name: 'challenges/9001' });
  assert.equal(keyOwner('meta/global'), null);
  assert.equal(keyOwner('accounts/x/club'), null);
});

test('sseFrame: event + one data line', () => {
  assert.equal(sseFrame('changed', { keys: ['club'] }), 'event: changed\ndata: {"keys":["club"]}\n\n');
});

test('notify reaches only that persona, unsubscribe stops it', () => {
  const got: string[][] = [];
  const off = subscribe(1, (k) => got.push(k));
  subscribe(2, () => assert.fail('wrong persona'));
  notify(1, ['club']);
  off();
  notify(1, ['sets']);
  assert.deepEqual(got, [['club']]);
});

test('stream slots: at most MAX_STREAMS per user', () => {
  for (let i = 0; i < MAX_STREAMS; i++) assert.equal(takeStream('u'), true);
  assert.equal(takeStream('u'), false);
  dropStream('u');
  assert.equal(takeStream('u'), true);
});
