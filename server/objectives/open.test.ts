import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openGroups, solvable } from './open.js';
import type { EaCategory, EaObjective, Names } from './types.js';

const names: Names = { nation: { 34: 'Netherlands' }, league: { 10: 'Eredivisie' }, club: {}, rarity: {} };
const NOW = 1_791_000_000_000; // ms
const sec = (ms: number) => Math.floor(ms / 1000);
const obj = (id: number, description: string, state?: string): EaObjective => ({
  objectiveId: id, name: `O${id}`, description, state, currentProgress: 1, multiplier: 6, awards: [],
});
const cats = (endTime: number, objectives: EaObjective[]): EaCategory[] => [
  { categoryId: 5, name: 'Campaigns', groupsList: [{ groupId: 120, title: 'Squad Foundations', startTime: sec(NOW) - 100, endTime, awardsList: [], objectives }] },
];

test('keeps the objectives of active groups, with conditions, progress and a done flag', () => {
  const g = openGroups(cats(sec(NOW) + 3600, [
    obj(1798, 'Score 6 goals using a Dutch player in any FUT game mode.', 'IN_PROGRESS'),
    obj(1797, 'Win 4 matches while having min. 1 Dutch player in your starting 11.', 'REDEEMED'),
    obj(1, 'Play 15 Draft matches.'),
  ]), NOW, names);
  assert.equal(g.length, 1);
  assert.equal(g[0].category, 'Campaigns');
  assert.equal(g[0].endsAt, (sec(NOW) + 3600) * 1000);
  // redeemed objectives stay, marked done (the site shows them as done, not tickable)
  assert.deepEqual(g[0].objectives.map((o) => [o.id, o.done]), [[1798, false], [1797, true], [1, false]]);
  assert.deepEqual(g[0].objectives[0].conditions, [{ role: 'score', min: 1, filter: { nation: [34] } }]);
  assert.equal(g[0].objectives[0].progress, 1);
  assert.equal(g[0].objectives[0].target, 6);
  assert.deepEqual(g[0].objectives[2].conditions, []);
});

test('drops ended groups, not-yet-started groups and empty groups; an all-done group stays', () => {
  assert.deepEqual(openGroups(cats(sec(NOW) - 1, [obj(1, 'Play 1 match.')]), NOW, names), []);
  const future: EaCategory[] = [{ categoryId: 1, name: 'X', groupsList: [{ groupId: 1, title: 'T', startTime: sec(NOW) + 60, endTime: 0, awardsList: [], objectives: [obj(1, 'x')] }] }];
  assert.deepEqual(openGroups(future, NOW, names), []);
  assert.deepEqual(openGroups(cats(0, []), NOW, names), []);
  assert.deepEqual(openGroups(cats(0, [obj(1, 'x', 'REDEEMED')]), NOW, names)[0].objectives.map((o) => o.done), [true]);
});

test('endTime 0 means no end', () => {
  const g = openGroups(cats(0, [obj(1, 'Play 1 match.')]), NOW, names);
  assert.equal(g[0].endsAt, null);
});

test('missing progress counts as 0', () => {
  const o = { ...obj(1, 'x'), currentProgress: undefined };
  assert.equal(openGroups(cats(0, [o]), NOW, names)[0].objectives[0].progress, 0);
});

test('done: COMPLETED or REDEEMED, or progress at / past the target', () => {
  const done = (o: EaObjective) => openGroups(cats(0, [o]), NOW, names)[0].objectives[0].done;
  assert.equal(done(obj(1, 'x', 'IN_PROGRESS')), false);
  assert.equal(done(obj(1, 'x')), false);
  assert.equal(done(obj(1, 'x', 'COMPLETED')), true);
  assert.equal(done(obj(1, 'x', 'REDEEMED')), true);
  assert.equal(done({ ...obj(1, 'x', 'IN_PROGRESS'), currentProgress: 6 }), true);
  assert.equal(done({ ...obj(1, 'x', 'IN_PROGRESS'), currentProgress: 7 }), true);
});

test('odd EA shapes: a broken objective or group is skipped or gets no conditions, never a throw', () => {
  const good = obj(1798, 'Score 6 goals using a Dutch player in any FUT game mode.', 'IN_PROGRESS');
  const odd = [
    null,
    { ...good, objectiveId: 2, description: null },
    { ...good, objectiveId: 3, description: 42, awards: 'x' },
    { ...good, objectiveId: 'x' },
    good,
  ] as unknown as EaObjective[];
  const g = openGroups(cats(0, odd), NOW, names);
  // no id: skipped; no text: kept with no conditions (not solvable); awards not a list: none
  assert.deepEqual(g[0].objectives.map((o) => [o.id, o.conditions.length, o.description]), [[2, 0, ''], [3, 0, ''], [1798, 1, good.description]]);
  assert.deepEqual(g[0].objectives[1].awards, []);
  // groups: missing / non-list objectives, null group, groupsList not a list, null category
  const broken = [
    null,
    { categoryId: 1, name: 'A', groupsList: 'x' },
    { categoryId: 2, name: 'B', groupsList: [null, { groupId: 7, title: 'T', startTime: 0, endTime: 0, awardsList: null, objectives: { a: 1 } }] },
    ...cats(0, [good]),
  ] as unknown as EaCategory[];
  const h = openGroups(broken, NOW, names);
  assert.deepEqual(h.map((x) => x.id), [120]);
  // a group with a bad awardsList still shows, without group awards
  const noAwards = [{ categoryId: 3, name: 'C', groupsList: [{ groupId: 8, title: 'T', startTime: 0, endTime: 0, awardsList: null, objectives: [good] }] }] as unknown as EaCategory[];
  assert.deepEqual(openGroups(noAwards, NOW, names)[0].awards, []);
});

test('solvable: only open objectives with a squad condition', () => {
  const cond = [{ role: 'score' as const, min: 1, filter: { nation: [34] } }];
  assert.equal(solvable({ done: false, conditions: cond }), true);
  assert.equal(solvable({ done: true, conditions: cond }), false);
  assert.equal(solvable({ done: false, conditions: [] }), false);
});
