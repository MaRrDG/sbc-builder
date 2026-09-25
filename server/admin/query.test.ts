import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  clampPage, dayKey, fillDays, filterAccounts, isOutdated, lastDays, likePattern, paginate,
  parseAccountQuery, parsePage, parseRange, parseUserQuery, versionLess, type AccountLike,
} from './query.js';

const TZ = 'Europe/Bucharest';

test('parseUserQuery: defaults and garbage fall back', () => {
  assert.deepEqual(parseUserQuery({}), { q: '', plan: 'all', activity: 'all', ea: 'all', sort: 'lastSeen', dir: 'desc', page: 1 });
  assert.deepEqual(
    parseUserQuery({ q: '  Ana ', plan: 'premium', activity: 'inactive30', ea: 'problem', sort: 'email', dir: 'asc', page: '3' }),
    { q: 'Ana', plan: 'premium', activity: 'inactive30', ea: 'problem', sort: 'email', dir: 'asc', page: 3 },
  );
  const bad = parseUserQuery({ plan: 'gold', activity: 1, ea: ['x'], sort: 'drop table', dir: 'up', page: '-2' });
  assert.equal(bad.plan, 'all');
  assert.equal(bad.activity, 'all');
  assert.equal(bad.ea, 'all');
  assert.equal(bad.sort, 'lastSeen');
  assert.equal(bad.dir, 'desc');
  assert.equal(bad.page, 1);
  assert.equal(parseUserQuery({ q: 'x'.repeat(500) }).q.length, 100);
});

test('parsePage / parseRange', () => {
  assert.equal(parsePage('2'), 2);
  assert.equal(parsePage('2.5'), 1);
  assert.equal(parsePage('0'), 1);
  assert.equal(parsePage('99999999'), 10000);
  assert.equal(parseRange('30'), 30);
  assert.equal(parseRange('14'), 7);
  assert.equal(parseRange(undefined), 7);
});

test('parseAccountQuery defaults', () => {
  assert.deepEqual(parseAccountQuery({ state: 'nope' }), { q: '', state: 'all', sort: 'name', dir: 'asc', page: 1 });
});

test('clampPage and paginate: past the end gives the last page', () => {
  assert.equal(clampPage(99, 3), 1);
  assert.equal(clampPage(3, 60), 3);
  assert.equal(clampPage(4, 60), 3);
  assert.equal(clampPage(5, 0), 1);
  const rows = Array.from({ length: 30 }, (_, i) => i);
  assert.deepEqual(paginate(rows, 9), { rows: rows.slice(25), total: 30, page: 2, pageSize: 25 });
  assert.deepEqual(paginate([], 3), { rows: [], total: 0, page: 1, pageSize: 25 });
});

test('versions', () => {
  assert.equal(versionLess('0.8.2', '0.8.10'), true);
  assert.equal(versionLess('0.9', '0.8.10'), false);
  assert.equal(versionLess('0.8.4', '0.8.4'), false);
  assert.equal(isOutdated('0.8.4', '0.8.5'), true);
  assert.equal(isOutdated('0.8.5', '0.8.5'), false);
  assert.equal(isOutdated(null, '0.8.5'), true); // unknown: an old extension
});

const acc = (p: Partial<AccountLike & { ownerEmail: string | null }>) => ({
  personaId: 1, personaName: 'Ana', clubName: 'FC A', ownerEmail: 'a@x.ro', online: false, error: null, clubStale: false,
  sbcStale: false, extVersion: '0.8.5', trusted: false, clubAt: 1, sbcAt: 1, ea: { today: 0, limit: 150, pausedUntil: null }, ...p,
});

test('filterAccounts: state, text and sort', () => {
  const rows = [
    acc({ personaId: 1, personaName: 'Bob', online: true, clubAt: 5 }),
    acc({ personaId: 2, personaName: 'ana', error: 'boom', clubAt: 9 }),
    acc({ personaId: 3, personaName: 'Cid', ownerEmail: null, extVersion: '0.7.0', trusted: true, clubAt: null }),
    acc({ personaId: 4, personaName: 'Dan', ea: { today: 150, limit: 150, pausedUntil: null } }),
  ];
  const q = (x: Record<string, string>) => parseAccountQuery(x);
  assert.deepEqual(filterAccounts(rows, q({}), '0.8.5').map((r) => r.personaName), ['ana', 'Bob', 'Cid', 'Dan']); // case-insensitive name sort
  assert.deepEqual(filterAccounts(rows, q({ state: 'online' }), '0.8.5').map((r) => r.personaId), [1]);
  assert.deepEqual(filterAccounts(rows, q({ state: 'problem' }), '0.8.5').map((r) => r.personaId), [2, 4]);
  assert.deepEqual(filterAccounts(rows, q({ state: 'outdated' }), '0.8.5').map((r) => r.personaId), [3]);
  assert.deepEqual(filterAccounts(rows, q({ state: 'unlinked' }), '0.8.5').map((r) => r.personaId), [3]);
  assert.deepEqual(filterAccounts(rows, q({ state: 'trusted' }), '0.8.5').map((r) => r.personaId), [3]);
  assert.deepEqual(filterAccounts(rows, q({ q: '3' }), '0.8.5').map((r) => r.personaId), [3]); // exact personaId
  assert.deepEqual(filterAccounts(rows, q({ q: 'A@X' }), '0.8.5').length, 3); // owner email, case-insensitive
  // nulls last in both directions
  assert.deepEqual(filterAccounts(rows, q({ sort: 'clubAt', dir: 'desc' }), '0.8.5').map((r) => r.personaId), [2, 1, 4, 3]);
  assert.deepEqual(filterAccounts(rows, q({ sort: 'clubAt', dir: 'asc' }), '0.8.5').map((r) => r.personaId), [4, 1, 2, 3]);
});

test('likePattern escapes wildcards', () => {
  assert.equal(likePattern('a%b_c\\'), '%a\\%b\\_c\\\\%');
});

test('dayKey uses the drop timezone', () => {
  // 2026-09-24 22:30 UTC is already 25 Sept in Bucharest (UTC+3)
  assert.equal(dayKey(Date.UTC(2026, 8, 24, 22, 30), TZ), '2026-09-25');
});

test('lastDays: consecutive days across DST changes', () => {
  for (const now of [Date.UTC(2026, 2, 29, 21, 30) /* 30 Mar 00:30 local, day after spring-forward */, Date.UTC(2026, 9, 25, 22, 30) /* 26 Oct 00:30 local */]) {
    const days = lastDays(30, now, TZ);
    assert.equal(days.length, 30);
    assert.equal(new Set(days).size, 30);
    assert.equal(days[29], dayKey(now, TZ));
    for (let i = 1; i < days.length; i++)
      assert.equal(Date.parse(`${days[i]}T00:00:00Z`) - Date.parse(`${days[i - 1]}T00:00:00Z`), 86400000, days[i]);
  }
});

test('fillDays aligns rows and zero-fills', () => {
  const days = ['2026-09-23', '2026-09-24', '2026-09-25'];
  assert.deepEqual(fillDays(days, [{ day: '2026-09-25', n: 4 }, { day: '2026-01-01', n: 9 }], (r) => r.n), [0, 0, 4]);
});
