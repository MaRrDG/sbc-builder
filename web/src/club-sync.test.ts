import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clubSyncRunning } from './club-sync.js';

const club = (state: 'queued' | 'running') => ({ club: { state, loaded: 0, expected: 380 } });

test('clubSyncRunning: only while a live web app tab runs it', () => {
  assert.equal(clubSyncRunning(club('running'), true), true);
  assert.equal(clubSyncRunning(club('running'), false), false); // no tab: nothing can be loading
  assert.equal(clubSyncRunning(club('queued'), true), false); // waiting for the tab to pick it up
  assert.equal(clubSyncRunning(club('queued'), false), false);
  assert.equal(clubSyncRunning({ club: null }, true), false);
  assert.equal(clubSyncRunning(null, true), false);
});
