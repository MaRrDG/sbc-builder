import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGallery } from './compute.js';
import { mergeLedger } from './ledger.js';
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
