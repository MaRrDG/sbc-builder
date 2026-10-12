import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHANGELOG, checkEntries, hasUnread, latestEnglish, type ChangelogEntry } from './changelog.js';

const entry = (id: string, n = 1): ChangelogEntry => {
  const items = Array.from({ length: n }, (_, i) => `item ${i}`);
  return { id, date: id.slice(0, 10), items: { en: items, ro: items, it: items } };
};

test('the shipped changelog is valid and starts at v1', () => {
  assert.deepEqual(checkEntries(CHANGELOG), []);
  assert.ok(CHANGELOG.length > 0);
});

test('checkEntries: languages, counts, empty text', () => {
  const missing = { ...entry('2026-10-12'), items: { en: ['a'], ro: ['a'] } } as unknown as ChangelogEntry;
  assert.match(checkEntries([missing]).join(), /2026-10-12.*it/);
  const count = { ...entry('2026-10-12'), items: { en: ['a', 'b'], ro: ['a'], it: ['a', 'b'] } };
  assert.match(checkEntries([count]).join(), /ro/);
  const empty = { ...entry('2026-10-12'), items: { en: [' '], ro: ['a'], it: ['a'] } };
  assert.equal(checkEntries([empty]).length, 1);
  const none = { ...entry('2026-10-12'), items: { en: [], ro: [], it: [] } };
  assert.equal(checkEntries([none]).length, 1);
});

test('checkEntries: ids, dates and order', () => {
  assert.equal(checkEntries([entry('2026-10-12'), entry('2026-10-12')]).length, 1, 'duplicate');
  assert.equal(checkEntries([{ ...entry('2026-10-12'), id: '12 Oct' }]).length, 1, 'bad id');
  assert.equal(checkEntries([{ ...entry('2026-10-12'), date: '2026-10-11' }]).length, 1, 'id not the date');
  assert.equal(checkEntries([entry('2026-10-11'), entry('2026-10-12')]).length, 1, 'older first');
  assert.deepEqual(checkEntries([entry('2026-10-12-2'), entry('2026-10-12'), entry('2026-10-11')]), []);
  assert.equal(checkEntries([entry('2026-10-12'), entry('2026-10-12-2')]).length, 1, 'same day, -2 after the first');
});

test('latestEnglish: newest n, English items only', () => {
  const list = [entry('2026-10-14'), entry('2026-10-13', 2), entry('2026-10-12')];
  list[1].items.ro = ['ro a', 'ro b'];
  assert.deepEqual(latestEnglish(list, 2), [
    { id: '2026-10-14', date: '2026-10-14', items: ['item 0'] },
    { id: '2026-10-13', date: '2026-10-13', items: ['item 0', 'item 1'] },
  ]);
  assert.equal(latestEnglish(list, 10).length, 3);
});

test('hasUnread: only when the newest entry was not seen', () => {
  const list = [entry('2026-10-13'), entry('2026-10-12')];
  assert.equal(hasUnread(list, null), true);
  assert.equal(hasUnread(list, '2026-10-12'), true);
  assert.equal(hasUnread(list, '2026-10-13'), false);
  assert.equal(hasUnread([], null), false);
});
