// A fixed example squad for the landing page (no account, no API). Art is self-hosted under
// web/public/landing, in the same folder layout Card's cardArt() builds from contentBase.
import type { Meta, Player } from '../api';

export const DEMO_META: Meta = {
  names: {
    nation: { 14: 'England', 45: 'Spain', 27: 'Italy', 42: 'Scotland', 52: 'Argentina', 21: 'Germany' },
    league: { 13: 'Premier League', 2216: 'Barclays Women\'s Super League', 53: 'LALIGA EA SPORTS', 31: 'Serie A Enilive', 19: 'Bundesliga', 2218: 'Arkema Première Ligue' },
    club: { 1: 'Arsenal', 116009: 'Arsenal', 241: 'FC Barcelona', 115845: 'Bergamo Calcio', 116033: 'OL Lyonnes', 52: 'AS Roma', 36: 'VfB Stuttgart' },
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

export const DEMO_SQUAD: Player[] = [
  p(244176, 'Undav', 'Deniz Undav', 85, 'ST', ['ST', 'CAM'], 36, 19, 21),
  p(246669, 'Saka', 'Bukayo Saka', 87, 'RW', ['RW', 'RM'], 1, 13, 14),
  p(257001, 'Kelly', 'Chloe Kelly', 86, 'LM', ['LM', 'RM', 'LW', 'RW'], 116009, 2216, 14),
  p(211110, 'Dybala', 'Paulo Dybala', 85, 'CAM', ['CAM', 'ST'], 52, 31, 52),
  p(245879, 'Weir', 'Caroline Weir', 86, 'CAM', ['CAM', 'CM', 'CDM'], 116033, 2218, 42),
  p(278046, 'Pau Cubarsí', 'Pau Cubarsí', 86, 'CB', ['CB'], 241, 53, 45),
  p(252154, 'Carnesecchi', 'Marco Carnesecchi', 86, 'GK', ['GK'], 115845, 31, 27),
];

/** SBC names for the "How it works" demo; EA content, so shown as EA writes it (not translated). */
export const DEMO_SETS = ['Marquee Matchups', 'Premier League Upgrade', 'Daily Bronze Upgrade', 'Hybrid Leagues', 'First XI'];
