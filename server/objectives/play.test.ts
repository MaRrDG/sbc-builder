import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loanMatches } from '../squad.js';
import { matchesFilter, roleSlots, playPool, checkCovers, diagnosePlay, buildPlayProblem, uncoveredReasons, playableXi } from './play.js';
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

test('buildPlayProblem with groups: soft problem, each constraint tagged with its objective', () => {
  const meta = { formations: {}, names: {}, thresholds: { 1: [], 2: [], 3: [] } } as never;
  const dutch = pl({ nation: 34 });
  const chem = (p: Player) => ({ groups: { 1: p.nation, 2: p.league, 3: p.club }, contrib: { 1: 1, 2: 1, 3: 1 }, maxChem: false });
  const conds = [c('xi', { nation: [34] }), c('score', { nation: [34] }), c('score', { nation: [18] })];
  const prob = buildPlayProblem([dutch], F433, conds, meta, 10, chem, 4, [1798, 1798, 1797]) as { soft?: boolean; constraints: { group?: number }[] };
  assert.equal(prob.soft, true);
  assert.deepEqual(prob.constraints.map((x) => x.group), [1798, 1798, 1797]);
  const hard = buildPlayProblem([dutch], F433, conds, meta, 10, chem) as { soft?: boolean; constraints: { group?: number }[] };
  assert.equal('soft' in hard, false); // hard problems stay exactly as before
  assert.ok(hard.constraints.every((x) => !('group' in x)));
});

test('uncoveredReasons: per uncovered objective, noMatch for a condition nobody can meet, else combo', () => {
  const dutchSt = pl({ nation: 34 });
  const germanSt = pl({ nation: 18 });
  const dutch = c('score', { nation: [34] });
  const german = c('score', { nation: [18] });
  const dutchXi = c('xi', { nation: [34] });
  const french = c('xi', { nation: [21] });
  // objective 1: a Dutch scorer; 2: a German scorer + a Dutch player in the XI; 3: a French player
  const conds = [dutch, german, dutchXi, french];
  const groups = [1, 2, 2, 3];
  const slots: (Player | null)[] = F433.map(() => null);
  slots[9] = dutchSt;
  const covers = checkCovers(slots, F433, conds);
  // 1 is covered; 2 is half met and could be done, it clashes; nobody in the club is French
  assert.deepEqual(uncoveredReasons([dutchSt, germanSt], F433, conds, groups, covers, { optimal: true }), [
    { code: 'combo', objectiveId: 2 },
    { code: 'noMatch', condition: french, objectiveId: 3 },
  ]);
  // everything covered: no reasons
  assert.deepEqual(uncoveredReasons([dutchSt], F433, [dutch], [1], checkCovers(slots, F433, [dutch]), { optimal: true }), []);
});

// 4-2-3-1 as meta has it: GK RB RCB LCB LB RDM LDM RAM CAM LAM ST
const F4231 = [0, 3, 5, 5, 7, 10, 10, 17, 18, 19, 25];
const F442 = [0, 3, 5, 5, 7, 12, 14, 14, 16, 25, 25];

test('diagnosePlay: noSlot when the formation has no slot for the condition, naming formations that do', () => {
  const cam = pl({ positions: [POSITION_IDS.CAM], preferredPosition: 'CAM', possiblePositions: ['CAM'] });
  const playmaker = c('assist', { position: 'CAM', preferredOnly: true });
  assert.deepEqual(diagnosePlay([cam], F433, [playmaker], { f433: F433, f442: F442, f4231: F4231 }), [
    { code: 'noSlot', condition: playmaker, formations: ['f4231'] },
  ]);
  // closest to the current formation first (fewest slots to change), at most two
  const F3412 = [0, 5, 5, 5, 12, 14, 14, 16, 18, 21, 21];
  const F41212 = [0, 3, 5, 5, 7, 10, 14, 14, 18, 25, 25];
  assert.deepEqual(diagnosePlay([cam], F433, [playmaker], { f3412: F3412, f41212: F41212, f4231: F4231 })[0], {
    code: 'noSlot', condition: playmaker, formations: ['f41212', 'f4231'],
  });
  // without other formations to suggest: still noSlot, an empty list
  assert.deepEqual(diagnosePlay([], F433, [playmaker]), [{ code: 'noSlot', condition: playmaker, formations: [] }]);
  // the slot exists but nobody fits it: noMatch
  assert.deepEqual(diagnosePlay([], F4231, [playmaker]), [{ code: 'noMatch', condition: playmaker }]);
});

test('uncoveredReasons: noSlot, selfClash when nothing is covered, timeout when not proven optimal', () => {
  const dutchSt = pl({ nation: 34 });
  const cam = pl({ positions: [POSITION_IDS.CAM], preferredPosition: 'CAM', possiblePositions: ['CAM'] });
  const dutch = c('score', { nation: [34] });
  const playmaker = c('assist', { position: 'CAM', preferredOnly: true });
  const slots: (Player | null)[] = F433.map(() => null);
  slots[9] = dutchSt;
  const formations = { f433: F433, f4231: F4231 };
  // the playmaker objective in 4-3-3: the formation has no CAM slot
  assert.deepEqual(
    uncoveredReasons([dutchSt, cam], F433, [dutch, playmaker], [1, 2], checkCovers(slots, F433, [dutch, playmaker]), { optimal: true, formations }),
    [{ code: 'noSlot', condition: playmaker, formations: ['f4231'], objectiveId: 2 }],
  );
  // proven optimal and nothing covered although each condition alone can be met: the objective clashes with itself
  const twoDutch = c('xi', { nation: [34] }, 2);
  const otherDutch = pl({ nation: 34, positions: [POSITION_IDS.CB], preferredPosition: 'CB', possiblePositions: ['CB'] });
  const none = checkCovers(F433.map(() => null), F433, [dutch, twoDutch]);
  assert.deepEqual(uncoveredReasons([dutchSt, otherDutch], F433, [dutch, twoDutch], [1, 1], none, { optimal: true }), [{ code: 'selfClash', objectiveId: 1 }]);
  // the solver ran out of time: nothing is proven, so no "clash"
  assert.deepEqual(uncoveredReasons([dutchSt, otherDutch], F433, [dutch, twoDutch], [1, 1], none, { optimal: false }), [{ code: 'timeout', objectiveId: 1 }]);
});

test('playableXi: every slot filled, in position, no asset twice', () => {
  const gk = pl({ positions: [POSITION_IDS.GK], preferredPosition: 'GK', possiblePositions: ['GK'] });
  const st = pl();
  const types = [POSITION_IDS.GK, POSITION_IDS.ST];
  assert.equal(playableXi([gk, st], types), true);
  assert.equal(playableXi([gk, null], types), false);
  assert.equal(playableXi([st, gk], types), false); // out of position
  const twin = { ...st, id: st.id + 1000 }; // another copy of the same card
  assert.equal(playableXi([gk, st, twin], [...types, POSITION_IDS.ST]), false);
});
