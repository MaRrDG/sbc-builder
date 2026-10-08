import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openGroups } from './open.js';
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

test('keeps open objectives of active groups, with conditions and progress', () => {
  const g = openGroups(cats(sec(NOW) + 3600, [
    obj(1798, 'Score 6 goals using a Dutch player in any FUT game mode.', 'IN_PROGRESS'),
    obj(1797, 'Win 4 matches while having min. 1 Dutch player in your starting 11.', 'REDEEMED'),
    obj(1, 'Play 15 Draft matches.'),
  ]), NOW, names);
  assert.equal(g.length, 1);
  assert.equal(g[0].category, 'Campaigns');
  assert.equal(g[0].endsAt, (sec(NOW) + 3600) * 1000);
  assert.deepEqual(g[0].objectives.map((o) => o.id), [1798, 1]);
  assert.deepEqual(g[0].objectives[0].conditions, [{ role: 'score', min: 1, filter: { nation: [34] } }]);
  assert.equal(g[0].objectives[0].progress, 1);
  assert.equal(g[0].objectives[0].target, 6);
  assert.deepEqual(g[0].objectives[1].conditions, []);
});

test('drops ended groups, not-yet-started groups and groups with nothing open', () => {
  assert.deepEqual(openGroups(cats(sec(NOW) - 1, [obj(1, 'Play 1 match.')]), NOW, names), []);
  const future: EaCategory[] = [{ categoryId: 1, name: 'X', groupsList: [{ groupId: 1, title: 'T', startTime: sec(NOW) + 60, endTime: 0, awardsList: [], objectives: [obj(1, 'x')] }] }];
  assert.deepEqual(openGroups(future, NOW, names), []);
  assert.deepEqual(openGroups(cats(0, [obj(1, 'x', 'REDEEMED')]), NOW, names), []);
});

test('endTime 0 means no end', () => {
  const g = openGroups(cats(0, [obj(1, 'Play 1 match.')]), NOW, names);
  assert.equal(g[0].endsAt, null);
});

test('missing progress counts as 0', () => {
  const o = { ...obj(1, 'x'), currentProgress: undefined };
  assert.equal(openGroups(cats(0, [o]), NOW, names)[0].objectives[0].progress, 0);
});
