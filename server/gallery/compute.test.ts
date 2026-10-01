import { test } from 'node:test';
import assert from 'node:assert/strict';
import { badgeFor, buildGallery } from './compute.js';
import { mergeLedger, type Ledger } from './ledger.js';
import type { ClubItem } from '../ea.js';
import type { GallerySet } from './types.js';
import type { Meta } from '../meta.js';

const meta = { names: { nation: {}, league: {}, club: {}, rarity: { '12': 'Base Icon' }, group: {}, loc: {} }, players: {} } as unknown as Meta;
const ci = (p: Partial<ClubItem>): ClubItem => ({
  id: 1, assetId: 10, resourceId: 10, rating: 84, rareflag: 1, preferredPosition: 'CM', possiblePositions: ['CM'],
  teamid: 1, leagueId: 13, nation: 14, untradeable: false, itemState: 'free', owners: 2, gradingScore: 830, ...p,
});
const set: GallerySet = { id: 'a', name: 'A', category: 'club', size: 2, filter: { clubs: [1] }, grades: { D: 10, C: 100, B: 1000, A: 5000, S: 9000 } };

test('empty ledger: every set listed, nothing filled', () => {
  const [r] = buildGallery([set], {}, new Set(), meta);
  assert.equal(r.filled, 0);
  assert.equal(r.missing, 2);
  assert.equal(r.grade, null);
  assert.deepEqual(r.lineup, []);
});

test('lineup marks in-club vs owned-before and carries the score', () => {
  const { ledger } = mergeLedger({}, [ci({ id: 1 }), ci({ id: 2, gradingScore: 2100 })], 1);
  const [r] = buildGallery([set], ledger, new Set([1]), meta);
  assert.equal(r.filled, 2);
  assert.equal(r.grade, 'B'); // 2930 + Multiples 10% (same assetId) = 3223
  assert.deepEqual(r.lineup.map((p) => [p.id, p.inClub, p.score]).sort(), [[1, true, 830], [2, false, 2100]]);
});

test('a malformed ledger entry is skipped, never a failed answer', () => {
  const { ledger } = mergeLedger({}, [ci({ id: 1 })], 1);
  const bad = { ...ledger, '9': { item: { id: 9, assetId: 10, rating: 90, rareflag: 1, teamid: 1 }, firstOwner: true, firstSeen: 1 } } as unknown as Ledger;
  const [r] = buildGallery([set], bad, new Set(), meta);
  assert.deepEqual(r.lineup.map((p) => p.id), [1]);
});

test('badge: club, then league, then rarity; rarity kinds map to their lowest rareflag', () => {
  const base = { ...set, filter: {} };
  assert.deepEqual(buildGallery([set], {}, new Set(), meta)[0].badge, { kind: 'club', id: 1 });
  assert.deepEqual(badgeFor({ ...base, filter: { leagues: [13], nations: [14] } }, {}), { kind: 'league', id: 13 });
  assert.deepEqual(badgeFor({ ...base, filter: { rarities: [87, 3] } }, {}), { kind: 'rarity', id: 87 });
  assert.deepEqual(badgeFor({ ...base, filter: { kinds: ['hero'] } }, { 12: 'icon', 72: 'hero', 70: 'hero' }), { kind: 'rarity', id: 70 });
  assert.equal(badgeFor({ ...base, filter: { kinds: ['totw'] } }, { 12: 'icon' }), null);
  assert.equal(badgeFor({ ...base, filter: { nations: [14] } }, {}), null);
});
