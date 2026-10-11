import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareText } from './share';
import type { DailyTiles } from '../api';

const tiles = (s: string): DailyTiles => {
  const st = (c: string) => ({ state: c === 'g' ? 'hit' : c === 'y' ? 'near' : 'miss' }) as const;
  const [nation, league, club, position, rating, cardType, gender] = [...s].map(st);
  return { nation, league, club, position, rating, cardType, gender };
};

test('won: score, one emoji row per guess (7 tiles, gender last), link', () => {
  assert.equal(
    shareText({ day: 42, rows: [tiles('gy-y-g-'), tiles('ggggggg')], won: true, max: 5, url: 'fcsolver.app/daily' }),
    'FC Solver Daily #42 2/5\n🟩🟨⬜🟨⬜🟩⬜\n🟩🟩🟩🟩🟩🟩🟩\nfcsolver.app/daily',
  );
});

test('lost: X/5', () => {
  assert.match(shareText({ day: 7, rows: [tiles('-------')], won: false, max: 5, url: 'x/daily' }), /^FC Solver Daily #7 X\/5\n/);
});

test('a row saved before the gender tile existed keeps its 6 squares', () => {
  const { gender: _, ...old } = tiles('ggggggg');
  assert.equal(shareText({ day: 1, rows: [old as DailyTiles], won: true, max: 5, url: 'x' }), 'FC Solver Daily #1 1/5\n🟩🟩🟩🟩🟩🟩\nx');
});
