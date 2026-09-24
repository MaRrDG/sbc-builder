import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addClubPage, assembleClub, type ClubPages } from './club-pages.js';

const players = (from: number, n: number) => Array.from({ length: n }, (_, k) => ({ id: from + k }));

test('whole club from pages in order', () => {
  const pages: ClubPages = new Map();
  addClubPage(pages, 0, 3, players(0, 3), 3);
  assert.equal(assembleClub(pages), null); // last page not seen yet
  addClubPage(pages, 3, 3, players(3, 2), 2);
  assert.deepEqual(assembleClub(pages)?.map((p) => p.id), [0, 1, 2, 3, 4]);
});

test('pages arriving out of order still assemble', () => {
  const pages: ClubPages = new Map();
  addClubPage(pages, 3, 3, players(3, 1), 1);
  addClubPage(pages, 0, 3, players(0, 3), 3);
  assert.deepEqual(assembleClub(pages)?.map((p) => p.id), [0, 1, 2, 3]);
});

test('a missing page means no club', () => {
  const pages: ClubPages = new Map();
  addClubPage(pages, 0, 3, players(0, 3), 3);
  addClubPage(pages, 6, 3, players(6, 1), 1);
  assert.equal(assembleClub(pages), null);
});

test('club size a multiple of the page size ends on an empty page', () => {
  const pages: ClubPages = new Map();
  addClubPage(pages, 0, 3, players(0, 3), 3);
  addClubPage(pages, 3, 3, [], 0);
  assert.deepEqual(assembleClub(pages)?.map((p) => p.id), [0, 1, 2]);
});

test('the short page is judged on the raw count, not on players kept', () => {
  const pages: ClubPages = new Map();
  addClubPage(pages, 0, 3, players(0, 2), 3); // one non-player item filtered out: page was full
  assert.equal(assembleClub(pages), null);
});

test('an item seen on two pages is kept once', () => {
  const pages: ClubPages = new Map();
  addClubPage(pages, 0, 3, players(0, 3), 3);
  addClubPage(pages, 3, 3, [{ id: 2 }, { id: 3 }], 2);
  assert.deepEqual(assembleClub(pages)?.map((p) => p.id), [0, 1, 2, 3]);
});

test('a filtered-out item does not look like a gap', () => {
  const pages: ClubPages = new Map();
  addClubPage(pages, 0, 3, players(0, 2), 3);
  addClubPage(pages, 3, 3, players(3, 1), 1);
  assert.deepEqual(assembleClub(pages)?.map((p) => p.id), [0, 1, 3]);
});
