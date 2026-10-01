// FUT Gallery shapes shared by the catalogue, scoring, optimizer and API.
export type Grade = 'D' | 'C' | 'B' | 'A' | 'S';
export const GRADES: Grade[] = ['D', 'C', 'B', 'A', 'S'];

export type RarityKind = 'icon' | 'hero' | 'totw' | 'holo';

/** AND between keys, OR inside one. `assetIds` adds players a club filter would miss (Icons / Heroes of that club). */
export interface SetFilter {
  clubs?: number[];
  leagues?: number[];
  nations?: number[];
  rarities?: number[];
  kinds?: RarityKind[];
  gender?: number;
  assetIds?: number[];
  minRating?: number;
}

export interface GallerySet {
  id: string;
  name: string;
  category: 'league' | 'club' | 'nation' | 'rarity' | 'campaign';
  size: number;
  filter: SetFilter;
  grades: Record<Grade, number>;
  rewards?: Partial<Record<Grade, string>>;
}

/** One ledger item, flattened for scoring. `skillMoves` is EA's 0-based value (4 = 5 stars). */
export interface GalleryItem {
  id: number;
  assetId: number;
  rating: number;
  rareflag: number;
  kind: RarityKind | null;
  score: number;
  nation: number;
  league: number;
  club: number;
  gender: number;
  position: string;
  weakFoot: number;
  skillMoves: number;
  firstOwner: boolean;
}

export interface TagResult {
  id: string;
  count: number;
  pct: number;
  bonus: number;
}

export interface ScoredSet {
  base: number;
  tags: TagResult[];
  bonus: number;
  total: number;
  grade: Grade | null;
  filled: number;
  missing: number;
}
