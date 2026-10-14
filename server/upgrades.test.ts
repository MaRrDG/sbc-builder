import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ClubItem } from './ea.js';
import { withUpgrades } from './upgrades.js';

const base: ClubItem = {
  id: 1, assetId: 245770, resourceId: 245770, rating: 69, rareflag: 0, preferredPosition: 'ST', possiblePositions: ['ST'],
  teamid: 1, leagueId: 1, nation: 1, untradeable: true, itemState: 'free',
  attributeArray: [75, 69, 59, 74, 21, 70], skillmoves: 1, weakfootabilitytypecode: 3,
};

test('withUpgrades: no academyAttributes leaves the item as it is', () => {
  assert.equal(withUpgrades(base), base);
  assert.equal(withUpgrades({ ...base, academyAttributes: [] }).rating, 69);
});

test('withUpgrades: OVR, face stats, skill moves and weak foot win over the base (a real evolved striker)', () => {
  const up = withUpgrades({
    ...base,
    academyAttributes: [
      { id: 0, totalBonus: 0 }, { id: 1, totalBonus: 0 }, { id: 11, totalBonus: 83 }, { id: 12, totalBonus: 83 }, { id: 13, totalBonus: 83 },
      { id: 14, totalBonus: 77 }, { id: 15, totalBonus: 81 }, { id: 17, totalBonus: 72 }, { id: 37, totalBonus: 83 }, { id: 82, totalBonus: 3 },
      { id: 81, totalBonus: 4 },
    ],
  });
  assert.equal(up.rating, 83);
  assert.deepEqual(up.attributeArray, [83, 83, 77, 81, 21, 72]); // DEF (16) not upgraded: base kept
  assert.equal(up.skillmoves, 3); // 4 stars
  assert.equal(up.weakfootabilitytypecode, 4);
  assert.equal(up.rareflag, 0);
  assert.equal(base.rating, 69); // the input is not changed
});

test('withUpgrades: rarity, GK stats and added positions (base order kept, added ones last)', () => {
  const gk = withUpgrades({ ...base, attributeArray: [70, 70, 70, 70, 40, 70], academyAttributes: [{ id: 5, totalBonus: 80 }, { id: 10, totalBonus: 79 }, { id: 2, totalBonus: 66 }] });
  assert.deepEqual(gk.attributeArray, [80, 70, 70, 70, 40, 79]);
  assert.equal(gk.rareflag, 66);
  const pos = withUpgrades({ ...base, possiblePositions: ['CM', 'CAM'], academyAttributes: [{ id: 68, totalBonus: 1 }, { id: 73, totalBonus: 1 }] });
  assert.deepEqual(pos.possiblePositions, ['CM', 'CAM', 'ST']);
});

test('withUpgrades: malformed entries are ignored', () => {
  const up = withUpgrades({ ...base, academyAttributes: [null, { id: 11 }, { id: 'x', totalBonus: 90 }, { id: 11, totalBonus: 80 }] as never });
  assert.equal(up.rating, 80);
});
