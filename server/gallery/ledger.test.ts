import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectItems, mergeLedger, toGalleryItem, type Ledger } from './ledger.js';
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

test('loans are skipped', () => {
  const { ledger } = mergeLedger({}, [ci({ id: 1, loansInfo: { loanType: 'x', loanValue: 5 } })], 1);
  assert.deepEqual(ledger, {} as Ledger);
});

test('collectItems finds player items anywhere in a raw response', () => {
  const raw = { squad: { players: [{ index: 0, itemData: ci({ id: 7 }) }, { index: 1, itemData: { id: 0 } }] }, x: [ci({ id: 8 })] };
  assert.deepEqual(collectItems(raw).map((i) => i.id).sort(), [7, 8]);
});

test('toGalleryItem maps fields', () => {
  const e = mergeLedger({}, [ci({ id: 1, rareflag: 12, weakfootabilitytypecode: 5, skillmoves: 4, gender: 1 })], 1).ledger['1'];
  const g = toGalleryItem(e, { 12: 'icon' });
  assert.deepEqual(
    [g.kind, g.score, g.club, g.league, g.nation, g.position, g.weakFoot, g.skillMoves, g.gender, g.firstOwner],
    ['icon', 830, 1, 13, 14, 'CM', 5, 4, 1, true],
  );
});
