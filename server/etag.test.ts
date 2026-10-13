import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etagOf, notModified } from './etag.js';

test('etagOf: stable, quoted, differs per body', () => {
  assert.equal(etagOf('{"a":1}'), etagOf('{"a":1}'));
  assert.notEqual(etagOf('{"a":1}'), etagOf('{"a":2}'));
  assert.match(etagOf('x'), /^"[\w-]{22}"$/);
});

test('notModified: exact, weak, list, missing', () => {
  const tag = etagOf('x');
  assert.equal(notModified(tag, tag), true);
  assert.equal(notModified(`W/${tag}`, tag), true);
  assert.equal(notModified(`"zzz", ${tag}`, tag), true);
  assert.equal(notModified(undefined, tag), false);
  assert.equal(notModified('"other"', tag), false);
});
