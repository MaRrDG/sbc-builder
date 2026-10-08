import { test } from 'node:test';
import assert from 'node:assert/strict';
import { awardText, conditionLabel, doneKey, loansKey, formationKey, pruneManual, formationLabel, isStale, settingsSummary, timeLeft, pickKey, radioMove, reachableStep, resultKey, splitGroups, objectiveCoverage, dropUncovered } from './objectives.js';

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
  // a far-off end (Foundations end in years) is not a countdown worth showing
  assert.deepEqual(timeLeft(365 * 86_400_000, 0), { days: 365, hours: 0 });
  assert.equal(timeLeft(365 * 86_400_000 + 3_600_000, 0), null);
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

test('awardText on the real reward shapes: player names, counts, no raw ids or types', () => {
  const tt = (k: string, p?: Record<string, unknown>) => `${k}${p ? JSON.stringify(p) : ''}`;
  const player = { value: 50405533, awardType: 'item', count: 1, untradeable: true, name: 'Ekitike',
    itemDataReduced: { assetId: 73885, rating: 82, itemType: 'player', preferredPosition: 'ST' } };
  assert.equal(awardText(player, tt), 'Ekitike 82 ST');
  // a player we cannot name still reads as a player item, never as the resource id
  assert.equal(awardText({ ...player, name: undefined }, tt), 'obj.award.player{"what":"82 ST"}');
  // only the fields that are there; nothing at all reads as a generic item
  assert.equal(awardText({ ...player, itemDataReduced: { itemType: 'player', assetId: 1, rating: 82 } }, tt), 'Ekitike 82');
  assert.equal(awardText({ value: 1, awardType: 'item', itemDataReduced: { itemType: 'player' } }, tt), 'obj.award.item');
  // more than one
  assert.equal(awardText({ ...player, count: 2 }, tt), '2 × Ekitike 82 ST');
  assert.equal(awardText({ value: 1, awardType: 'item', count: 3, itemDataReduced: { itemType: 'training' } }, tt), '3 × obj.award.item');
  // other items: EA's own wording when it is a readable text, else a generic item
  assert.equal(awardText({ value: 1, awardType: 'item', itemDataReduced: { itemType: 'misc', rating: 99, description: '1 of 2 78+ Gold Player Pick' } }, tt), '1 of 2 78+ Gold Player Pick');
  assert.equal(awardText({ value: 1, awardType: 'item', itemDataReduced: { itemType: 'misc', rating: 99, description: 'AcademySlotEVO' } }, tt), 'obj.award.item');
  assert.equal(awardText({ value: 1, awardType: 'item', itemDataReduced: { itemType: 'training', rating: 95 } }, tt), 'obj.award.item');
  assert.equal(awardText({ value: 304, awardType: 'pack', count: 1 }, tt), 'obj.award.pack{"count":1}');
  assert.equal(awardText({ value: 304, awardType: 'pack', count: 3 }, tt), 'obj.award.pack{"count":3}');
  assert.equal(awardText({ value: 200, awardType: 'coin', count: 1 }, tt), 'obj.award.coin{"count":200}');
  assert.equal(awardText({ value: 100, awardType: 'xp', count: 1 }, tt), 'obj.award.xp{"count":100}');
  assert.equal(awardText({ value: 5, awardType: 'event_token_1', count: 1 }, tt), 'obj.award.tokens{"count":5}');
  assert.equal(awardText({ value: 25, awardType: 'event_token_2', count: 1 }, tt), 'obj.award.tokens{"count":25}');
  assert.equal(awardText({ value: 100, awardType: 'champions_qualification_points', count: 1 }, tt), 'obj.award.champions{"count":100}');
  assert.equal(awardText({ value: 1, awardType: 'graduated_access_transfer_market_entry', count: 1 }, tt), 'obj.award.market');
  // unknown types are hidden, not shown raw
  assert.equal(awardText({ value: 7, awardType: 'something_new' }, tt), null);
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
  // the solver settings count too (excluded players in any order, max OVR); older saves are not judged on them
  const last = { picked: [1], formation: 'f433', loans: false, excludeIds: [5, 3], maxRating: 88 };
  assert.equal(isStale(last, [1], 'f433', false, { excludeIds: [3, 5], maxRating: 88 }), false);
  assert.equal(isStale(last, [1], 'f433', false, { excludeIds: [3], maxRating: 88 }), true);
  assert.equal(isStale(last, [1], 'f433', false, { excludeIds: [3, 5], maxRating: 99 }), true);
  assert.equal(isStale({ picked: [1], formation: 'f433' }, [1], 'f433', false, { excludeIds: [3], maxRating: 80 }), false);
});

test('settingsSummary: what the solver settings take out, null when nothing', () => {
  assert.equal(settingsSummary([], 99), null);
  assert.deepEqual(settingsSummary([1, 2], 99), { excluded: 2, maxRating: null });
  assert.deepEqual(settingsSummary([], 85), { excluded: 0, maxRating: 85 });
});

test('reachableStep: deep links fall back to the earliest incomplete step', () => {
  assert.equal(reachableStep('pick', 0, false), 'pick');
  assert.equal(reachableStep('formation', 0, false), 'pick');
  assert.equal(reachableStep('formation', 2, false), 'formation');
  assert.equal(reachableStep('squad', 0, true), 'pick');
  assert.equal(reachableStep('squad', 2, false), 'formation');
  assert.equal(reachableStep('squad', 2, true), 'squad');
});

test('splitGroups: tickable open objectives per group; EA-done ones gone, marked-by-you ones apart, the rest folded away', () => {
  const o = (id: number, can: boolean, done = false) => ({ id, name: `o${id}`, description: '', progress: 0, target: 1, awards: [], done,
    conditions: can ? [{ role: 'score' as const, min: 1, filter: { nation: [1] } }] : [] });
  const g = (id: number, objectives: ReturnType<typeof o>[]) => ({ id, title: `g${id}`, category: 'c', endsAt: null, awards: [], objectives, progressKnown: true });
  const groups = [
    g(1, [o(1, true), o(2, false), o(6, true, true)]),
    g(2, [o(3, false), o(4, false)]),
    g(3, [o(5, true)]), // only a marked-by-you one left: stays, just for Undo
    g(4, [o(7, true, true), o(8, false, true)]), // all done in EA: gone
    g(5, [o(9, false), o(10, true, true)]), // EA-done + no condition: only in the folded block
  ];
  const { squad, other, otherCount } = splitGroups(groups, [5]);
  assert.deepEqual(squad.map((x) => [x.id, x.objectives.map((y) => y.id), x.marked.map((y) => y.id)]), [[1, [1], []], [3, [], [5]]]);
  assert.deepEqual(other.map((x) => [x.id, x.objectives.map((y) => y.id)]), [[1, [2]], [2, [3, 4]], [5, [9]]]);
  assert.equal(otherCount, 4);
  // without manual marks
  assert.deepEqual(splitGroups(groups).squad.map((x) => x.id), [1, 3]);
  // a mark on something EA already calls done changes nothing
  assert.deepEqual(splitGroups(groups, [7]).squad.map((x) => x.id), [1, 3]);
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

test('objectiveCoverage: one entry per objective in order, covered only when every condition is met', () => {
  const cov = (objectiveId: number, met: boolean) => ({ objectiveId, met });
  assert.deepEqual(objectiveCoverage([cov(5, true), cov(3, true), cov(3, false), cov(9, true)]), [
    { objectiveId: 5, met: true },
    { objectiveId: 3, met: false },
    { objectiveId: 9, met: true },
  ]);
  assert.deepEqual(objectiveCoverage([]), []);
});

test('dropUncovered: unticks the objectives the squad does not cover, keeps the rest in order', () => {
  const coverage = [{ objectiveId: 5, met: true }, { objectiveId: 3, met: false }];
  assert.deepEqual(dropUncovered([3, 7, 5], coverage), [7, 5]);
  assert.deepEqual(dropUncovered([7], []), [7]);
});
