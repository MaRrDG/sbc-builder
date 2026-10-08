import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, SEEN_STEP, baseSeen, cardTypeOf, inTransfer, mergePlayer, observe, type Observation } from './players.js';
import { HERO_CLUB_ID, LEGENDS_CLUB_ID, LEGENDS_LEAGUE_ID } from '../meta.js';

const ob = (p: Partial<Observation> = {}): Observation => ({ assetId: 10, rareflag: 1, rating: 84, nation: 14, league: 13, club: 1, position: 'CM', ...p });
const names = { name: 'Rice', full: 'Declan Rice', rating: 84 };
const T = 1_000 * DAY;

test('observe reads club items, objective rewards (teamId) and rejects junk', () => {
  const item = { itemType: 'player', assetId: 10, rareflag: 0, rating: 80, nation: 14, leagueId: 13, teamid: 1, preferredPosition: 'ST' };
  assert.deepEqual(observe(item), { assetId: 10, rareflag: 0, rating: 80, nation: 14, league: 13, club: 1, position: 'ST' });
  assert.equal(observe({ ...item, teamid: undefined, teamId: 7 })?.club, 7);
  assert.equal(observe({ ...item, itemType: 'training' }), null);
  assert.equal(observe({ ...item, assetId: 0 }), null);
  assert.equal(observe({ ...item, rareflag: -1 }), null);
  assert.equal(observe(null), null);
});

test('cardTypeOf: icons by club or league, heroes by club', () => {
  assert.equal(cardTypeOf({ club: LEGENDS_CLUB_ID, league: 1 }), 'icon');
  assert.equal(cardTypeOf({ club: 1, league: LEGENDS_LEAGUE_ID }), 'icon');
  assert.equal(cardTypeOf({ club: HERO_CLUB_ID, league: 13 }), 'hero');
  assert.equal(cardTypeOf({ club: 1, league: 13 }), 'normal');
});

test('a new base card creates the row with its club as base club', () => {
  const r = mergePlayer(undefined, ob(), names, T)!;
  assert.equal(r.name, 'Rice');
  assert.equal(r.fullName, 'Declan Rice');
  assert.deepEqual(r.baseClubs, [{ club: 1, league: 13, lastSeen: T }]);
  assert.equal(baseSeen(r), T);
  assert.equal(r.cardType, 'normal');
});

test('unknown name: no row', () => {
  assert.equal(mergePlayer(undefined, ob(), undefined, T), null);
});

test('a special card first: row exists, base rating from players.json, no base club', () => {
  const r = mergePlayer(undefined, ob({ rareflag: 3, rating: 89, club: 5 }), names, T)!;
  assert.equal(r.rating, 84);
  assert.equal(r.club, 5);
  assert.deepEqual(r.baseClubs, []);
  assert.equal(baseSeen(r), null);
});

test('a special card never changes club / rating of a known row', () => {
  const r = mergePlayer(undefined, ob(), names, T)!;
  assert.equal(mergePlayer(r, ob({ rareflag: 3, rating: 89, club: 5 }), names, T + 1000), null);
  const later = mergePlayer(r, ob({ rareflag: 3, rating: 89, club: 5 }), names, T + SEEN_STEP)!;
  assert.equal(later.club, 1);
  assert.equal(later.rating, 84);
  assert.equal(later.lastSeen, T + SEEN_STEP);
});

test('the same base card again within SEEN_STEP is no change', () => {
  const r = mergePlayer(undefined, ob(), names, T)!;
  assert.equal(mergePlayer(r, ob(), names, T + 1000), null);
});

test('base rating and club follow the most recent base card', () => {
  const r = mergePlayer(undefined, ob(), names, T)!;
  const moved = mergePlayer(r, ob({ club: 2, league: 53, rating: 85 }), names, T + DAY)!;
  assert.equal(moved.club, 2);
  assert.equal(moved.league, 53);
  assert.equal(moved.rating, 85);
  assert.deepEqual(moved.baseClubs.map((c) => c.club), [2, 1]);
});

test('two base clubs within 14 days = in transfer; settles after', () => {
  const r = mergePlayer(undefined, ob(), names, T)!;
  const moved = mergePlayer(r, ob({ club: 2 }), names, T + DAY)!;
  assert.equal(inTransfer(moved, T + DAY), true);
  assert.equal(inTransfer(moved, T + 14 * DAY + 1), false);
  // a stale account still reporting the old club keeps it in transfer
  const stale = mergePlayer(moved, ob({ club: 1 }), names, T + 3 * DAY)!;
  assert.equal(stale.club, 1);
  assert.equal(inTransfer(stale, T + 3 * DAY), true);
});

test('a special card first, then the base card, sets the base club', () => {
  const r = mergePlayer(undefined, ob({ rareflag: 3, club: 5 }), names, T)!;
  const b = mergePlayer(r, ob({ club: 1 }), names, T + 1)!;
  assert.equal(b.club, 1);
  assert.deepEqual(b.baseClubs.map((c) => c.club), [1]);
});
