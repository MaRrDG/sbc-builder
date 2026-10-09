import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, langFor, tr } from './i18n.js';
import { CAT } from './layout.js';

test('en and ro have the same keys and the same {placeholders}', () => {
  assert.deepEqual(Object.keys(STRINGS.ro).sort(), Object.keys(STRINGS.en).sort());
  const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
  for (const k of Object.keys(STRINGS.en) as (keyof typeof STRINGS.en)[]) assert.deepEqual(ph(STRINGS.ro[k]), ph(STRINGS.en[k]), k);
});

test('tr fills params', () => {
  assert.equal(tr('en', 'roles.saved', { list: 'FCSB, Milan' }), 'Saved: FCSB, Milan');
});

test('language: category first, then site language, then Discord locale, else English', () => {
  assert.equal(langFor({ category: CAT.ro, siteLang: 'en', locale: 'en-US' }), 'ro');
  assert.equal(langFor({ category: CAT.en, siteLang: 'ro', locale: 'ro' }), 'en');
  assert.equal(langFor({ category: CAT.info, siteLang: 'ro' }), 'ro');
  assert.equal(langFor({ category: CAT.info, siteLang: 'it', locale: 'ro' }), 'en');
  assert.equal(langFor({ category: null, locale: 'ro' }), 'ro');
  assert.equal(langFor({ category: null }), 'en');
});
