import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockedByMaintenance, maintenanceAlert, NOTE_MAX, OFF, parseMaintenance } from './maintenance-rules.js';

test('site API calls are blocked, pages and open endpoints are not', () => {
  assert.equal(blockedByMaintenance('/api/club', false), true);
  assert.equal(blockedByMaintenance('/api/solve?x=1', false), true);
  assert.equal(blockedByMaintenance('/api/daily/today', false), true);
  assert.equal(blockedByMaintenance('/dashboard', false), false);
  assert.equal(blockedByMaintenance('/assets/app.js', false), false);
  for (const p of ['/api/health', '/api/maintenance', '/api/hello', '/api/billing/webhook', '/api/csp-report?x'])
    assert.equal(blockedByMaintenance(p, false), false, p);
});

test('admin, bot and extension calls pass', () => {
  assert.equal(blockedByMaintenance('/api/admin/maintenance', false), false);
  assert.equal(blockedByMaintenance('/api/bot/solve', false), false);
  assert.equal(blockedByMaintenance('/api/events', true), false);
});

test('a malformed state is off; the note is trimmed and capped', () => {
  assert.deepEqual(parseMaintenance(null), OFF);
  assert.deepEqual(parseMaintenance({ on: 'yes' }), OFF);
  assert.deepEqual(parseMaintenance({ on: false, note: 'x' }), OFF);
  const s = parseMaintenance({ on: true, since: '2026-10-15T10:00:00.000Z', note: '  back   soon \n' });
  assert.deepEqual(s, { on: true, since: '2026-10-15T10:00:00.000Z', note: 'back soon' });
  assert.equal(parseMaintenance({ on: true, note: 'a'.repeat(1000) }).note.length, NOTE_MAX);
  assert.equal(parseMaintenance({ on: true, since: 'nope' }).since, null);
});

test('the Discord line says on / off and carries the note', () => {
  assert.match(maintenanceAlert('fc-solver.app', { on: true, since: null, note: 'DB move' }), /maintenance ON.*\nNote: DB move/s);
  assert.match(maintenanceAlert('fc-solver.app', OFF), /maintenance OFF/);
});
