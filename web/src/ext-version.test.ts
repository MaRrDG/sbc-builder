import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions, needsUpdate, releaseFor, updateRequired } from './ext-version.js';

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

test('releaseFor: a store copy waits for what Google published, a zip copy gets what the server ships', () => {
  const latest = { version: '1.0.8', notes: ['new'], minVersion: '1.0.0', storeVersion: '1.0.7' };
  assert.equal(releaseFor(latest, 'zip'), latest);
  assert.equal(releaseFor(latest, null), latest);
  const store = releaseFor(latest, 'store')!;
  assert.equal(store.version, '1.0.7');
  assert.deepEqual(store.notes, []);
  assert.equal(needsUpdate('1.0.7', store), false); // 1.0.8 still in review: nothing to show
  assert.equal(needsUpdate('1.0.6', store), true); // Google has 1.0.7: Chrome will update, the user may hurry it
  const published = releaseFor({ ...latest, storeVersion: '1.0.8' }, 'store')!;
  assert.deepEqual(published.notes, ['new']);
  const none = releaseFor({ ...latest, storeVersion: null }, 'store')!;
  assert.equal(needsUpdate('1.0.7', none), false);
  assert.equal(updateRequired('0.9.0', none), true); // the minimum still holds
  assert.equal(releaseFor(null, 'store'), null);
});
