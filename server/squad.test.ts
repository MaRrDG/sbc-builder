// Fixed small squads against hand-derived values from the ported web app formulas. Tests only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { squadRating, starRating, chemistry, evaluate, compare, type Player } from './squad.js';
import { LEGENDS_CLUB_ID, HERO_CLUB_ID, NATION, LEAGUE, CLUB, type Meta, type ChemProfile } from './meta.js';
import { Key, Scope, type Requirement } from './sbc.js';

const ST = 25;
const CM = 14;

const base: ChemProfile = {
  id: 1, maxChem: false,
  rules: { [NATION]: { value: 1, universal: false }, [LEAGUE]: { value: 1, universal: false }, [CLUB]: { value: 1, universal: false } },
};
const hero: ChemProfile = { ...base, id: 2, maxChem: true };
const icon: ChemProfile = {
  id: 3, maxChem: true,
  rules: { [NATION]: { value: 2, universal: false }, [LEAGUE]: { value: 2, universal: false }, [CLUB]: { value: 2, universal: false } },
};

const metaWith = (teamLinks: Record<string, number> = {}): Meta =>
  ({
    thresholds: {
      [NATION]: [{ requirement: 2, points: 1 }, { requirement: 5, points: 1 }, { requirement: 8, points: 1 }],
      [LEAGUE]: [{ requirement: 3, points: 1 }, { requirement: 5, points: 1 }, { requirement: 8, points: 1 }],
      [CLUB]: [{ requirement: 2, points: 1 }, { requirement: 4, points: 1 }, { requirement: 7, points: 1 }],
    },
    baseProfiles: { 1: base, 2: hero, 3: icon },
    rarityProfiles: {},
    teamLinks,
  }) as unknown as Meta;
const meta = metaWith();

let nextId = 1;
const player = (o: Partial<Player> = {}): Player => ({
  id: nextId++, assetId: 0, resourceId: 0, name: 'P', rating: 80, points: 0, rareflag: 0, tier: 3, positions: [ST],
  preferredPosition: 'ST', possiblePositions: ['ST'], club: 1, league: 1, nation: 1, untradeable: false, firstOwner: true,
  groups: [], state: 'club', isLoan: false, minPrice: 0, fullName: '', rarityName: '', attributes: [], skillMoves: 0,
  weakFoot: 0, foot: 'Right', ...o,
});
const squad = (n: number, o: Partial<Player> = {}) => Array.from({ length: n }, () => player(o));
const types = Array<number>(11).fill(ST);
const pad = (ps: (Player | null)[]) => [...ps, ...Array<null>(11 - ps.length).fill(null)];

// ---- rating -----------------------------------------------------------------

test('squadRating: eleven equal ratings give that rating', () => {
  assert.equal(squadRating(Array(11).fill(80)), 80);
});

test('squadRating: players above the average add their excess before rounding', () => {
  // sum 890, avg 80.909; only 90 is above: total 890 + 9.0909 = 899.09 -> 899 -> floor(899/11) = 81
  assert.equal(squadRating([90, ...Array(10).fill(80)]), 81);
  // sum 881, avg 80.09; 81 adds 0.909: 881.909 -> 882 -> floor(882/11) = 80
  assert.equal(squadRating([81, ...Array(10).fill(80)]), 80);
});

test('squadRating: the total is rounded before the division, then floored', () => {
  // ten 81 and one 80: sum 890, avg 80.909; ten players above add 10 * 0.0909 = 0.909 -> 890.909 -> 891 -> 81 (81.0)
  assert.equal(squadRating([80, ...Array(10).fill(81)]), 81);
  // ten 80 and one 79: sum 879, avg 79.909; ten add 10 * 0.0909 = 0.909 -> 879.909 -> 880 -> 80
  assert.equal(squadRating([79, ...Array(10).fill(80)]), 80);
  // without rounding first 879.9 / 11 = 79.99 would floor to 79
});

test('squadRating: missing players still divide by eleven', () => {
  // five 80s: sum 400, avg 36.36; each adds 43.64 -> 618.18 -> 618 -> floor(618/11) = 56
  assert.equal(squadRating(Array(5).fill(80)), 56);
  assert.equal(squadRating([]), 0);
});

test('squadRating: capped at 99', () => {
  assert.equal(squadRating(Array(11).fill(99)), 99);
  assert.equal(squadRating(Array(11).fill(120)), 99);
});

test('starRating: half stars from the thresholds', () => {
  assert.equal(starRating(0), 0);
  assert.equal(starRating(59), 0.5);
  assert.equal(starRating(60), 1);
  assert.equal(starRating(82), 4.5);
  assert.equal(starRating(83), 5);
  assert.equal(starRating(99), 5);
});

// ---- chemistry --------------------------------------------------------------

test('chemistry: eleven teammates in position reach 3 per slot (capped)', () => {
  const r = chemistry(squad(11), types, meta);
  assert.deepEqual(r.perSlot, Array(11).fill(3));
  assert.equal(r.total, 33);
});

test('chemistry: empty slots give 0 and shrink the groups', () => {
  // two teammates: club 2 -> 1, league 2 (< 3) -> 0, nation 2 -> 1
  const r = chemistry(pad(squad(2)), types, meta);
  assert.deepEqual(r.perSlot.slice(0, 3), [2, 2, 0]);
  assert.equal(r.total, 4);
  assert.equal(chemistry(Array(11).fill(null), types, meta).total, 0);
});

test('chemistry: a player out of position gets 0 and does not count for the others', () => {
  const [a] = squad(1);
  const out = player({ positions: [CM] });
  const r = chemistry(pad([a, out]), types, meta);
  assert.deepEqual(r.perSlot.slice(0, 2), [0, 0]); // a alone contributes 1, below every threshold
  const both = chemistry(pad(squad(2)), types, meta);
  assert.equal(both.total, 4);
});

test('chemistry: linked clubs count as one club', () => {
  const a = player({ club: 10, league: 5, nation: 5 });
  const b = player({ club: 11, league: 6, nation: 6 });
  assert.equal(chemistry(pad([a, b]), types, meta).total, 0);
  assert.deepEqual(chemistry(pad([a, b]), types, metaWith({ 11: 10 })).perSlot.slice(0, 2), [1, 1]);
});

test('chemistry: an icon in position has full chemistry and boosts its nation by 2', () => {
  const ic = player({ club: LEGENDS_CLUB_ID, league: 2118, nation: 7, rareflag: 12 });
  const p = player({ club: 3, league: 4, nation: 7 });
  // icon alone: maxChem in position -> 3
  assert.equal(chemistry(pad([ic]), types, meta).perSlot[0], 3);
  // with a teammate: nation contributions 2 + 1 = 3 (>= 2, < 5) -> +1 for the base player
  const r = chemistry(pad([ic, p]), types, meta);
  assert.deepEqual(r.perSlot.slice(0, 2), [3, 1]);
  assert.equal(r.total, 4);
});

test('chemistry: an icon out of position gets nothing', () => {
  const ic = player({ club: LEGENDS_CLUB_ID, league: 2118, nation: 7, positions: [CM] });
  assert.equal(chemistry(pad([ic]), types, meta).perSlot[0], 0);
});

test('chemistry: a hero in position has full chemistry', () => {
  const h = player({ club: HERO_CLUB_ID, league: 9, nation: 8 });
  assert.equal(chemistry(pad([h]), types, meta).perSlot[0], 3);
});

// ---- requirements -----------------------------------------------------------

const req = (key: number, value: number, scope: Requirement['scope'] = Scope.GREATER, count = -1): Requirement => ({
  slot: 0, scope, count, keys: new Map([[key, [value]]]), combined: false, text: `k${key}`,
});

test('compare: scopes', () => {
  assert.ok(compare(Scope.GREATER, 5, 5));
  assert.ok(!compare(Scope.GREATER, 4, 5));
  assert.ok(compare(Scope.LOWER, 5, 5));
  assert.ok(!compare(Scope.LOWER, 6, 5));
  assert.ok(compare(Scope.EXACT, 5, 5));
  assert.ok(!compare(Scope.EXACT, 6, 5));
});

test('evaluate: team rating requirement', () => {
  const r = req(Key.TEAM_RATING, 82);
  assert.ok(evaluate(squad(11, { rating: 82 }), types, [r], 'AND', meta).allMet);
  const low = evaluate(squad(11, { rating: 81 }), types, [r], 'AND', meta);
  assert.equal(low.rating, 81);
  assert.equal(low.allMet, false);
  assert.equal(low.results[0].met, false);
});

test('evaluate: star rating compares half stars', () => {
  // value 9 = 4.5 stars; rating 82 is 4.5, rating 81 is 4
  assert.ok(evaluate(squad(11, { rating: 82 }), types, [req(Key.TEAM_STAR_RATING, 9)], 'AND', meta).allMet);
  assert.equal(evaluate(squad(11, { rating: 78 }), types, [req(Key.TEAM_STAR_RATING, 9)], 'AND', meta).allMet, false);
});

test('evaluate: an incomplete squad is never allMet, even when every requirement is met', () => {
  const r = evaluate(pad(squad(10, { rating: 90 })), types, [req(Key.CHEMISTRY_POINTS, 0)], 'AND', meta);
  assert.equal(r.results[0].met, true);
  assert.equal(r.allMet, false);
  assert.equal(r.rating, squadRating(Array(10).fill(90)));
});

test('evaluate: chemistry points and per-player chemistry', () => {
  const full = evaluate(squad(11), types, [req(Key.CHEMISTRY_POINTS, 33), req(Key.ALL_PLAYERS_CHEMISTRY_POINTS, 3)], 'AND', meta);
  assert.equal(full.chemistry, 33);
  assert.ok(full.allMet);
  assert.equal(full.results[1].actual, '11/11');
  // one outsider in a different club / league / nation: he has 0 chem, the other ten still reach 3
  const mixed = evaluate([...squad(10), player({ club: 9, league: 9, nation: 9 })], types, [req(Key.ALL_PLAYERS_CHEMISTRY_POINTS, 3)], 'AND', meta);
  assert.equal(mixed.results[0].actual, '10/11');
  assert.equal(mixed.allMet, false);
});

test('evaluate: same-club count uses linked clubs and takes the largest group', () => {
  const ps = [...squad(3, { club: 10 }), ...squad(2, { club: 11 }), ...squad(6, { club: 12 })];
  const linked = metaWith({ 11: 10 });
  assert.equal(evaluate(ps, types, [req(Key.SAME_CLUB_COUNT, 5)], 'AND', linked).results[0].actual, 6);
  assert.equal(evaluate(pad(ps.slice(0, 5)), types, [req(Key.SAME_CLUB_COUNT, 5)], 'AND', linked).results[0].actual, 5);
});

test('evaluate: distinct nations with a lower scope', () => {
  const ps = [...squad(6, { nation: 1 }), ...squad(5, { nation: 2 })];
  assert.equal(evaluate(ps, types, [req(Key.NATION_COUNT, 2, Scope.LOWER)], 'AND', meta).allMet, true);
  assert.equal(evaluate(ps, types, [req(Key.NATION_COUNT, 1, Scope.LOWER)], 'AND', meta).allMet, false);
});

test('evaluate: min overall with a player count, empty slots ignored', () => {
  const ps = pad([...squad(2, { rating: 86 }), ...squad(9, { rating: 80 })].slice(0, 11));
  const r = req(Key.PLAYER_MIN_OVR, 85, Scope.GREATER, 2);
  assert.equal(evaluate(ps, types, [r], 'AND', meta).results[0].actual, 2);
  assert.ok(evaluate(ps, types, [r], 'AND', meta).results[0].met);
  assert.equal(evaluate(ps, types, [req(Key.PLAYER_MIN_OVR, 85, Scope.GREATER, 3)], 'AND', meta).results[0].met, false);
});

test('evaluate: player quality is the lowest tier for a minimum', () => {
  const ps = [...squad(10, { tier: 3 }), player({ tier: 2 })];
  assert.equal(evaluate(ps, types, [req(Key.PLAYER_QUALITY, 3)], 'AND', meta).results[0].met, false);
  assert.equal(evaluate(ps, types, [req(Key.PLAYER_QUALITY, 2)], 'AND', meta).results[0].met, true);
});

test('evaluate: legends are counted by club or league', () => {
  const ps = [player({ club: LEGENDS_CLUB_ID }), player({ league: 2118 }), ...squad(9)];
  assert.equal(evaluate(ps, types, [req(Key.LEGEND_COUNT, 2)], 'AND', meta).results[0].actual, 2);
});

test('evaluate: OR needs one requirement, AND all', () => {
  const rs = [req(Key.TEAM_RATING, 90), req(Key.TEAM_RATING, 80)];
  const s = squad(11, { rating: 82 });
  assert.equal(evaluate(s, types, rs, 'AND', meta).allMet, false);
  assert.equal(evaluate(s, types, rs, 'OR', meta).allMet, true);
});

test('evaluate: combined requirement needs every key on the same player', () => {
  const combined: Requirement = {
    slot: 0, scope: Scope.GREATER, count: 2, combined: true, text: 'c',
    keys: new Map([[Key.NATION_ID, [7]], [Key.PLAYER_MIN_OVR, [85]]]),
  };
  const ps = [player({ nation: 7, rating: 86 }), player({ nation: 7, rating: 80 }), player({ nation: 8, rating: 90 }), ...squad(8)];
  assert.equal(evaluate(ps, types, [combined], 'AND', meta).results[0].actual, 1);
});
