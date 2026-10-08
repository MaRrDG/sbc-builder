// Shapes shared by the Daily game modules. Times are epoch ms.
export type CardType = 'normal' | 'icon' | 'hero';

/** A club the player's base card was seen at, and when (newest first in PlayerRow.baseClubs). */
export interface BaseClub { club: number; league: number; lastSeen: number }

export interface PlayerRow {
  assetId: number;
  name: string; // stage name (players.json `c`, else `f l`)
  fullName: string;
  nation: number;
  league: number;
  club: number; // current: most recent base club, else whatever card we saw first
  position: string;
  rating: number; // base card rating
  rareflag: number; // base card rarity (card art); special-only rows keep the special's
  cardType: CardType;
  baseClubs: BaseClub[];
  firstSeen: number;
  lastSeen: number;
}

/** What a guess is compared on. */
export type Hidden = Pick<PlayerRow, 'nation' | 'league' | 'club' | 'position' | 'rating' | 'cardType'>;

export type TileState = 'hit' | 'near' | 'miss';
export interface Tile { state: TileState; dir?: 'up' | 'down' }
export const TILE_KEYS = ['nation', 'league', 'club', 'position', 'rating', 'cardType'] as const;
export type Tiles = Record<(typeof TILE_KEYS)[number], Tile>;
