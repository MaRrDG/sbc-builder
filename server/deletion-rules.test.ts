import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DELETE_DELAY_MS, deleteDate, isConfirmWord, purgePlan } from './deletion-rules.js';

test('confirm word: the shared rule (shared/confirm-word.test.ts)', () => {
  for (const w of ['DELETE', 'ȘTERGE', 'STERGE', 'şterge', 'elimina']) assert.equal(isConfirmWord(w), true, w);
  for (const w of ['', 'yes', null]) assert.equal(isConfirmWord(w), false, String(w));
});

test('deletion date is 7 days ahead', () => {
  assert.equal(deleteDate(1000).getTime(), 1000 + DELETE_DELAY_MS);
});

test('sole owner: purge', () => {
  assert.deepEqual(purgePlan('a', [{ personaId: 1, ownerId: 'a' }], [{ personaId: 1, userId: 'a' }]), { purge: [1], unlinkOnly: [] });
});

test('another user owns it now: keep the data, drop only my link', () => {
  assert.deepEqual(purgePlan('a', [{ personaId: 1, ownerId: 'b' }], [{ personaId: 1, userId: 'a' }, { personaId: 1, userId: 'b' }]), { purge: [], unlinkOnly: [1] });
});

test('others only linked in the past (not owners): purge', () => {
  assert.deepEqual(purgePlan('a', [{ personaId: 1, ownerId: 'a' }], [{ personaId: 1, userId: 'a' }, { personaId: 1, userId: 'c' }]), { purge: [1], unlinkOnly: [] });
});

test('only a past link, persona unowned: purge', () => {
  assert.deepEqual(purgePlan('a', [{ personaId: 2, ownerId: null }], [{ personaId: 2, userId: 'a' }]), { purge: [2], unlinkOnly: [] });
});
