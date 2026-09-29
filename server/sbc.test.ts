import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EligibilityReq } from './ea.js';
import type { Meta } from './meta.js';
import { Key, parseRequirements } from './sbc.js';

const meta = { names: { nation: {}, league: {}, club: {}, rarity: {}, group: {} } } as unknown as Meta;
const ovrMin45: EligibilityReq[] = [
  { type: 'PLAYER_ATTRIBUTE', eligibilitySlot: 1, eligibilityKey: 41, eligibilityValue: 1 },
  { type: 'SCOPE', eligibilitySlot: 1, eligibilityKey: 13, eligibilityValue: 0 },
  { type: 'ACADEMY_PLAYER_SLOTTING', eligibilitySlot: 1, eligibilityKey: 40, eligibilityValue: 45 },
];

test('attribute requirement is one per-card requirement, worded like the web app', () => {
  const [r] = parseRequirements(ovrMin45, meta);
  assert.equal(r.combined, false);
  assert.equal(r.count, -1);
  assert.deepEqual(r.keys.get(Key.ATTRIBUTE_ID), [1]);
  assert.deepEqual(r.keys.get(Key.ATTRIBUTE_VALUE), [45]);
  assert.equal(r.text, 'OVR Min: 45');
});

test('unknown attribute id still gets readable text', () => {
  const [r] = parseRequirements(ovrMin45.map((e) => (e.eligibilityKey === 41 ? { ...e, eligibilityValue: 999 } : e)), meta);
  assert.equal(r.text, 'Attribute 999 Min: 45');
});

test('missing value and out-of-range scope keep the text clean', () => {
  const noValue = parseRequirements(ovrMin45.filter((e) => e.eligibilityKey !== 40), meta)[0];
  assert.equal(noValue.text, 'OVR Min: ?');
  const odd = parseRequirements(ovrMin45.map((e) => (e.eligibilityKey === 13 ? { ...e, eligibilityValue: 7 } : e)), meta)[0];
  assert.equal(odd.text, 'OVR: 45');
});
