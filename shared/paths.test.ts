import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isKnownPath } from './paths.js';

test('site pages, app screens and old app links are known', () => {
  for (const p of ['/', '', '/daily/practice', '/signin/callback', '/terms', '/changelog', '/dashboard', '/dashboard/', '/dashboard/sbc/16/39', '/dashboard/admin/users/x', '/club', '/sbc/16'])
    assert.equal(isKnownPath(p), true, p);
});

test('anything else is not', () => {
  for (const p of ['/nope', '/dashboard/nope', '/dashboardx', '/Daily', '/index.php', '/wp-admin/setup'])
    assert.equal(isKnownPath(p), false, p);
});
