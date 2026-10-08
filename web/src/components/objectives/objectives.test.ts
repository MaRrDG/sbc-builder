import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardText, conditionLabel, formationLabel, isStale, timeLeft, pickKey, resultKey } from './objectives.js';

const meta = { names: { nation: { 34: 'Netherlands' }, league: { 10: 'Eredivisie' }, club: {}, rarity: { 151: 'Ultimate Scream' } } };
const t = (k: string, p?: Record<string, unknown>) => `${k}${p ? JSON.stringify(p) : ''}`;

test('conditionLabel names role and filter with EA names', () => {
  assert.equal(conditionLabel({ role: 'score', min: 1, filter: { nation: [34] } }, meta, t), 'obj.role.score{"what":"Netherlands"}');
  assert.equal(conditionLabel({ role: 'xi', min: 2, filter: { league: [10] } }, meta, t), 'obj.role.xi{"what":"Eredivisie","count":2}');
  // xi always passes count, so t() picks the _one / _other form
  assert.equal(conditionLabel({ role: 'xi', min: 1, filter: { rarity: [151] } }, meta, t), 'obj.role.xi{"what":"Ultimate Scream","count":1}');
  assert.equal(conditionLabel({ role: 'assist', min: 1, filter: { position: 'CAM', preferredOnly: true } }, meta, t),
    'obj.role.assist{"what":"CAM (obj.preferredOnly)"}');
  assert.equal(conditionLabel({ role: 'score', min: 1, filter: { attr: { stat: 'PAC', min: 85 } } }, meta, t), 'obj.role.score{"what":"85+ PAC"}');
  assert.equal(conditionLabel({ role: 'score', min: 1, filter: { nation: [34, 99] } }, meta, t), 'obj.role.score{"what":"Netherlands / #99"}');
});

test('timeLeft in days and hours, null without an end or when over', () => {
  assert.deepEqual(timeLeft(1_000 + (33 * 3600 + 120) * 1000, 1_000), { days: 1, hours: 9 });
  assert.equal(timeLeft(null, 0), null);
  assert.equal(timeLeft(10, 20), null);
});

test('storage keys are per persona and keep the sbc- prefix', () => {
  assert.equal(pickKey(7), 'sbc-objectives-pick-7');
  assert.equal(resultKey(7), 'sbc-objectives-result-7');
});

test('formationLabel reads like the web app: dashes, variants numbered', () => {
  assert.equal(formationLabel('f433'), '4-3-3');
  assert.equal(formationLabel('f433a'), '4-3-3 (2)');
  assert.equal(formationLabel('f433c'), '4-3-3 (4)');
  assert.equal(formationLabel('f41212'), '4-1-2-1-2');
  assert.equal(formationLabel('weird'), 'weird');
});

test('awardText uses EA text as sent, else value + awardType', () => {
  assert.equal(awardText({ value: 1, awardType: 'item', itemDataReduced: { description: 'Meerveld Player Item' } }), 'Meerveld Player Item');
  assert.equal(awardText({ value: 500, awardType: 'coins' }), '500 coins');
  assert.equal(awardText({ value: 1, awardType: 'pack', itemDataReduced: { description: '  ' } }), '1 pack');
  assert.equal(awardText({ value: 1, awardType: 'pack', itemDataReduced: null }), '1 pack');
});

test('isStale compares the last solve with the current ticks and formation', () => {
  assert.equal(isStale({ picked: [2, 1], formation: 'f433' }, [1, 2], 'f433'), false);
  assert.equal(isStale({ picked: [1], formation: 'f433' }, [1, 2], 'f433'), true);
  assert.equal(isStale({ picked: [1, 2], formation: 'f433' }, [1, 2], 'f442'), true);
  // a save from before picks were stored: unknown, so no hint
  assert.equal(isStale({ formation: 'f433' }, [1], 'f433'), false);
});
