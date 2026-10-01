import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFullList, parseAcademy } from './evos.js';

const NOW = 1790853100; // 2 min after the observed start
const objective = (o: Record<string, unknown>) => ({ objectiveId: 1, name: 'Send your Player to Training Camp.', multiplier: 43200, ...o });
const slot = (levels: unknown[], extra: Record<string, unknown> = {}) => ({
  id: 2736, slotName: 'Trust the Keeper', endTime: 1792256400, timed: true, realPlayerId: 943569136395,
  player: { id: 943569136395, assetId: 86320, rating: 54, itemType: 'player' }, levels, ...extra,
});
const running = slot([
  { level: 0, levelState: 'COMPLETED' },
  { level: 1, levelState: 'COMPLETED', objectives: [objective({ state: 'COMPLETED', currentProgress: 43200 })] },
  { level: 2, levelState: 'IN_PROGRESS', objectives: [objective({ state: 'IN_PROGRESS', currentProgress: 1790852979 })] },
]);
const readyFirst = slot([
  { level: 0, levelState: 'COMPLETED' },
  { level: 1, levelState: 'IN_PROGRESS', objectives: [objective({ state: 'COMPLETED', currentProgress: 43200 })] },
  { level: 2, levelState: 'NOT_STARTED', objectives: [objective({})] },
]);

test('running training: start + duration, in unix seconds', () => {
  const [t] = parseAcademy({ slots: [running] }, NOW);
  assert.deepEqual(
    { slotId: t.slotId, level: t.level, levelCount: t.levelCount, startedAt: t.startedAt, endsAt: t.endsAt, ready: t.ready, itemId: t.itemId },
    { slotId: 2736, level: 2, levelCount: 2, startedAt: 1790852979, endsAt: 1790852979 + 43200, ready: false, itemId: 943569136395 },
  );
  assert.equal(t.slotName, 'Trust the Keeper');
  assert.equal((t.player as { assetId: number }).assetId, 86320);
});

test('ready row (seen only after it finished) has no times', () => {
  const list = parseAcademy({ slots: [readyFirst], rewardReadySlotIds: [2736] }, NOW);
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].level, list[0].ready, list[0].startedAt, list[0].endsAt], [1, true, null, null]);
});

test('untimed slots are ignored', () => {
  assert.deepEqual(parseAcademy({ slots: [{ ...running, timed: false }] }, NOW), []);
});

test('sanity: future start, counters, long durations, past slot end', () => {
  const lvl = (o: Record<string, unknown>) => slot([{ level: 1, levelState: 'IN_PROGRESS', objectives: [objective({ state: 'IN_PROGRESS', ...o })] }]);
  assert.deepEqual(parseAcademy({ slots: [lvl({ currentProgress: NOW + 301 })] }, NOW), []); // > 5 min in the future
  assert.equal(parseAcademy({ slots: [lvl({ currentProgress: NOW + 299 })] }, NOW).length, 1); // small clock skew is fine
  assert.deepEqual(parseAcademy({ slots: [lvl({ currentProgress: 3000 })] }, NOW), []); // a counter, not a time
  assert.deepEqual(parseAcademy({ slots: [lvl({ currentProgress: NOW, multiplier: 8 * 86400 })] }, NOW), []); // > 7 days
  assert.deepEqual(parseAcademy({ slots: [lvl({ currentProgress: NOW, multiplier: 0 })] }, NOW), []);
  assert.deepEqual(parseAcademy({ slots: [{ ...lvl({ currentProgress: NOW }), endTime: NOW + 60 }] }, NOW), []); // ends after the evolution
});

test('unknown shapes never throw', () => {
  for (const r of [null, 1, 'x', {}, { slots: 'no' }, { slots: [null, 1, { levels: 'x' }] }]) assert.deepEqual(parseAcademy(r, NOW), []);
});

test('isFullList: only the unfiltered first page of started slots', () => {
  const q = 'offset=0&count=20&sortOrder=asc&slotStatus=STARTED';
  assert.equal(isFullList('/academy/hub/v2', q, 1), true);
  assert.equal(isFullList('/academy/hub/v2', q, 20), false); // a full page: there may be more
  assert.equal(isFullList('/academy/hub/v2', q.replace('offset=0', 'offset=20'), 1), false);
  assert.equal(isFullList('/academy/hub/v2', 'offset=0&count=20', 1), false);
  assert.equal(isFullList('/academy/slot/2736/claim', q, 1), false);
  assert.equal(isFullList('/academy/hub/v2', q + '&status=x', 1), false); // an extra filter: not the full list
});

const level = (objectives: unknown[], lv = 2) => ({ level: lv, levelState: 'IN_PROGRESS', objectives });
const counter = (state: string, extra: Record<string, unknown> = {}) => objective({ multiplier: 5, state, currentProgress: 2, ...extra });

test('a counter objective before the timer does not hide the running timer', () => {
  const s = slot([level([counter('IN_PROGRESS'), objective({ state: 'IN_PROGRESS', currentProgress: 1790852979 })])]);
  const [t] = parseAcademy({ slots: [s] }, NOW);
  assert.deepEqual([t.ready, t.startedAt, t.endsAt], [false, 1790852979, 1790852979 + 43200]);
});

test('completed counter with a running timer is running, not ready', () => {
  const s = slot([level([counter('COMPLETED', { currentProgress: 5 }), objective({ state: 'IN_PROGRESS', currentProgress: 1790852979 })])]);
  const list = parseAcademy({ slots: [s] }, NOW);
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].ready, list[0].endsAt], [false, 1790852979 + 43200]);
});

test('completed counter + timer without state, slot not reward-ready: no row', () => {
  const s = slot([level([counter('COMPLETED', { currentProgress: 5 }), objective({})])]);
  assert.deepEqual(parseAcademy({ slots: [s] }, NOW), []);
});
