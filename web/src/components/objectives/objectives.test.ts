import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardText, conditionLabel, doneKey, loansKey, formationKey, pruneManual, formationLabel, isStale, timeLeft, pickKey, radioMove, reachableStep, resultKey, splitGroups } from './objectives.js';

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
  assert.equal(formationKey(7), 'sbc-objectives-formation-7');
  assert.equal(doneKey(7), 'sbc-objectives-done-7');
  assert.equal(loansKey(7), 'sbc-objectives-loans-7');
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
  // the loan setting counts too; saves from before it was stored are not judged on it
  assert.equal(isStale({ picked: [1], formation: 'f433', loans: false }, [1], 'f433', true), true);
  assert.equal(isStale({ picked: [1], formation: 'f433', loans: true }, [1], 'f433', true), false);
  assert.equal(isStale({ picked: [1], formation: 'f433', loans: false }, [1], 'f433'), false);
  assert.equal(isStale({ picked: [1], formation: 'f433' }, [1], 'f433', true), false);
});

test('reachableStep: deep links fall back to the earliest incomplete step', () => {
  assert.equal(reachableStep('pick', 0, false), 'pick');
  assert.equal(reachableStep('formation', 0, false), 'pick');
  assert.equal(reachableStep('formation', 2, false), 'formation');
  assert.equal(reachableStep('squad', 0, true), 'pick');
  assert.equal(reachableStep('squad', 2, false), 'formation');
  assert.equal(reachableStep('squad', 2, true), 'squad');
});

test('splitGroups: tickable open objectives per group, done ones (EA or marked by you) apart, the rest folded away', () => {
  const o = (id: number, can: boolean, done = false) => ({ id, name: `o${id}`, description: '', progress: 0, target: 1, awards: [], done,
    conditions: can ? [{ role: 'score' as const, min: 1, filter: { nation: [1] } }] : [] });
  const g = (id: number, objectives: ReturnType<typeof o>[]) => ({ id, title: `g${id}`, category: 'c', endsAt: null, awards: [], objectives });
  const groups = [
    g(1, [o(1, true), o(2, false), o(6, true, true)]),
    g(2, [o(3, false), o(4, false)]),
    g(3, [o(5, true)]),
    g(4, [o(7, true, true), o(8, false, true)]), // all done: stays, only done ones
  ];
  const { squad, other, otherCount } = splitGroups(groups, [5]);
  assert.deepEqual(squad.map((x) => [x.id, x.objectives.map((y) => y.id), x.done.map((y) => y.id)]), [[1, [1], [6]], [3, [], [5]], [4, [], [7, 8]]]);
  assert.deepEqual(other.map((x) => [x.id, x.objectives.map((y) => y.id)]), [[1, [2]], [2, [3, 4]]]);
  assert.equal(otherCount, 3);
  // without manual marks
  assert.deepEqual(splitGroups(groups).squad.map((x) => x.id), [1, 3, 4]);
});

test('pruneManual drops ids EA now reports done and ids that are gone', () => {
  const o = (id: number, done: boolean) => ({ id, name: '', description: '', progress: 0, target: 1, awards: [], done, conditions: [] });
  const groups = [{ id: 1, title: '', category: '', endsAt: null, awards: [], objectives: [o(1, false), o(2, true), o(3, false)] }];
  assert.deepEqual(pruneManual([1, 2, 3, 9], groups), [1, 3]);
  assert.deepEqual(pruneManual([], groups), []);
});

test('radioMove: arrows move and wrap, Home / End jump, other keys do nothing', () => {
  assert.equal(radioMove(0, 'ArrowRight', 5), 1);
  assert.equal(radioMove(0, 'ArrowDown', 5), 1);
  assert.equal(radioMove(4, 'ArrowRight', 5), 0);
  assert.equal(radioMove(0, 'ArrowLeft', 5), 4);
  assert.equal(radioMove(2, 'ArrowUp', 5), 1);
  assert.equal(radioMove(3, 'Home', 5), 0);
  assert.equal(radioMove(1, 'End', 5), 4);
  assert.equal(radioMove(1, 'a', 5), null);
  assert.equal(radioMove(0, 'ArrowRight', 0), null);
});
