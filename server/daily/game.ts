// One game (daily or practice): which guesses are allowed and what the browser may see. Before the
// game ends the view never carries the answer's id, name or portrait, only tiles and, after 3 misses,
// the silhouette (rating, position, rarity, card type).
import { compareTiles } from './compare.js';
import type { CardType, PlayerRow, Tiles } from './types.js';

export const MAX_GUESSES = 5;
export const SILHOUETTE_AFTER = 3;
export type GuessError = 'dailyFinished' | 'dailyRepeat' | 'dailyUnknownPlayer';

export interface Progress { guesses: number[]; won: boolean; finished: boolean }
export interface PublicPlayer { id: number; name: string; nation: number; league: number; club: number; position: string; rating: number; cardType: CardType }
export interface Answer extends PublicPlayer { fullName: string; rareflag: number }
export interface Silhouette { rating: number; position: string; rareflag: number; cardType: CardType }
export interface GuessRow { player: PublicPlayer; tiles: Tiles }
export interface GameView { rows: GuessRow[]; finished: boolean; won: boolean; silhouette?: Silhouette; answer?: Answer }

export function progressOf(guesses: number[], answer: number): Progress {
  const won = guesses.includes(answer);
  return { guesses, won, finished: won || guesses.length >= MAX_GUESSES };
}

export function applyGuess(guesses: number[], guess: number, answer: number, known: (id: number) => boolean): Progress | { error: GuessError } {
  if (progressOf(guesses, answer).finished) return { error: 'dailyFinished' };
  if (!known(guess)) return { error: 'dailyUnknownPlayer' };
  if (guesses.includes(guess)) return { error: 'dailyRepeat' };
  return progressOf([...guesses, guess], answer);
}

export const toPublic = (r: PlayerRow): PublicPlayer => ({
  id: r.assetId, name: r.name, nation: r.nation, league: r.league, club: r.club, position: r.position, rating: r.rating, cardType: r.cardType,
});

export const guessRow = (g: PlayerRow, a: PlayerRow): GuessRow => ({ player: toPublic(g), tiles: compareTiles(g, a) });

export function gameView(p: Progress, answer: PlayerRow, lookup: (id: number) => PlayerRow | undefined): GameView {
  const rows = p.guesses.flatMap((id) => {
    const g = lookup(id);
    return g ? [guessRow(g, answer)] : [];
  });
  const view: GameView = { rows, finished: p.finished, won: p.won };
  if (p.finished) view.answer = { ...toPublic(answer), fullName: answer.fullName, rareflag: answer.rareflag };
  else if (p.guesses.length >= SILHOUETTE_AFTER)
    view.silhouette = { rating: answer.rating, position: answer.position, rareflag: answer.rareflag, cardType: answer.cardType };
  return view;
}
