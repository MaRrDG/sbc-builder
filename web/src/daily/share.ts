// The share text: no names, only the emoji grid (tile order: nation, league, club, position, rating, card).
import type { DailyTiles } from '../api';

const KEYS = ['nation', 'league', 'club', 'position', 'rating', 'cardType'] as const;
const EMOJI = { hit: '🟩', near: '🟨', miss: '⬜' } as const;

export function shareText(o: { day: number; rows: DailyTiles[]; won: boolean; max: number; url: string }): string {
  const score = o.won ? `${o.rows.length}/${o.max}` : `X/${o.max}`;
  const grid = o.rows.map((r) => KEYS.map((k) => EMOJI[r[k].state]).join(''));
  return [`FC Solver Daily #${o.day} ${score}`, ...grid, o.url].join('\n');
}
