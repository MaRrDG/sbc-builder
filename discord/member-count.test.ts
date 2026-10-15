import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RENAME_GAP_MS, isMemberCountName, memberCountName, nextRenameAt } from './member-count.js';

test('member count name: thousands separator, recognised again after a change', () => {
  assert.equal(memberCountName(5), '👥 Members: 5');
  assert.equal(memberCountName(1234), '👥 Members: 1,234');
  assert.ok(isMemberCountName(memberCountName(99)));
  assert.ok(!isMemberCountName('🔊 Lounge'));
});

test('rename gap: now when the last rename is old, else when the gap ends', () => {
  assert.equal(nextRenameAt(0, 1_000_000), 1_000_000);
  assert.equal(nextRenameAt(1_000_000, 1_000_000 + 60_000), 1_000_000 + RENAME_GAP_MS);
});
