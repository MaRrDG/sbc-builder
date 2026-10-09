import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EligibilityReq } from './ea.js';
import type { Meta } from './meta.js';
import { parseRequirements } from './sbc.js';
import type { Player } from './squad.js';
import { eligiblePool, pointsPool, pointsProblem, NO_FILTERS, type SolveOptions, type ActiveSquad } from './solver.js';

const meta = { names: { nation: {}, league: {}, club: {}, rarity: {}, group: {} } } as unknown as Meta;
const req = (list: [number, number][]) =>
  parseRequirements(list.map(([k, v]) => ({ type: 'X', eligibilitySlot: 1, eligibilityKey: k, eligibilityValue: v }) as EligibilityReq), meta);
const OVR_MIN_45 = req([[41, 1], [13, 0], [40, 45]]);

let nextId = 1;
const card = (extra: Partial<Player> = {}) => {
  const id = nextId++;
  return {
    id, assetId: id, rating: 70, points: 100, tier: 2, untradeable: true, rareflag: 1, nation: 1, league: 1, club: 1,
    isLoan: false, state: 'free', ...extra,
  } as Player;
};
const opts = (o: Partial<SolveOptions> = {}): SolveOptions => ({ ...NO_FILTERS, keepPlaced: false, ...o });
const ids = (ps: Player[]) => ps.map((p) => p.id).sort((a, b) => a - b);

const xi = card();
const sub = card();
const special = card({ rareflag: 3 });
const tradeable = card({ untradeable: false });
const high = card({ rating: 88 });
const nation = card({ nation: 7 });
const league = card({ league: 13 });
const club = card({ club: 241 });
const excluded = card();
const plain = card();
const loan = card({ isLoan: true });
const noPoints = card({ points: 0 });
const tooLow = card({ rating: 40, tier: 1 });
const players = [xi, sub, special, tradeable, high, nation, league, club, excluded, plain, loan, noPoints, tooLow];
const squad: ActiveSquad = { starters: [xi.id], bench: [sub.id] };

// every option that filters a squad solve's pool filters the points pool the same way
const cases: [string, Partial<SolveOptions>, Player][] = [
  ['excludeActiveSquad', { excludeActiveSquad: true }, xi],
  ['excludeSquadReserves', { excludeSquadReserves: true }, sub],
  ['excludeSpecial', { excludeSpecial: true }, special],
  ['onlyUntradeable', { onlyUntradeable: true }, tradeable],
  ['maxRating', { maxRating: 85 }, high],
  ['excludeNations', { excludeNations: [7] }, nation],
  ['excludeLeagues', { excludeLeagues: [13] }, league],
  ['excludeClubs', { excludeClubs: [241] }, club],
  ['excludeIds', { excludeIds: [excluded.id] }, excluded],
];

for (const [name, o, out] of cases)
  test(`points pool respects ${name}`, () => {
    const before = pointsPool(players, OVR_MIN_45, opts(), squad);
    const after = pointsPool(players, OVR_MIN_45, opts(o), squad);
    assert.ok(before.includes(out));
    assert.ok(!after.includes(out));
    assert.deepEqual(ids(after), ids(before.filter((p) => p !== out)));
    // and it is exactly the squad pool, minus what a points SBC cannot use
    assert.deepEqual(ids(after), ids(eligiblePool(players, OVR_MIN_45, opts(o), squad).filter((p) => p.points > 0 && p.rating >= 45)));
  });

test('points pool: without a synced squad, the EA item state stands in for the active squad', () => {
  const inGame = card({ state: 'inGame' });
  const sidelines = card({ state: 'IN_GAME_SIDELINES' });
  const pool = pointsPool([inGame, sidelines, plain], [], opts({ excludeActiveSquad: true, excludeSquadReserves: true }), null);
  assert.deepEqual(ids(pool), [plain.id]);
});

test('points pool never takes loans, zero-point cards or cards a card rule rejects', () => {
  const pool = pointsPool(players, OVR_MIN_45, opts(), squad);
  for (const p of [loan, noPoints, tooLow]) assert.ok(!pool.includes(p));
});

test('pointsProblem without keepPlaced ignores placed cards', () => {
  const r = pointsProblem(players, OVR_MIN_45, opts({ excludeSpecial: true }), squad, [{ itemId: special.id }, { itemId: 999999 }]);
  assert.ok(!r.pool.includes(special));
  assert.deepEqual([r.keep, r.placedCount, r.missingPlaced], [[], 0, []]);
});

test('pointsProblem with keepPlaced keeps placed cards even when the settings would leave them out', () => {
  const r = pointsProblem(
    players, OVR_MIN_45, opts({ keepPlaced: true, excludeSpecial: true, excludeActiveSquad: true }), squad,
    [{ itemId: special.id }, { itemId: xi.id }, { itemId: plain.id }, { itemId: 999999 }],
  );
  assert.ok(r.pool.includes(special) && r.pool.includes(xi));
  assert.deepEqual(r.keep, [special.id, xi.id, plain.id]);
  assert.equal(r.placedCount, 3);
  assert.deepEqual(r.missingPlaced, [999999]);
  assert.equal(new Set(r.pool).size, r.pool.length); // no card twice
});

test('pointsProblem with keepPlaced does not keep a placed card that cannot count', () => {
  const r = pointsProblem(players, OVR_MIN_45, opts({ keepPlaced: true }), squad, [{ itemId: noPoints.id }, { itemId: tooLow.id }, { itemId: loan.id }]);
  assert.deepEqual(r.keep, []);
  assert.equal(r.placedCount, 3);
  for (const p of [noPoints, tooLow, loan]) assert.ok(!r.pool.includes(p));
});
