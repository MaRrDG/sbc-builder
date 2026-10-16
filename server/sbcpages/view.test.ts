import { test } from 'node:test';
import assert from 'node:assert/strict';
import { listItem, setView, sortList } from './view.js';
import type { Meta } from '../meta.js';

const NOW = 1_800_000_000;
const meta = { names: { nation: { 42: 'Brazil' }, league: {}, club: {}, rarity: {}, group: {} } } as unknown as Meta;
const set = { setId: 16, name: 'Marquee Matchups', description: 'Four matches', categoryId: 2, repeatabilityMode: 'REFRESH', endTime: NOW + 3600, lastSeen: new Date(), raw: { repeats: 1, repeatRefreshInterval: 86400, awards: [{ type: 'pack', value: 509, count: 1, isUntradeable: true }] } };
const ch = { challengeId: 1, setId: 16, name: 'Brazil v Spain', formation: 'f433', elgOperation: 'AND', raw: { awards: [{ type: 'coin', value: 500 }] },
  elgReq: [{ type: 'PLAYER_COUNT', eligibilityKey: 2, eligibilitySlot: 1, eligibilityValue: 1 }, { type: 'SCOPE', eligibilityKey: 13, eligibilitySlot: 1, eligibilityValue: 0 }, { type: 'NATION_ID', eligibilityKey: 10, eligibilitySlot: 1, eligibilityValue: 42 }] };

test('set view', () => {
  const v = setView(set, [ch], meta, null, NOW);
  assert.equal(v.path, '/sbcs/marquee-matchups-16');
  assert.equal(v.repeatability, 'refresh');
  assert.equal(v.refreshHours, 24);
  assert.deepEqual(v.rewards, ['Pack (untradeable)']);
  assert.equal(v.challenges[0].requirements.length, 1);
  assert.match(v.challenges[0].requirements[0], /Brazil/);
  assert.deepEqual(v.challenges[0].rewards, ['500 coins']);
  assert.equal(v.expired, false);
});

test('malformed relayed JSON fails closed', () => {
  const bad = { ...set, raw: { awards: 'x', repeats: 'many', repeatRefreshInterval: 'soon', challengesCount: 'n' } };
  const v = setView(bad, [{ ...ch, elgReq: 'nope' as never, raw: { awards: {} } }], meta, null, NOW);
  assert.deepEqual(v.rewards, []);
  assert.equal(v.repeats, null);
  assert.equal(v.refreshHours, null);
  assert.deepEqual(v.challenges[0].requirements, []);
  assert.deepEqual(v.challenges[0].rewards, []);
  assert.equal(listItem(bad, NOW).challenges, 0);
});

test('list order: active soonest-ending first, then expired newest first', () => {
  const mk = (id: number, endTime: number | null) => listItem({ ...set, setId: id, endTime }, NOW);
  const ids = sortList([mk(1, NOW - 10), mk(2, null), mk(3, NOW + 50), mk(4, NOW - 5), mk(5, NOW + 10)]).map((x) => x.id);
  assert.deepEqual(ids, [5, 3, 2, 4, 1]);
});
