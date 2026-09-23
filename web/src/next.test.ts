import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNext } from './next.js';

test('safeNext keeps internal paths', () => {
  assert.equal(safeNext('/sbc/16/39'), '/sbc/16/39');
  assert.equal(safeNext('/club?x=1'), '/club?x=1');
});

test('safeNext refuses anything else', () => {
  for (const bad of [null, undefined, '', 'club', '//evil.com', '/\\evil.com', 'https://evil.com', '/signin', '/signin/callback', ' /club'])
    assert.equal(safeNext(bad), '/', String(bad));
});
