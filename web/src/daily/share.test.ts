import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shareText } from './share';
import type { DailyTiles } from '../api';

const tiles = (s: string): DailyTiles => {
  const st = (c: string) => ({ state: c === 'g' ? 'hit' : c === 'y' ? 'near' : 'miss' }) as const;
  const [nation, league, club, position, rating, cardType] = [...s].map(st);
  return { nation, league, club, position, rating, cardType };
};

test('won: score, one emoji row per guess, link', () => {
  assert.equal(
    shareText({ day: 42, rows: [tiles('gy-y-g'), tiles('gggggg')], won: true, max: 5, url: 'fcsolver.app/daily' }),
    'FC Solver Daily #42 2/5\n🟩🟨⬜🟨⬜🟩\n🟩🟩🟩🟩🟩🟩\nfcsolver.app/daily',
  );
});

test('lost: X/5', () => {
  assert.match(shareText({ day: 7, rows: [tiles('------')], won: false, max: 5, url: 'x/daily' }), /^FC Solver Daily #7 X\/5\n/);
});
