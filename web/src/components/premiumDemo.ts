// Example Gallery sets, evolutions and objectives shown blurred behind the Premium offer on a Free account.
// Uses the landing page's self-hosted demo players and art (no account data, no API).
import type { Evo, GalleryGrade, GalleryResponse, GallerySetResult, Meta, ObjectiveGroupView, SquadsResponse } from '../api';
import { DEMO_SQUAD } from '../landing/demo';

import { DEMO_META } from '../landing/demo';

export { DEMO_META };

const GRADES: Record<GalleryGrade, number> = { D: 400, C: 800, B: 1300, A: 1900, S: 2600 };

const set = (
  id: string,
  name: string,
  category: GallerySetResult['category'],
  badge: GallerySetResult['badge'],
  score: number,
  missing = 0,
): GallerySetResult => {
  const reached = (Object.keys(GRADES) as GalleryGrade[]).filter((g) => score >= GRADES[g]);
  const grade = missing ? null : (reached.at(-1) ?? null);
  const nextGrade = (Object.keys(GRADES) as GalleryGrade[]).find((g) => score < GRADES[g]);
  return {
    id, name, category, badge, size: 11, filled: 11 - missing, missing, base: score, bonus: 0, score, grade,
    next: nextGrade ? { grade: nextGrade, need: GRADES[nextGrade] - score } : null,
    grades: GRADES, rewards: {}, tags: [], lineup: [],
  };
};

// set names are EA content, shown as EA writes them
export const DEMO_GALLERY: GalleryResponse = {
  fetchedAt: 0,
  ledgerSize: 1284,
  sets: [
    set('demo-barca', 'FC Barcelona', 'club', { kind: 'club', id: 241 }, 2710),
    set('demo-laliga', 'LALIGA EA SPORTS', 'league', { kind: 'league', id: 53 }, 2140),
    set('demo-seriea', 'Serie A Enilive', 'league', { kind: 'league', id: 31 }, 1520),
    set('demo-arsenal', 'Arsenal', 'club', { kind: 'club', id: 116009 }, 960),
    set('demo-mls', 'MLS', 'league', { kind: 'league', id: 39 }, 610),
    set('demo-roma', 'AS Roma', 'club', { kind: 'club', id: 52 }, 430, 2),
  ],
};

const HOUR = 3600e3;
const evo = (slotId: number, slotName: string, player: number, level: number, levelCount: number, hoursLeft: number | null): Evo => ({
  slotId, level, levelCount, slotName, player: DEMO_SQUAD[player],
  startedAt: null,
  endsAt: hoursLeft === null ? null : Date.now() + hoursLeft * HOUR,
  ready: hoursLeft === null,
});

// evolution names are EA content too
export const DEMO_EVOS: Evo[] = [
  evo(1, 'Prime Playmaker', 3, 2, 3, null),
  evo(2, 'Wing Wizard', 1, 1, 4, 5.4),
  evo(3, 'Wall of Steel', 5, 3, 3, 27),
  evo(4, 'Safe Hands', 6, 1, 2, 51),
];

/** Objectives behind the Premium offer; names resolve against DEMO_META. */
export const DEMO_OBJECTIVES: ObjectiveGroupView[] = [
  {
    id: 1, title: 'Squad Foundations', category: 'Campaigns', endsAt: null, awards: [],
    objectives: [
      { id: 11, name: 'Spanish Flair', description: 'Score 4 goals using a Spanish player in any FUT game mode.', progress: 1, target: 4, awards: [], done: false, conditions: [{ role: 'score', min: 1, filter: { nation: [45] } }] },
      { id: 12, name: 'Serie A Starters', description: 'Win 2 matches with at least 3 Serie A Enilive players in your starting 11.', progress: 0, target: 2, awards: [], done: false, conditions: [{ role: 'xi', min: 3, filter: { league: [31] } }] },
      { id: 13, name: 'Creator', description: 'Assist 3 goals using an English player.', progress: 2, target: 3, awards: [], done: false, conditions: [{ role: 'assist', min: 1, filter: { nation: [14] } }] },
      { id: 14, name: 'Play Matches', description: 'Play 5 matches in any FUT game mode.', progress: 3, target: 5, awards: [], done: false, conditions: [] },
    ],
  },
];

/** My Squads behind the Premium offer (squad names are the user's own, so plain examples). */
const F4231 = [[0, 0], [3, 3], [4, 5], [6, 5], [7, 7], [9, 10], [11, 10], [17, 18], [18, 18], [19, 18], [25, 25]];
const F433 = [[0, 0], [3, 3], [4, 5], [6, 5], [7, 7], [13, 14], [14, 14], [15, 14], [23, 23], [25, 25], [27, 27]];
const F442 = [[0, 0], [3, 3], [4, 5], [6, 5], [7, 7], [12, 12], [13, 14], [15, 14], [16, 16], [24, 25], [26, 25]];
const POS = ['GK', 'SW', 'RWB', 'RB', 'RCB', 'CB', 'LCB', 'LB', 'LWB', 'RDM', 'CDM', 'LDM', 'RM', 'RCM', 'CM', 'LCM', 'LM', 'RAM', 'CAM', 'LAM', 'RF', 'CF', 'LF', 'RW', 'RS', 'ST', 'LS', 'LW'];
const slots = (f: number[][]) => f.map(([uniqueId, typeId]) => ({ uniqueId, typeId, name: POS[uniqueId] }));
/** the landing's meta plus the formations the demo squads use */
export const DEMO_SQUADS_META: Meta = { ...DEMO_META, formations: { f4231: slots(F4231), f433: slots(F433), f442: slots(F442) } };
// the landing's self-hosted faces, on its one common gold card
const FACES = [211110, 252154, 277643, 257001, 278046, 158023, 20801];
const preview = (f: number[][], ratings: number[], shift: number) =>
  f.map(([, typeId], index) => ({ index, assetId: FACES[(index + shift) % FACES.length], rating: ratings[index] ?? 80, rareflag: 0, tier: 3 as const, position: POS[typeId] }));
const sq = (id: number, name: string, formation: string, active: boolean, rating: number, starters: number, bench: number, unknown = 0): SquadsResponse['squads'][number] => {
  const f = formation === 'f433' ? F433 : formation === 'f442' ? F442 : F4231;
  const ratings = Array.from({ length: 11 }, (_, i) => rating - 2 + ((i * 7 + id) % 5));
  return {
    id, name, formation, active, rating, chemistry: 33 - id, loaded: true, preview: preview(f, ratings, id),
    value: { starters, bench, total: starters + bench, unknown, loans: 0 },
  };
};
export const DEMO_SQUADS: SquadsResponse = {
  fetchedAt: 0,
  pricesAt: Date.now() - 2 * HOUR,
  calculating: false,
  squads: [
    sq(1, 'Weekend League', 'f4231', true, 88, 2_412_000, 386_500),
    sq(2, 'Rivals', 'f433', false, 86, 1_174_900, 212_300, 1),
    sq(3, 'Champions', 'f4231', false, 85, 641_200, 98_750),
    sq(4, 'Evo lab', 'f442', false, 79, 23_400, 6_100),
  ],
};
