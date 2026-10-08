// How close a guess is to the answer, tile by tile (see the spec table).
import { confederationOf, leagueCountry, positionLine } from './regions.js';
import type { Hidden, Tile, Tiles } from './types.js';

const hit: Tile = { state: 'hit' };
const miss: Tile = { state: 'miss' };
const near = (a: unknown, b: unknown): Tile => (a !== undefined && a === b ? { state: 'near' } : miss);

export function compareTiles(g: Hidden, a: Hidden): Tiles {
  const diff = a.rating - g.rating;
  const dir = diff > 0 ? 'up' : 'down';
  return {
    nation: g.nation === a.nation ? hit : near(confederationOf(g.nation), confederationOf(a.nation)),
    league: g.league === a.league ? hit : near(leagueCountry(g.league), leagueCountry(a.league)),
    club: g.club === a.club ? hit : miss,
    position: g.position === a.position ? hit : near(positionLine(g.position), positionLine(a.position)),
    rating: diff === 0 ? hit : { state: Math.abs(diff) <= 2 ? 'near' : 'miss', dir },
    cardType: g.cardType === a.cardType ? hit : miss,
  };
}
