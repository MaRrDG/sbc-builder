import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectRewardItems, itemsFromCache } from './ingest.js';

const p = (assetId: number) => ({ itemType: 'player', assetId });

test('club, storage and unassigned lists pass through', () => {
  assert.deepEqual(itemsFromCache('accounts/7/club', [p(1), p(2)]), [p(1), p(2)]);
  assert.deepEqual(itemsFromCache('accounts/7/storage', [p(3)]), [p(3)]);
  assert.deepEqual(itemsFromCache('accounts/7/unassigned', [p(4)]), [p(4)]);
});

test('other keys are ignored', () => {
  assert.deepEqual(itemsFromCache('accounts/7/sets', [p(1)]), []);
  assert.deepEqual(itemsFromCache('accounts/7/gallery', [p(1)]), []);
  assert.deepEqual(itemsFromCache('static', [p(1)]), []);
  assert.deepEqual(itemsFromCache('accounts/7/club', { not: 'a list' }), []);
});

test('objective rewards: player items anywhere in the tree', () => {
  const data = { categories: [{ groupsList: [{ awardsList: [{ itemDataReduced: p(5) }], objectives: [{ awards: [{ itemDataReduced: p(6) }, { itemDataReduced: { itemType: 'pack' } }] }] }] }] };
  assert.deepEqual(itemsFromCache('accounts/7/objectives', data).map((x) => (x as { assetId: number }).assetId).sort(), [5, 6]);
  assert.deepEqual(collectRewardItems(null), []);
});
