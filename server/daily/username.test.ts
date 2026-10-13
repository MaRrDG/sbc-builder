import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReservedUsername, normalizeUsername, renameAllowed, usernameKey, usernameUpdate } from './username.js';

test('valid usernames are trimmed and kept as typed', () => {
  assert.equal(normalizeUsername('  Mario_10 '), 'Mario_10');
  assert.equal(normalizeUsername('a.b-c'), 'a.b-c');
  assert.equal(normalizeUsername('abc'), 'abc');
  assert.equal(normalizeUsername('x'.repeat(16)), 'x'.repeat(16));
});

test('invalid usernames are refused', () => {
  for (const bad of ['ab', 'x'.repeat(17), 'two words', 'émile', 'a/b', '...', '_-_', '', '   ', 42, null, undefined, {}])
    assert.equal(normalizeUsername(bad), null, String(bad));
});

test('usernameKey folds case', () => {
  assert.equal(usernameKey('MaRiO'), 'mario');
});

test('reserved names ignore case and . _ -', () => {
  for (const n of ['admin', 'Ad.min', 'xx_Support_xx', 'FC-Solver', 'f.c.s.o.l.v.e.r', 'Mod_erator', 'staff1', 'Official']) assert.ok(isReservedUsername(n), n);
  for (const n of ['Mario', 'solver10', 'fcs', 'ad_mi', 'sup']) assert.equal(isReservedUsername(n), false, n);
});

test('rename: first name and same name are free, a change waits 7 days', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const day = 24 * 3600 * 1000;
  assert.deepEqual(renameAllowed(null, 'Mario', new Date(now.getTime() - day), now), { change: true, ok: true });
  assert.deepEqual(renameAllowed('Mario', 'mARIO', now, now), { change: false });
  assert.deepEqual(renameAllowed('Mario', 'Luigi', null, now), { change: true, ok: true });
  const r = renameAllowed('Mario', 'Luigi', new Date(now.getTime() - 3 * day), now);
  assert.equal(r.change && !r.ok && r.until.toISOString(), '2026-10-17T12:00:00.000Z');
  assert.deepEqual(renameAllowed('Mario', 'Luigi', new Date(now.getTime() - 7 * day), now), { change: true, ok: true });
});

test('usernameUpdate: case-only change saves the casing, never checks reserved or cooldown', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const recent = new Date(now.getTime() - 3600_000); // changed an hour ago: inside the cooldown
  assert.deepEqual(usernameUpdate('Mario', 'Mario', recent, now), { kind: 'same' });
  assert.deepEqual(usernameUpdate('Mario', 'mario', recent, now), { kind: 'recase', username: 'mario' });
  // a name that is reserved today (set before the rule) keeps working when resent with a toggle
  assert.deepEqual(usernameUpdate('Admin', 'Admin', recent, now), { kind: 'same' });
  assert.deepEqual(usernameUpdate('Admin', 'ADMIN', recent, now), { kind: 'recase', username: 'ADMIN' });
});

test('usernameUpdate: a real change is checked, reserved first, then the cooldown', () => {
  const now = new Date('2026-10-13T12:00:00Z');
  const recent = new Date(now.getTime() - 3600_000);
  assert.deepEqual(usernameUpdate('Mario', 'Staff_1', null, now), { kind: 'reserved' });
  assert.deepEqual(usernameUpdate('Mario', 'Staff_1', recent, now), { kind: 'reserved' });
  assert.equal(usernameUpdate('Mario', 'Luigi', recent, now).kind, 'cooldown');
  assert.deepEqual(usernameUpdate('Mario', 'Luigi', null, now), { kind: 'rename', username: 'Luigi' });
  assert.deepEqual(usernameUpdate(null, 'Luigi', null, now), { kind: 'rename', username: 'Luigi' });
  assert.deepEqual(usernameUpdate(null, 'admin', null, now), { kind: 'reserved' });
});
