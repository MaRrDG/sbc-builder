import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICONS, ICON_RAREFLAG, iconRows, type IconEntry } from './icons.js';
import { DAY, mergePlayer, type Observation } from './players.js';
import { eligible } from './pool.js';
import { LEGENDS_CLUB_ID, LEGENDS_LEAGUE_ID } from '../meta.js';

test('icons.json: 136 unique icons, sorted, valid fields', () => {
  assert.equal(ICONS.length, 136);
  assert.equal(new Set(ICONS.map((i) => i.assetId)).size, 136);
  for (const [k, i] of ICONS.entries()) {
    assert.ok(Number.isInteger(i.assetId) && i.assetId > 0, `assetId ${i.assetId}`);
    assert.ok(i.gender === 0 || i.gender === 1, `gender of ${i.assetId}`);
    assert.ok(Number.isInteger(i.nation) && i.nation > 0, `nation of ${i.assetId}`);
    assert.ok(typeof i.position === 'string' && i.position.length > 0, `position of ${i.assetId}`);
    if (k) assert.ok(ICONS[k - 1].assetId < i.assetId, 'sorted by assetId');
  }
  assert.equal(ICONS.filter((i) => i.gender === 1).length, 20);
});

const NOW = 2_000 * DAY;
const cat: IconEntry[] = [
  { assetId: 1397, nation: 18, position: 'CAM', gender: 0 },
  { assetId: 226301, nation: 95, position: 'ST', gender: 1 },
  { assetId: 153079, nation: 52, position: 'ST', gender: 0 },
  { assetId: 999, nation: 14, position: 'GK', gender: 0 },
];
const names = {
  1397: { name: 'Zidane', full: 'Zinedine Zidane', rating: 96 },
  226301: { name: 'Marta', full: 'Marta Vieira da Silva', rating: 94 },
  153079: { name: 'Agüero', full: 'Sergio Agüero', rating: 90 },
};

test('iconRows: new icons only, names + rating from EA static, the rest from the catalogue', () => {
  const s = iconRows(cat, names, new Set([153079]), NOW);
  assert.equal(s.present, 1);
  assert.deepEqual(s.missing, [999]); // not in EA static: no row
  assert.deepEqual(s.rows.map((r) => r.assetId), [1397, 226301]);
  assert.deepEqual(s.rows[1], {
    assetId: 226301, name: 'Marta', fullName: 'Marta Vieira da Silva', nation: 95, league: LEGENDS_LEAGUE_ID, club: LEGENDS_CLUB_ID,
    position: 'ST', rating: 94, rareflag: ICON_RAREFLAG, cardType: 'icon', gender: 1, baseClubs: [], firstSeen: NOW, lastSeen: NOW,
  });
  for (const r of s.rows) assert.equal(eligible(r, NOW, 'icons'), true);
});

test('iconRows is idempotent: once seeded, nothing new', () => {
  const first = iconRows(cat, names, new Set(), NOW);
  const again = iconRows(cat, names, new Set(first.rows.map((r) => r.assetId)), NOW + DAY);
  assert.equal(again.rows.length, 0);
  assert.equal(again.present, 3);
});

test('a synced special icon card for a seeded row keeps it (only lastSeen / gender move)', () => {
  const [seeded] = iconRows(cat, names, new Set(), NOW).rows;
  const ob: Observation = { assetId: 1397, rareflag: 160, rating: 97, nation: 18, league: LEGENDS_LEAGUE_ID, club: LEGENDS_CLUB_ID, position: 'CF', gender: 0 };
  const next = mergePlayer(seeded, ob, names[1397], NOW + DAY)!;
  assert.deepEqual(next, { ...seeded, lastSeen: NOW + DAY });
});
