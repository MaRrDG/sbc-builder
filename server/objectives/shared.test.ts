import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openGroups } from './open.js';
import { mergeGroups, nameAwards, stripPersonal, trimAward } from './shared.js';
import type { EaCategory, Names, ObjectiveGroupView } from './types.js';

// trimmed from a real relayed payload (Foundations 28, Seasonal 62, Campaigns 120)
const real = JSON.parse(readFileSync(new URL('./fixtures/real-categories.json', import.meta.url), 'utf8')) as EaCategory[];
const names: Names = { nation: { 34: 'Netherlands' }, league: { 10: 'Eredivisie' }, club: {}, rarity: {} };
const NOW = 1_791_454_527_913;

const o1798 = (c: EaCategory[]) => c.find((x) => x.name === 'Campaigns')!.groupsList[0].objectives.find((x) => x.objectiveId === 1798)!;

test('trimAward keeps only the reward fields the site reads', () => {
  assert.deepEqual(trimAward({ value: 1, awardType: 'item', itemDataReduced: { itemType: 'misc', description: 'Boost', isCollected: true } as never }),
    { value: 1, awardType: 'item', itemDataReduced: { itemType: 'misc', description: 'Boost' } });
  assert.deepEqual(trimAward({ value: 5, awardType: 'coin', itemDataReduced: null }), { value: 5, awardType: 'coin' });
});

test('stripPersonal keeps the catalogue and drops the account\'s own state', () => {
  const s = stripPersonal(real);
  const text = JSON.stringify(s);
  for (const k of ['"state"', '"currentProgress"', '"groupState"', '"timesCompleted"', '"objectivesCompletionCount"', '"isCollected"', '"attributeArray"', '"guidAssetId"'])
    assert.ok(!text.includes(k), k);
  // the real fixture does carry them, so the check above means something
  assert.ok(JSON.stringify(real).includes('"isCollected"'));
  const g = s.find((c) => c.name === 'Campaigns')!.groupsList[0];
  assert.equal(g.groupId, 120);
  assert.equal(g.title, 'Squad Foundations: Ringo Meerveld');
  assert.equal(g.startTime, 1791046800);
  assert.equal(g.endTime, 1791565199);
  assert.equal(g.awardsList[0].awardType, 'item');
  assert.deepEqual(g.awardsList[0], { value: 50596100, awardType: 'item', count: 1, untradeable: true,
    itemDataReduced: { itemType: 'player', assetId: 264452, rating: 83, preferredPosition: 'CAM' } });
  assert.deepEqual(o1798(s).awards[0], { value: o1798(real).awards[0].value, awardType: 'pack', count: 1, untradeable: true });
  const o = g.objectives.find((x) => x.objectiveId === 1798)!;
  assert.equal(o.name, 'The Dutch');
  assert.equal(o.multiplier, 6);
  assert.match(o.description, /Dutch player/);
  assert.equal(o.awards[0].awardType, 'pack');
  // the stripped catalogue reads as "nothing done yet"
  assert.ok(openGroups(s, NOW, names).every((x) => x.objectives.every((y) => !y.done && y.progress === 0)));
});

test('the account\'s own answer carries trimmed rewards too', () => {
  const text = JSON.stringify(openGroups(real, NOW, names));
  for (const k of ['"isCollected"', '"attributeArray"', '"guidAssetId"', '"resourceId"']) assert.ok(!text.includes(k), k);
});

test('stripPersonal survives odd shapes', () => {
  assert.deepEqual(stripPersonal(null as unknown as EaCategory[]), []);
  assert.deepEqual(stripPersonal([{ categoryId: 1, name: 'X' } as unknown as EaCategory]), [{ categoryId: 1, name: 'X', groupsList: [] }]);
});

const view = (id: number, progress: number, done = false): ObjectiveGroupView => ({
  id, title: `g${id}`, category: 'c', endsAt: null, awards: [], progressKnown: true,
  objectives: [{ id: id * 10, name: 'o', description: '', progress, target: 3, awards: [], conditions: [], done }],
});

test('mergeGroups: own groups win per id, shared-only ones are added with progress unknown', () => {
  const r = mergeGroups([view(1, 2), view(2, 3, true)], [view(1, 0), view(3, 0)]);
  assert.equal(r.source, 'own');
  assert.deepEqual(r.groups.map((g) => [g.id, g.progressKnown]), [[1, true], [2, true], [3, false]]);
  assert.equal(r.groups[0].objectives[0].progress, 2);
  assert.equal(r.groups[1].objectives[0].done, true);
  assert.deepEqual(r.groups[2].objectives.map((o) => [o.progress, o.done]), [[null, false]]);
});

test('mergeGroups: only the shared catalogue, only own, or neither', () => {
  const shared = mergeGroups(null, [view(3, 0)]);
  assert.equal(shared.source, 'shared');
  assert.deepEqual(shared.groups.map((g) => [g.id, g.progressKnown, g.objectives[0].progress]), [[3, false, null]]);
  const own = mergeGroups([view(1, 1)], null);
  assert.equal(own.source, 'own');
  assert.deepEqual(own.groups.map((g) => g.progressKnown), [true]);
  assert.deepEqual(mergeGroups(null, null), { source: null, groups: [] });
});

test('nameAwards puts the player name on player item rewards, leaves the rest alone', () => {
  const g = openGroups(real, NOW, names);
  const named = nameAwards(g, { 73885: { name: 'Ekitike' } });
  const total = named.find((x) => x.id === 28)!;
  assert.equal(total.awards[0].name, 'Ekitike');
  assert.equal(total.awards[1].name, undefined); // the pack
  // unknown asset: no name, nothing invented
  assert.equal(named.find((x) => x.id === 120)!.awards[0].name, undefined);
  // the input is not changed
  assert.equal(g.find((x) => x.id === 28)!.awards[0].name, undefined);
});
