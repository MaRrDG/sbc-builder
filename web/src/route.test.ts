import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalPath, parseRoute, routePath, type Route } from './route.js';

test('root is the landing page, the app lives under /dashboard', () => {
  assert.deepEqual(parseRoute('/'), { view: 'landing' });
  assert.deepEqual(parseRoute('/dashboard'), { view: 'sbcs', setId: null, challengeId: null });
  assert.deepEqual(parseRoute('/dashboard/sbc/16/39'), { view: 'sbcs', setId: 16, challengeId: 39 });
  assert.deepEqual(parseRoute('/dashboard/club'), { view: 'club' });
  assert.deepEqual(parseRoute('/dashboard/admin'), { view: 'admin' });
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
    { view: 'club' }, { view: 'settings' }, { view: 'admin' }, { view: 'setup' }, { view: 'guide' },
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
