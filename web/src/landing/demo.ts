// A fixed example squad for the landing page (no account, no API). Art is self-hosted under
// web/public/landing, in the same folder layout Card's cardArt() builds from contentBase.
import type { Meta, Player } from '../api';

export const DEMO_META: Meta = {
  names: {
    nation: { 14: 'England', 45: 'Spain', 27: 'Italy', 38: 'Portugal', 52: 'Argentina' },
    league: { 2216: 'Barclays Women\'s Super League', 53: 'LALIGA EA SPORTS', 31: 'Serie A Enilive', 39: 'MLS', 350: 'ROSHN Saudi League' },
    club: { 116009: 'Arsenal', 241: 'FC Barcelona', 115845: 'Bergamo Calcio', 52: 'AS Roma', 112893: 'Inter Miami CF', 112139: 'Al Nassr' },
    rarity: { 0: 'Common' },
  },
  formations: {},
  rarities: {
    0: {
      guid: '929f3299-a61e-4ff1-abda-7663f1c835db',
      levels: true,
      colors: [4073500, 15115371, 10249286, 1975594, 12698831, 5662576, 2958352, 14794333, 9073730],
      lgColorIndices: [1, 1, 1, 1, 1, 1, 2, 3, 1],
    },
  },
  contentBase: '/landing',
};

const p = (assetId: number, name: string, fullName: string, rating: number, pos: string, possible: string[], club: number, league: number, nation: number): Player => ({
  id: assetId, assetId, resourceId: assetId, name, fullName, rating, rareflag: 0, tier: 3,
  preferredPosition: pos, possiblePositions: possible, club, league, nation,
  untradeable: true, state: 'free', isLoan: false, rarityName: 'Gold', attributes: [], skillMoves: 3, weakFoot: 3, foot: 'Right',
});

// Order = the pitch spots in Hero / Steps (ST, RW, LW, CAM, CAM, CB, GK). Ratings from EA's player
// database; the hero requirements (LALIGA 2, Argentina 2, Serie A 2) must stay met by this squad.
export const DEMO_SQUAD: Player[] = [
  p(20801, 'Ronaldo', 'Cristiano Ronaldo', 84, 'ST', ['ST'], 112139, 350, 38),
  p(277643, 'Lamine Yamal', 'Lamine Yamal', 90, 'RW', ['RW', 'RM'], 241, 53, 45),
  p(257001, 'Kelly', 'Chloe Kelly', 86, 'LM', ['LM', 'RM', 'LW', 'RW'], 116009, 2216, 14),
  p(158023, 'Messi', 'Lionel Messi', 89, 'CAM', ['CAM', 'RW', 'CF'], 112893, 39, 52),
  p(211110, 'Dybala', 'Paulo Dybala', 85, 'CAM', ['CAM', 'ST'], 52, 31, 52),
  p(278046, 'Pau Cubarsí', 'Pau Cubarsí', 86, 'CB', ['CB'], 241, 53, 45),
  p(252154, 'Carnesecchi', 'Marco Carnesecchi', 86, 'GK', ['GK'], 115845, 31, 27),
];

/** SBC names for the "How it works" demo; EA content, so shown as EA writes it (not translated). */
export const DEMO_SETS = ['Marquee Matchups', 'Premier League Upgrade', 'Daily Bronze Upgrade', 'Hybrid Leagues', 'First XI'];
