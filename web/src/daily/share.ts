// The share text: no names, only the emoji grid (tile order: nation, league, club, position, rating, card, gender).
import type { DailyTiles } from '../api';

const KEYS = ['nation', 'league', 'club', 'position', 'rating', 'cardType', 'gender'] as const;
const EMOJI = { hit: '🟩', near: '🟨', miss: '⬜' } as const;

export function shareText(o: { day: number; rows: DailyTiles[]; won: boolean; max: number; url: string }): string {
  const score = o.won ? `${o.rows.length}/${o.max}` : `X/${o.max}`;
  // a row saved before a column existed has no tile for it: that square is left out
  const grid = o.rows.map((r) => KEYS.map((k) => (r[k] ? EMOJI[r[k].state] : '')).join(''));
  return [`FC Solver Daily #${o.day} ${score}`, ...grid, o.url].join('\n');
}
