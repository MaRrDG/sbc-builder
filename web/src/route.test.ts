import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adminRoute, canonicalPath, parseRoute, routePath, type Route } from './route.js';

test('root is the landing page, the app lives under /dashboard', () => {
  assert.deepEqual(parseRoute('/'), { view: 'landing' });
  assert.deepEqual(parseRoute('/dashboard'), { view: 'sbcs', setId: null, challengeId: null });
  assert.deepEqual(parseRoute('/dashboard/sbc/16/39'), { view: 'sbcs', setId: 16, challengeId: 39 });
  assert.deepEqual(parseRoute('/dashboard/club'), { view: 'club' });
  assert.deepEqual(parseRoute('/dashboard/admin'), adminRoute('overview'));
});

test('old top-level app paths still parse', () => {
  assert.deepEqual(parseRoute('/sbc/16'), { view: 'sbcs', setId: 16, challengeId: null });
  assert.deepEqual(parseRoute('/club'), { view: 'club' });
  assert.deepEqual(parseRoute('/settings'), { view: 'settings' });
});

test('routePath round-trips', () => {
  const routes: Route[] = [
    { view: 'landing' },
    { view: 'sbcs', setId: null, challengeId: null },
    { view: 'sbcs', setId: 16, challengeId: null },
    { view: 'sbcs', setId: 16, challengeId: 39 },
    { view: 'club' }, { view: 'settings' }, adminRoute('overview'), { view: 'setup' }, { view: 'guide' },
  ];
  for (const r of routes) assert.deepEqual(parseRoute(routePath(r)), r, routePath(r));
  assert.equal(routePath({ view: 'sbcs', setId: 16, challengeId: 39 }), '/dashboard/sbc/16/39');
  assert.equal(routePath({ view: 'setup' }), '/setup');
});

test('canonicalPath rewrites old app URLs only', () => {
  assert.equal(canonicalPath(parseRoute('/club'), '/club'), '/dashboard/club');
  assert.equal(canonicalPath(parseRoute('/sbc/16/39'), '/sbc/16/39'), '/dashboard/sbc/16/39');
  assert.equal(canonicalPath(parseRoute('/dashboard/club'), '/dashboard/club'), null);
  assert.equal(canonicalPath(parseRoute('/'), '/'), null);
  assert.equal(canonicalPath(parseRoute('/signin', '?next=%2Fclub'), '/signin'), null);
});

test('extension links on / open the app, not the landing page', () => {
  // 0.8+ extension: popup.js and bridge.js open `<server>/?update=1`
  assert.deepEqual(parseRoute('/', '?update=1'), { view: 'sbcs', setId: null, challengeId: null });
  assert.equal(canonicalPath(parseRoute('/', '?update=1'), '/'), '/dashboard');
  // pre-0.8 extension: web app opened `<server>/#keys=…` (see legacy.ts)
  assert.deepEqual(parseRoute('/', '', '#keys=abc123'), { view: 'sbcs', setId: null, challengeId: null });
  // plain `/` is still the landing page
  assert.deepEqual(parseRoute('/'), { view: 'landing' });
  assert.deepEqual(parseRoute('/', '?foo=1'), { view: 'landing' });
});

test('admin sub-routes keep their query', () => {
  assert.deepEqual(parseRoute('/dashboard/admin'), adminRoute('overview'));
  assert.deepEqual(parseRoute('/dashboard/admin/users', '?plan=premium&page=2'), adminRoute('users', { query: 'plan=premium&page=2' }));
  assert.deepEqual(parseRoute('/dashboard/admin/users/user_2Rf%2Bx'), adminRoute('user', { userId: 'user_2Rf+x' }));
  assert.deepEqual(parseRoute('/dashboard/admin/accounts', '?state=online'), adminRoute('accounts', { query: 'state=online' }));
  assert.deepEqual(parseRoute('/dashboard/admin/nope'), adminRoute('overview'));
  assert.equal(routePath(adminRoute('users', { query: 'plan=premium' })), '/dashboard/admin/users?plan=premium');
  assert.equal(routePath(adminRoute('users')), '/dashboard/admin/users');
  assert.equal(routePath(adminRoute('user', { userId: 'user_2Rf+x' })), '/dashboard/admin/users/user_2Rf%2Bx');
  for (const r of [adminRoute('overview'), adminRoute('accounts', { query: 'q=a' }), adminRoute('user', { userId: 'u_1' })])
    assert.deepEqual(parseRoute(...(routePath(r).split('?') as [string, string?]).map((s, i) => (i ? `?${s}` : s)) as [string, string]), r);
});

test('canonicalPath ignores the admin query', () => {
  assert.equal(canonicalPath(adminRoute('users', { query: 'page=2' }), '/dashboard/admin/users'), null);
});
