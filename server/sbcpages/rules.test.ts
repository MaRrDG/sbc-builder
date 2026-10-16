import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatAward, inSitemap, isExpired, isPublic, parseSetSlug, setPath, slugify } from './rules.js';

const NOW = 1_800_000_000;

test('slugify keeps latin words, drops the rest', () => {
  assert.equal(slugify('Marquee Matchups'), 'marquee-matchups');
  assert.equal(slugify("  League & Nation: Advanced!! "), 'league-nation-advanced');
  assert.equal(slugify('Ödegaard POTM'), 'odegaard-potm');
  assert.equal(slugify('⭐⭐'), '');
});

test('setPath falls back when the slug is empty', () => {
  assert.equal(setPath(16, 'Marquee Matchups'), '/sbcs/marquee-matchups-16');
  assert.equal(setPath(7, '⭐'), '/sbcs/sbc-7');
});

test('parseSetSlug reads the trailing id only', () => {
  assert.deepEqual(parseSetSlug('marquee-matchups-16'), { setId: 16, slug: 'marquee-matchups' });
  assert.deepEqual(parseSetSlug('16'), { setId: 16, slug: '' });
  assert.equal(parseSetSlug('abc'), null);
  assert.equal(parseSetSlug('x-0'), null);
  assert.equal(parseSetSlug('x-99999999999'), null); // > 9 digits
  assert.equal(parseSetSlug(''), null);
});

test('isPublic needs a vouched challenge, a past release and not hidden', () => {
  assert.equal(isPublic({ raw: { releaseTime: NOW - 10 } }, 1, NOW), true);
  assert.equal(isPublic({ raw: {} }, 1, NOW), true);
  assert.equal(isPublic({ raw: { releaseTime: NOW + 10 } }, 1, NOW), false);
  assert.equal(isPublic({ raw: { releaseTime: NOW - 10 } }, 0, NOW), false);
  assert.equal(isPublic({ raw: { hidden: true } }, 3, NOW), false);
});

test('expired sets leave the sitemap after 60 days', () => {
  assert.equal(inSitemap(null, NOW), true);
  assert.equal(inSitemap(NOW - 59 * 86400, NOW), true);
  assert.equal(inSitemap(NOW - 61 * 86400, NOW), false);
  assert.equal(isExpired(NOW - 1, NOW), true);
  assert.equal(isExpired(null, NOW), false);
});

test('formatAward', () => {
  assert.equal(formatAward({ type: 'coin', value: 5000, count: 1 }), '5,000 coins');
  assert.equal(formatAward({ type: 'pack', value: 509, count: 1, isUntradeable: true }), 'Pack (untradeable)');
  assert.equal(formatAward({ type: 'pack', value: 509, count: 2, isUntradeable: false }), '2× Pack');
  assert.equal(formatAward({ type: 'item', itemDataReduced: { description: 'Player pick' } }), 'Player pick');
  assert.equal(formatAward({ type: 'item' }), 'Item');
  assert.equal(formatAward(null), null);
});

test('formatAward returns null for a non-string type instead of throwing', () => {
  assert.equal(formatAward({ type: 5 }), null);
  assert.equal(formatAward({ type: { x: 1 } }), null);
});

test('formatAward item falls back to Item unless the description is a non-empty string', () => {
  assert.equal(formatAward({ type: 'item', itemDataReduced: { description: '' } }), 'Item');
  assert.equal(formatAward({ type: 'item', itemDataReduced: { description: 7 } }), 'Item');
});

test('formatAward coin without a finite value is null, not 0 or NaN coins', () => {
  assert.equal(formatAward({ type: 'coin' }), null);
  assert.equal(formatAward({ type: 'coin', value: null }), null);
  assert.equal(formatAward({ type: 'coin', value: NaN }), null);
  assert.equal(formatAward({ type: 'coin', value: Infinity }), null);
});

test('isPublic fails closed on a NaN voucher count', () => {
  assert.equal(isPublic({ raw: {} }, NaN, NOW), false);
});
