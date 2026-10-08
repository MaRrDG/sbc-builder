// Signed-out Daily state in localStorage: today's game (rows + signed state token) and finished plays.
import type { DailyAnswer, DailyRow, DailySilhouette } from '../api';
import type { LocalPlay } from './stats';

export interface SavedGame { day: number; state: string; rows: DailyRow[]; finished: boolean; won: boolean; silhouette?: DailySilhouette; answer?: DailyAnswer }

const GAME = 'sbc-daily-game';
const PLAYS = 'sbc-daily-plays';
const HELP = 'sbc-daily-help';

function read<T>(k: string): T | null {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}
function write(k: string, v: unknown) {
  try {
    localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
  } catch {
    /* private mode / blocked storage: the game still works, it just forgets */
  }
}

export const loadGame = (day: number): SavedGame | null => {
  const g = read<SavedGame>(GAME);
  return g && g.day === day && Array.isArray(g.rows) ? g : null;
};
export const saveGame = (g: SavedGame) => write(GAME, g);
export function clearGame() {
  try {
    localStorage.removeItem(GAME);
  } catch {
    /* blocked storage: nothing saved anyway */
  }
}
export const loadPlays = (): LocalPlay[] => {
  const p = read<LocalPlay[]>(PLAYS);
  return Array.isArray(p) ? p : [];
};
export function recordPlay(p: LocalPlay) {
  const all = loadPlays();
  if (all.some((x) => x.day === p.day)) return;
  write(PLAYS, [...all, p].slice(-400));
}
export const seenHelp = () => read<string>(HELP) !== null;
export const markHelpSeen = () => write(HELP, '1');
