import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, needsUpdate, updateRequired } from './ext-version.js';

const rel = { version: '1.0.3', notes: [], minVersion: '1.0.0' };

test('compareVersions', () => {
  assert.equal(compareVersions('0.9.0', '1.0.0'), -1);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
  assert.equal(compareVersions('1.0.10', '1.0.9'), 1);
});

test('update required only below the minimum', () => {
  assert.equal(updateRequired('0.9.0', rel), true);
  assert.equal(updateRequired('0.8.9', rel), true);
  assert.equal(updateRequired('1.0.0', rel), false);
  assert.equal(updateRequired('1.0.2', rel), false);
  assert.equal(needsUpdate('1.0.2', rel), true);
});

test('unknown version or no minimum: never required', () => {
  assert.equal(updateRequired(null, rel), false);
  assert.equal(updateRequired(undefined, rel), false);
  assert.equal(updateRequired('0.1.0', { version: '1.0.3', notes: [] }), false);
  assert.equal(updateRequired('0.1.0', null), false);
});
