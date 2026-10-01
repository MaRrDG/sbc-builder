import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectSquadItems, mergeLedger, toGalleryItem, type Ledger } from './ledger.js';
import type { ClubItem } from '../ea.js';

const ci = (p: Partial<ClubItem> = {}): ClubItem => ({
  id: 1, assetId: 10, resourceId: 10, rating: 84, rareflag: 1, preferredPosition: 'CM', possiblePositions: ['CM'],
  teamid: 1, leagueId: 13, nation: 14, untradeable: false, itemState: 'free', owners: 1, gradingScore: 830, ...p,
});

test('new items enter with firstOwner from owners', () => {
  const { ledger, changed } = mergeLedger({}, [ci({ id: 1, owners: 1 }), ci({ id: 2, owners: 3 })], 1000);
  assert.equal(changed, true);
  assert.equal(ledger['1'].firstOwner, true);
  assert.equal(ledger['2'].firstOwner, false);
  assert.equal(ledger['1'].firstSeen, 1000);
});

test('unknown owners is not first owner', () => {
  const { ledger } = mergeLedger({}, [ci({ id: 1, owners: undefined })], 1);
  assert.equal(ledger['1'].firstOwner, false);
});

test('firstOwner never flips back; data refreshes; unchanged = no write', () => {
  const a = mergeLedger({}, [ci({ id: 1, owners: 1 })], 1000).ledger;
  const b = mergeLedger(a, [ci({ id: 1, owners: 2, rating: 85, gradingScore: 2100 })], 2000);
  assert.equal(b.ledger['1'].firstOwner, true);
  assert.equal(b.ledger['1'].item.gradingScore, 2100);
  assert.equal(b.ledger['1'].firstSeen, 1000);
  assert.equal(b.changed, true);
  assert.equal(mergeLedger(b.ledger, [ci({ id: 1, owners: 2, rating: 85, gradingScore: 2100 })], 3000).changed, false);
});

test('items not in the batch stay (sold items keep counting)', () => {
  const a = mergeLedger({}, [ci({ id: 1 }), ci({ id: 2 })], 1).ledger;
  const b = mergeLedger(a, [ci({ id: 1 })], 2).ledger;
  assert.deepEqual(Object.keys(b).sort(), ['1', '2']);
});

test('loans and malformed items are skipped', () => {
  const { ledger } = mergeLedger({}, [
    ci({ id: 1, loansInfo: { loanType: 'x', loanValue: 5 } }),
    { ...ci({ id: 2 }), possiblePositions: undefined } as unknown as ClubItem,
    { ...ci({ id: 3 }), teamid: undefined } as unknown as ClubItem,
  ], 1);
  assert.deepEqual(ledger, {} as Ledger);
});

test('stored records are slim: only the fields scoring and the card use', () => {
  const full = { ...ci({ id: 5, guidAssetId: 'g', skillmoves: 3 }), attributeArray: [1, 2], statsArray: [9], contract: 7, marketAverage: 900 };
  const { ledger } = mergeLedger({}, [full as ClubItem], 1);
  assert.deepEqual(Object.keys(ledger['5'].item).sort(), [
    'assetId', 'gradingScore', 'guidAssetId', 'id', 'leagueId', 'nation', 'possiblePositions', 'preferredPosition', 'rareflag',
    'rating', 'resourceId', 'skillmoves', 'teamid', 'untradeable',
  ]);
});

test('collectSquadItems: placed field players only; no bricks, bench, dream, concept or non-players', () => {
  const sq = (index: number, item: object) => ({ index, itemData: item });
  const p = (id: number, extra: object = {}) => ({ ...ci({ id }), itemType: 'player', ...extra });
  const response = {
    squad: {
      players: [
        sq(0, p(1)),
        sq(1, p(2)), // brick slot
        sq(2, p(3)), // custom brick slot
        sq(3, p(4, { dream: true })),
        sq(4, p(5, { concept: true })),
        sq(5, p(6, { itemType: 'training' })),
        sq(6, { ...p(7), possiblePositions: undefined }),
        sq(7, { id: 0 }),
        sq(11, p(8)), // bench / manager slot
      ],
    },
    playerRequirements: [{ index: 1, playerType: 'BRICK' }, { index: 2, playerType: 'CUSTOM_BRICK' }],
  };
  const caps = [{ method: 'GET', path: '/x', request: { players: [p(9)] }, response, at: 1 }];
  assert.deepEqual(collectSquadItems(caps).map((i) => i.id), [1]);
  assert.deepEqual(collectSquadItems(null), []);
});

test('toGalleryItem maps fields', () => {
  const e = mergeLedger({}, [ci({ id: 1, rareflag: 12, weakfootabilitytypecode: 5, skillmoves: 4, gender: 1 })], 1).ledger['1'];
  const g = toGalleryItem(e, { 12: 'icon' });
  assert.deepEqual(
    [g.kind, g.score, g.club, g.league, g.nation, g.position, g.weakFoot, g.skillMoves, g.gender, g.firstOwner],
    ['icon', 830, 1, 13, 14, 'CM', 5, 4, 1, true],
  );
});
