import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loanMatches } from '../squad.js';
import { matchesFilter, roleSlots, playPool, checkCovers, diagnosePlay, buildPlayProblem } from './play.js';
import type { Player } from '../squad.js';
import type { Condition } from './types.js';
import { POSITION_IDS } from '../meta.js';

let n = 1;
const pl = (p: Partial<Player> = {}): Player => ({
  id: n++, assetId: n * 10, resourceId: n * 10, name: `P${n}`, rating: 80, points: 0, rareflag: 1, tier: 3,
  positions: [POSITION_IDS.ST], preferredPosition: 'ST', possiblePositions: ['ST'], club: 1, league: 13, nation: 14,
  untradeable: true, firstOwner: true, groups: [], state: 'free', isLoan: false, minPrice: 0, fullName: 'P', rarityName: 'Rare',
  attributes: [80, 80, 80, 80, 40, 70], skillMoves: 3, weakFoot: 3, foot: 'Right', ...p,
});
// 4-3-3 slot types as meta has them: GK RB RCB LCB LB RCM CM LCM RW ST LW
const F433 = [0, 3, 5, 5, 7, 14, 14, 14, 23, 25, 27];
const c = (role: Condition['role'], filter: Condition['filter'], min = 1): Condition => ({ role, filter, min });

test('matchesFilter: nation, league, rarity, positions, attributes', () => {
  const dutchSt = pl({ nation: 34 });
  assert.ok(matchesFilter(dutchSt, { nation: [34] }));
  assert.ok(!matchesFilter(dutchSt, { nation: [18] }));
  assert.ok(matchesFilter(pl({ rareflag: 151 }), { rarity: [151] }));
  const cmCam = pl({ preferredPosition: 'CM', possiblePositions: ['CM', 'CAM'] });
  assert.ok(matchesFilter(cmCam, { position: 'CAM' }));
  assert.ok(!matchesFilter(cmCam, { position: 'CAM', preferredOnly: true }));
  assert.ok(matchesFilter(pl({ attributes: [86, 0, 0, 0, 0, 0] }), { attr: { stat: 'PAC', min: 85 } }));
  assert.ok(!matchesFilter(pl({ attributes: [84, 0, 0, 0, 0, 0] }), { attr: { stat: 'PAC', min: 85 } }));
});

test('a goalkeeper never matches an attribute condition', () => {
  const gk = pl({ preferredPosition: 'GK', possiblePositions: ['GK'], attributes: [90, 90, 90, 90, 90, 90] });
  assert.ok(!matchesFilter(gk, { attr: { stat: 'PAC', min: 85 } }));
});

test('roleSlots: score, assist, named position, xi', () => {
  assert.deepEqual(roleSlots(c('score', {}), F433), [8, 9, 10]);
  assert.deepEqual(roleSlots(c('assist', {}), F433), [5, 6, 7, 8, 9, 10]);
  assert.deepEqual(roleSlots(c('assist', { position: 'ST' }), F433), [9]);
  assert.deepEqual(roleSlots(c('score', { position: 'CAM' }), F433), []);
  assert.deepEqual(roleSlots(c('xi', {}), F433), [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
});

test('playPool drops loans by default, storage, exclusions and players over max OVR; keeps loans with includeLoans', () => {
  const loan = pl({ isLoan: true });
  const stored = pl({ inStorage: true });
  const excluded = pl();
  const tooGood = pl({ rating: 95 });
  const ok = pl();
  const all = [loan, stored, excluded, tooGood, ok];
  assert.deepEqual(playPool(all, { excludeIds: [excluded.id], maxRating: 90 }).map((p) => p.id), [ok.id]);
  assert.deepEqual(playPool(all, { excludeIds: [excluded.id], maxRating: 90, includeLoans: false }).map((p) => p.id), [ok.id]);
  assert.deepEqual(playPool(all, { excludeIds: [excluded.id], maxRating: 90, includeLoans: true }).map((p) => p.id), [loan.id, ok.id]);
});

test('loanMatches: remaining matches only for match loans', () => {
  assert.equal(loanMatches({ loanType: 'MATCH_LOAN', loanValue: 5 }), 5);
  assert.equal(loanMatches({ loanType: 'TIME_LOAN', loanValue: 3 }), undefined);
  assert.equal(loanMatches(null), undefined);
  assert.equal(loanMatches(undefined), undefined);
});

test('checkCovers: met only when enough matching players sit in the role slots', () => {
  const slots: (Player | null)[] = F433.map(() => pl({ nation: 14 }));
  const dutchCb = pl({ nation: 34, positions: [POSITION_IDS.CB], preferredPosition: 'CB', possiblePositions: ['CB'] });
  const conds = [c('score', { nation: [34] }), c('xi', { nation: [34] }, 2)];
  slots[2] = dutchCb; // a Dutch CB in a CB slot: counts for the XI, but is not a scorer
  let r = checkCovers(slots, F433, conds);
  assert.deepEqual(r.map((x) => x.met), [false, false]);
  slots[9] = pl({ nation: 34 }); // a Dutch ST
  r = checkCovers(slots, F433, conds);
  assert.deepEqual(r.map((x) => x.met), [true, true]);
  assert.deepEqual(r[0].itemIds, [slots[9]!.id]);
});

test('diagnosePlay: names a condition nobody in the pool can meet, else combo', () => {
  const pool = [pl({ nation: 14 }), pl({ nation: 14 })];
  const missing = c('score', { nation: [34] });
  assert.deepEqual(diagnosePlay(pool, F433, [missing]), [{ code: 'noMatch', condition: missing }]);
  const cbOnly = pl({ nation: 34, positions: [POSITION_IDS.CB], preferredPosition: 'CB', possiblePositions: ['CB'] });
  // a Dutch player exists but only as a CB: nobody can score -> noMatch too
  assert.deepEqual(diagnosePlay([cbOnly], F433, [missing]), [{ code: 'noMatch', condition: missing }]);
  const dutchSt = pl({ nation: 34 });
  assert.deepEqual(diagnosePlay([dutchSt], F433, [missing]), [{ code: 'combo' }]);
});

test('buildPlayProblem: count for xi, slotCount for roles, play mode, no cost', () => {
  const meta = { formations: {}, names: {}, thresholds: { 1: [], 2: [], 3: [] } } as never;
  const dutch = pl({ nation: 34 });
  const other = pl();
  const prob = buildPlayProblem([other, dutch], F433, [c('xi', { nation: [34] }), c('score', { nation: [34] })], meta, 10, (p) => ({
    groups: { 1: p.nation, 2: p.league, 3: p.club }, contrib: { 1: 1, 2: 1, 3: 1 }, maxChem: false,
  })) as { mode: string; constraints: unknown[]; players: { slots: number[] }[]; needsChem: boolean };
  assert.equal(prob.mode, 'play');
  assert.equal(prob.needsChem, true);
  assert.deepEqual(prob.constraints, [
    { kind: 'count', op: '>=', value: 1, players: [1] },
    { kind: 'slotCount', op: '>=', value: 1, players: [1], slots: [8, 9, 10] },
  ]);
  assert.deepEqual(prob.players[0].slots, [9]); // a ST fits only the ST slot of 4-3-3
});
