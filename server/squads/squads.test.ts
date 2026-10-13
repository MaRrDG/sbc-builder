import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSlots, parseSquad, parseSquadList } from './parse.js';
import { squadValue } from './value.js';
import { squadRows, squadView, type SquadsInput } from './compute.js';
import type { ClubItem } from '../ea.js';
import type { Meta } from '../meta.js';

const item = (id: number, p: Partial<ClubItem> = {}): ClubItem => ({
  id, assetId: 100 + id, resourceId: 100 + id, rating: 80, rareflag: 1, preferredPosition: 'CM', possiblePositions: ['CM'],
  teamid: 1, leagueId: 13, nation: 14, untradeable: false, itemState: 'free', ...p,
});

test('list: `squad` array with names and players inline (itemData)', () => {
  const r = parseSquadList({
    activeSquadId: 2,
    squad: [
      { id: 2, squadName: 'Main', formation: 'f433', rating: 86, players: [{ index: 1, itemData: { id: 11, rating: 85, marketAverage: 5000 } }, { index: 0, itemData: { id: 10 } }, { index: 2, itemData: { id: 0 } }] },
      { id: 3, squadName: 'Bench', formation: 'f442', players: [] },
    ],
  });
  assert.ok(r);
  assert.equal(r.activeSquadId, 2);
  assert.deepEqual(r.list.map((s) => [s.id, s.name, s.formation, s.rating]), [[2, 'Main', 'f433', 86], [3, 'Bench', 'f442', null]]);
  // sorted by index, empty slot (id 0) dropped, an id-only itemData keeps no item
  assert.deepEqual(r.list[0].players, [{ index: 0, itemId: 10 }, { index: 1, itemId: 11, item: { id: 11, rating: 85, marketAverage: 5000 } }]);
  assert.equal(r.list[1].players, null); // EA's list always sends `players: []`: not loaded, not an empty squad
  assert.equal((r.raw as { activeSquadId: number }).activeSquadId, 2); // the raw response is kept
});

test('list: `squads` array, `name`, ids only, or no players at all', () => {
  const r = parseSquadList({ squads: [{ id: 4, name: 'Evo', players: [{ index: 0, id: 7 }, { index: 1, itemId: 8 }] }, { id: 5 }, { foo: 1 }, { id: 4 }] });
  assert.ok(r);
  assert.equal(r.activeSquadId, null);
  assert.deepEqual(r.list, [
    { id: 4, name: 'Evo', formation: null, rating: null, players: [{ index: 0, itemId: 7 }, { index: 1, itemId: 8 }] },
    { id: 5, name: '', formation: null, rating: null, players: null },
  ]);
  assert.equal(parseSquadList({ activeSquadId: 1 }), null);
  assert.equal(parseSquadList(null), null);
  assert.deepEqual(parseSlots([9, 0, 12]), [{ index: 0, itemId: 9 }, { index: 2, itemId: 12 }]);
});

test('one squad: id from the response or the path; no players → null', () => {
  const d = parseSquad({ id: 6, formation: 'f4231', players: [{ index: 11, itemData: { id: 21, marketAverage: 900 } }] }, 6);
  assert.deepEqual(d, { id: 6, name: '', formation: 'f4231', players: [{ index: 11, itemId: 21, item: { id: 21, marketAverage: 900 } }] });
  assert.equal(parseSquad({ players: [] }, 8)?.id, 8);
  assert.equal(parseSquad({ players: [] }, null), null); // /squad/active without an id
  assert.equal(parseSquad({ id: 3 }, 3), null);
});

test('value: club price first, then the squad\'s own, loans 0, unknown counted', () => {
  const club = new Map<number, ClubItem>([
    [1, item(1, { marketAverage: 1000 })],
    [2, item(2)], // no price in the club
    [3, item(3, { marketAverage: 99999, loansInfo: { loanType: 'MATCH_LOAN', loanValue: 5 } })],
    [12, item(12, { marketAverage: 300 })],
  ]);
  const { slots, value } = squadValue(
    [
      { index: 0, itemId: 1, item: { id: 1, marketAverage: 5 } },
      { index: 1, itemId: 2, item: { id: 2, marketAverage: 700 } },
      { index: 2, itemId: 3 },
      { index: 3, itemId: 4 }, // not in the club, no item
      { index: 11, itemId: 12 },
    ],
    club,
  );
  assert.deepEqual(value, { starters: 1700, bench: 300, total: 2000, unknown: 1, loans: 1 });
  assert.deepEqual(slots.map((s) => [s.value, s.source, s.loan]), [[1000, 'club', false], [700, 'squad', false], [0, null, true], [null, null, false], [300, 'club', false]]);
});

const meta = {
  names: { nation: {}, league: {}, club: {}, rarity: {}, group: {}, loc: {} },
  players: {},
  formations: {},
} as unknown as Meta;

test('rows: active first, then by value; detail falls back to the active-squad ids', () => {
  const club = [item(1, { marketAverage: 1000, rating: 90 }), item(2, { marketAverage: 50, rating: 70 }), item(3, { marketAverage: 20000 })];
  const input: SquadsInput = {
    list: {
      fetchedAt: 10,
      data: {
        activeSquadId: 1,
        raw: null,
        list: [
          { id: 1, name: 'Main', formation: 'f433', rating: null, players: [] }, // an older cache of EA's list
          { id: 2, name: 'Rich', formation: 'f442', rating: null, players: [{ index: 0, itemId: 3 }] },
          { id: 3, name: 'Unseen', formation: null, rating: 77, players: [] },
        ],
      },
    },
    details: new Map(),
    active: { squadId: 1, starters: [1, 2], bench: [3] },
    club,
  };
  const rows = squadRows(input, meta);
  assert.deepEqual(rows.map((r) => [r.id, r.active, r.loaded, r.value.total]), [[1, true, true, 21050], [2, false, true, 20000], [3, false, false, 0]]);
  assert.equal(rows[2].rating, 77); // EA's own rating when the players are unknown
  // the preview carries the starters only (index < 11), with what a small card needs
  assert.deepEqual(rows[0].preview.map((p) => [p.index, p.rating, p.position]), [[0, 90, 'CM'], [1, 70, 'CM']]);
  assert.deepEqual(rows[2].preview, []);
  const v = squadView(input, meta, 1);
  assert.ok(v);
  assert.deepEqual(v.slots.map((s) => [s.index, s.itemId, s.player?.rating]), [[0, 1, 90], [1, 2, 70], [11, 3, 80]]);
  assert.equal(v.value.starters, 1050);
  assert.equal(squadView(input, meta, 99), null);
});

test('detail cache wins over an older list; a newer list with players wins over it', () => {
  const base: SquadsInput = {
    list: { fetchedAt: 10, data: { activeSquadId: null, raw: null, list: [{ id: 5, name: 'X', formation: null, rating: null, players: [{ index: 0, itemId: 1 }] }] } },
    details: new Map([[5, { fetchedAt: 20, data: { id: 5, name: 'X', formation: null, players: [{ index: 0, itemId: 2 }] } }]]),
    active: null,
    club: [item(1, { marketAverage: 1 }), item(2, { marketAverage: 2 })],
  };
  assert.equal(squadView(base, meta, 5)?.value.total, 2);
  assert.equal(squadView({ ...base, list: { ...base.list!, fetchedAt: 30 } }, meta, 5)?.value.total, 1);
});
