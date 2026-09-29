import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EligibilityReq } from './ea.js';
import type { Meta } from './meta.js';
import { parseRequirements } from './sbc.js';
import type { Player } from './squad.js';
import { cardRule, checkPoints, isPointsChallenge, pointsTarget, usablePoints } from './points.js';

const meta = { names: { nation: {}, league: {}, club: {}, rarity: {}, group: {} } } as unknown as Meta;
const req = (list: [number, number][]) =>
  parseRequirements(list.map(([k, v]) => ({ type: 'X', eligibilitySlot: 1, eligibilityKey: k, eligibilityValue: v }) as EligibilityReq), meta);
const OVR_MIN_45 = req([[41, 1], [13, 0], [40, 45]]);
let nextId = 1;
const card = (rating: number, points: number, extra: Partial<Player> = {}) =>
  ({ id: nextId++, assetId: nextId, rating, points, tier: rating <= 64 ? 1 : rating <= 74 ? 2 : 3, untradeable: false, ...extra }) as Player;

test('target is what is still missing', () => {
  assert.equal(isPointsChallenge({ scoreRequirement: 4000 }), true);
  assert.equal(isPointsChallenge({}), false);
  assert.equal(pointsTarget({ scoreRequirement: 4000, submittedScore: 1200 }), 2800);
  assert.equal(pointsTarget({ scoreRequirement: 4000 }), 4000);
  assert.equal(pointsTarget({ scoreRequirement: 4000, submittedScore: 4100 }), 0);
});

test('attribute rule: OVR Min 45', () => {
  const rule = cardRule(OVR_MIN_45[0])!;
  assert.equal(rule(card(45, 20)), true);
  assert.equal(rule(card(44, 20)), false);
});

test('unknown requirements cannot be checked', () => {
  assert.equal(cardRule(req([[41, 999], [13, 0], [40, 45]])[0]), null); // unknown attribute
  assert.equal(cardRule(req([[77, 1]])[0]), null); // unknown key
  assert.equal(cardRule(req([[2, 3], [18, 1]])[0]), null); // count requirement: not a per-card rule
});

test('exact total meets', () => {
  const r = checkPoints([card(52, 20), card(60, 20), card(85, 2100), card(86, 1860)], 4000, OVR_MIN_45);
  assert.deepEqual([r.total, r.overshoot, r.allMet], [4000, 0, true]);
});

test('over is fine, under is not', () => {
  assert.deepEqual(
    (({ total, overshoot, allMet }) => [total, overshoot, allMet])(checkPoints([card(86, 4100)], 4000, OVR_MIN_45)),
    [4100, 100, true],
  );
  assert.equal(checkPoints([card(85, 2100)], 4000, OVR_MIN_45).allMet, false);
});

test('a card that breaks a requirement, a duplicate, a zero-point card or an unknown requirement blocks found', () => {
  assert.equal(checkPoints([card(40, 4000)], 4000, OVR_MIN_45).allMet, false);
  const c = card(86, 2000);
  assert.equal(checkPoints([c, c], 4000, OVR_MIN_45).allMet, false);
  assert.equal(checkPoints([card(86, 4100), card(50, 0)], 4000, OVR_MIN_45).allMet, false);
  const unknown = checkPoints([card(86, 4100)], 4000, req([[77, 1]]));
  assert.equal(unknown.allMet, false);
  assert.equal(unknown.results[0].unchecked, true);
});

test('nothing to reach is never found', () => {
  assert.equal(checkPoints([], 0, OVR_MIN_45).allMet, false);
});

test('usablePoints counts one card per assetId', () => {
  const a = card(80, 2100, { assetId: 7 });
  const dup = card(80, 2100, { assetId: 7, inStorage: true } as Partial<Player>);
  const b = card(70, 500, { assetId: 8 });
  assert.equal(usablePoints([a, dup, b]), 2600);
  assert.equal(usablePoints([]), 0);
});
