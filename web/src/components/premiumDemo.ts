// Example Gallery sets, evolutions and objectives shown blurred behind the Premium offer on a Free account.
// Uses the landing page's self-hosted demo players and art (no account data, no API).
import type { Evo, GalleryGrade, GalleryResponse, GallerySetResult, ObjectiveGroupView } from '../api';
import { DEMO_SQUAD } from '../landing/demo';

export { DEMO_META } from '../landing/demo';

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
      { id: 11, name: 'Spanish Flair', description: 'Score 4 goals using a Spanish player in any FUT game mode.', progress: 1, target: 4, awards: [], conditions: [{ role: 'score', min: 1, filter: { nation: [45] } }] },
      { id: 12, name: 'Serie A Starters', description: 'Win 2 matches with at least 3 Serie A Enilive players in your starting 11.', progress: 0, target: 2, awards: [], conditions: [{ role: 'xi', min: 3, filter: { league: [31] } }] },
      { id: 13, name: 'Creator', description: 'Assist 3 goals using an English player.', progress: 2, target: 3, awards: [], conditions: [{ role: 'assist', min: 1, filter: { nation: [14] } }] },
      { id: 14, name: 'Play Matches', description: 'Play 5 matches in any FUT game mode.', progress: 3, target: 5, awards: [], conditions: [] },
    ],
  },
];
