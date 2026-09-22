// Turns EA's flat elgReq list into structured requirements (mirrors UTSBCEligibilityDTO).
import type { EligibilityReq } from './ea.js';
import type { Meta } from './meta.js';

export const Key = {
  TEAM_STAR_RATING: 0,
  PLAYER_COUNT: 2,
  PLAYER_QUALITY: 3,
  SAME_NATION_COUNT: 4,
  SAME_LEAGUE_COUNT: 5,
  SAME_CLUB_COUNT: 6,
  NATION_COUNT: 7,
  LEAGUE_COUNT: 8,
  CLUB_COUNT: 9,
  NATION_ID: 10,
  LEAGUE_ID: 11,
  CLUB_ID: 12,
  SCOPE: 13,
  LEGEND_COUNT: 15,
  PLAYER_LEVEL: 17,
  PLAYER_RARITY: 18,
  TEAM_RATING: 19,
  PLAYER_COUNT_COMBINED: 21,
  PLAYER_RARITY_GROUP: 25,
  PLAYER_MIN_OVR: 26,
  PLAYER_EXACT_OVR: 27,
  PLAYER_MAX_OVR: 28,
  FIRST_OWNER_PLAYERS_COUNT: 30,
  PLAYER_TRADABILITY: 33,
  CHEMISTRY_POINTS: 35,
  ALL_PLAYERS_CHEMISTRY_POINTS: 36,
} as const;

export const Scope = { GREATER: 0, LOWER: 1, EXACT: 2 } as const;
export type ScopeT = (typeof Scope)[keyof typeof Scope];

export interface Requirement {
  slot: number;
  scope: ScopeT;
  count: number; // -1 when the requirement has no explicit player count
  keys: Map<number, number[]>; // eligibility key -> accepted values
  combined: boolean;
  text: string;
}

const COUNT_KEYS: Set<number> = new Set([Key.PLAYER_COUNT, Key.PLAYER_COUNT_COMBINED]);

export function parseRequirements(reqs: EligibilityReq[], meta: Meta): Requirement[] {
  const bySlot = new Map<number, EligibilityReq[]>();
  for (const r of reqs) {
    const list = bySlot.get(r.eligibilitySlot) ?? [];
    list.push(r);
    bySlot.set(r.eligibilitySlot, list);
  }
  const out: Requirement[] = [];
  for (const [slot, list] of [...bySlot].sort((a, b) => a[0] - b[0])) {
    const req: Requirement = { slot, scope: Scope.GREATER, count: -1, keys: new Map(), combined: false, text: '' };
    for (const r of list) {
      if (r.eligibilityKey === Key.SCOPE) req.scope = r.eligibilityValue as ScopeT;
      else if (COUNT_KEYS.has(r.eligibilityKey)) req.count = r.eligibilityValue;
      else {
        const vals = req.keys.get(r.eligibilityKey) ?? [];
        vals.push(r.eligibilityValue);
        req.keys.set(r.eligibilityKey, vals);
      }
    }
    req.combined = req.keys.size > 1;
    req.text = describe(req, meta);
    out.push(req);
  }
  return out;
}

function nameFor(key: number, v: number, meta: Meta): string {
  switch (key) {
    case Key.NATION_ID:
      return meta.names.nation[v] ?? `Nation ${v}`;
    case Key.LEAGUE_ID:
      return meta.names.league[v] ?? `League ${v}`;
    case Key.CLUB_ID:
      return meta.names.club[v] ?? `Club ${v}`;
    case Key.PLAYER_RARITY:
      return meta.names.rarity[v] ?? `Rarity ${v}`;
    case Key.PLAYER_RARITY_GROUP:
      return meta.names.group[v] ?? `Group ${v}`;
    case Key.PLAYER_LEVEL:
    case Key.PLAYER_QUALITY:
      return ['', 'Bronze', 'Silver', 'Gold', 'Special'][v] ?? `Level ${v}`;
    case Key.PLAYER_MIN_OVR:
      return `Min. ${v} OVR`;
    case Key.PLAYER_MAX_OVR:
      return `Max. ${v} OVR`;
    case Key.PLAYER_EXACT_OVR:
      return `Exactly ${v} OVR`;
    case Key.PLAYER_TRADABILITY:
      return v === 1 ? 'Untradeable' : 'Tradeable';
    default:
      return String(v);
  }
}

const SCOPE_WORD = ['Min.', 'Max.', 'Exactly'];

function describe(r: Requirement, meta: Meta): string {
  const s = SCOPE_WORD[r.scope];
  const [key, vals] = [...r.keys][0] ?? [-1, []];
  const v = vals[0];
  const names = (k: number, vs: number[]) => vs.map((x) => nameFor(k, x, meta)).join(' / ');
  const players = (n: number) => `${s} ${n} Player${n === 1 ? '' : 's'}`;

  if (r.combined) {
    const parts = [...r.keys].map(([k, vs]) => names(k, vs));
    return `${parts.join(' + ')}: ${players(r.count)}`;
  }
  switch (key) {
    case Key.TEAM_RATING:
      return `Team Rating: ${s} ${v}`;
    case Key.TEAM_STAR_RATING:
      return `Team Rating: ${s} ${v / 2} Stars`;
    case Key.CHEMISTRY_POINTS:
      return `Total Chemistry: ${s} ${v}`;
    case Key.ALL_PLAYERS_CHEMISTRY_POINTS:
      return `Chemistry Points on Each Player: ${s} ${v}`;
    case Key.PLAYER_QUALITY:
      return `Player Quality: ${s} ${nameFor(key, v, meta)}`;
    case Key.SAME_NATION_COUNT:
      return `Players from the same Nation: ${s} ${v}`;
    case Key.SAME_LEAGUE_COUNT:
      return `Players from the same League: ${s} ${v}`;
    case Key.SAME_CLUB_COUNT:
      return `Players from the same Club: ${s} ${v}`;
    case Key.NATION_COUNT:
      return `Nationalities in Squad: ${s} ${v}`;
    case Key.LEAGUE_COUNT:
      return `Leagues in Squad: ${s} ${v}`;
    case Key.CLUB_COUNT:
      return `Clubs in Squad: ${s} ${v}`;
    case Key.LEGEND_COUNT:
      return `Icon Players: ${s} ${v}`;
    case Key.FIRST_OWNER_PLAYERS_COUNT:
      return `First Owned Players: ${s} ${v}`;
    case -1:
      return `Number of Players in the Squad: ${r.count}`;
    default:
      return `${names(key, vals)}: ${players(r.count)}`;
  }
}

/** JSON-friendly form for the frontend. */
export function serializeRequirement(r: Requirement) {
  return { slot: r.slot, scope: r.scope, count: r.count, keys: Object.fromEntries(r.keys), combined: r.combined, text: r.text };
}
