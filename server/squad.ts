// Exact ports of the web app's squad rating, chemistry and SBC requirement checks
// (UTSquadEntity._calculateRating, UTSquadChemCalculatorUtils.calculate,
// UTSBCChallengeEntity.isRequirementMet) used to verify every solver result.
import type { ClubItem } from './ea.js';
import {
  type Meta, type ChemProfile, type ParamId, NATION, LEAGUE, CLUB, POSITION_IDS,
  LEGENDS_CLUB_ID, LEGENDS_LEAGUE_ID, HERO_CLUB_ID, HALL_OF_FUT_CLUB_ID, STAR_RATING_THRESHOLDS,
} from './meta.js';
import { Key, Scope, type Requirement } from './sbc.js';
import type { BrickSlot } from './layout.js';

export const FIELD_PLAYERS = 11;
const SLOT_MAX_CHEM = 3;

export interface Player {
  id: number;
  assetId: number;
  resourceId: number;
  name: string;
  rating: number;
  rareflag: number;
  tier: 1 | 2 | 3;
  positions: number[]; // position type ids
  preferredPosition: string;
  possiblePositions: string[];
  club: number;
  league: number;
  nation: number;
  untradeable: boolean;
  firstOwner: boolean;
  groups: number[];
  state: string;
  isLoan: boolean;
  guidAssetId?: string;
  minPrice: number;
  fullName: string;
  rarityName: string;
  attributes: number[]; // PAC SHO PAS DRI DEF PHY (GK: DIV HAN KIC REF SPE POS)
  skillMoves: number;
  weakFoot: number;
  foot: 'Right' | 'Left';
}

export function toPlayer(i: ClubItem, meta: Meta): Player {
  return {
    id: i.id,
    assetId: i.assetId,
    resourceId: i.resourceId,
    name: meta.players[i.assetId]?.name ?? `#${i.assetId}`,
    rating: i.rating,
    rareflag: i.rareflag,
    tier: i.rating <= 64 ? 1 : i.rating <= 74 ? 2 : 3,
    positions: i.possiblePositions.map((p) => POSITION_IDS[p]).filter((p) => p !== undefined),
    preferredPosition: i.preferredPosition,
    possiblePositions: i.possiblePositions,
    club: i.teamid,
    league: i.leagueId,
    nation: i.nation,
    untradeable: i.untradeable,
    firstOwner: (i.owners ?? 1) <= 1,
    groups: i.groups ?? [],
    state: i.itemState,
    isLoan: !!i.loansInfo,
    guidAssetId: i.guidAssetId,
    minPrice: i.marketDataMinPrice ?? 0,
    fullName: meta.players[i.assetId]?.full ?? '',
    rarityName: meta.names.rarity[i.rareflag] ?? '',
    attributes: i.attributeArray ?? [],
    skillMoves: (i.skillmoves ?? 0) + 1,
    weakFoot: i.weakfootabilitytypecode ?? 0,
    foot: i.preferredfoot === 2 ? 'Left' : 'Right',
  };
}

export const isLegend = (p: Player) => p.club === LEGENDS_CLUB_ID || p.league === LEGENDS_LEAGUE_ID;
export const isHero = (p: Player) => p.club === HERO_CLUB_ID;
const restrictedClub = (c: number) => c === LEGENDS_CLUB_ID || c === HERO_CLUB_ID || c === HALL_OF_FUT_CLUB_ID;
const restrictedLeague = (l: number) => l === LEGENDS_LEAGUE_ID;

export function normClub(meta: Meta, club: number): number {
  return meta.teamLinks[club] ?? club;
}

export function profileFor(p: Player, meta: Meta): ChemProfile {
  const rarity = meta.rarityProfiles[p.rareflag];
  if (rarity) return rarity;
  if (isLegend(p)) return meta.baseProfiles[3];
  if (isHero(p)) return meta.baseProfiles[2];
  return meta.baseProfiles[1];
}

/** Squad rating (float-calculation variant, the one enabled on live). */
export function squadRating(ratings: number[]): number {
  const a = FIELD_PLAYERS;
  const sum = ratings.reduce((s, r) => s + r, 0);
  const avg = Math.min(sum / a, 99);
  let total = sum;
  for (const r of ratings) if (r > avg) total += r - avg;
  return Math.min(Math.max(Math.floor(Math.round(total) / a), 0), 99);
}

export function starRating(rating: number): number {
  for (let e = 0; e < STAR_RATING_THRESHOLDS.length; e++) if (rating <= STAR_RATING_THRESHOLDS[e]) return e / 2;
  return 5;
}

export interface ChemResult {
  total: number;
  perSlot: number[];
}

/** slots[i] = player in slot i (or null), slotTypes[i] = position type id of that slot. */
export function chemistry(slots: (Player | null)[], slotTypes: number[], meta: Meta): ChemResult {
  type Acc = { contributions: number; missed: number };
  const maps: Record<ParamId, Map<number, Acc>> = { [NATION]: new Map(), [LEAGUE]: new Map(), [CLUB]: new Map() };
  const present: Record<ParamId, number[]> = { [NATION]: [], [LEAGUE]: [], [CLUB]: [] };
  const universal: Record<ParamId, { hit: number[]; miss: number[] }> = {
    [NATION]: { hit: [], miss: [] },
    [LEAGUE]: { hit: [], miss: [] },
    [CLUB]: { hit: [], miss: [] },
  };
  const inPos = slots.map((p, i) => !!p && p.positions.includes(slotTypes[i]));
  const groupOf = (p: Player, param: ParamId) =>
    param === CLUB ? normClub(meta, p.club) : param === LEAGUE ? p.league : p.nation;
  const add = (param: ParamId, id: number, v: number, hit: boolean) => {
    if (id <= 0) return;
    const m = maps[param];
    const acc = m.get(id) ?? { contributions: 0, missed: 0 };
    if (hit) acc.contributions += v;
    else acc.missed += v;
    m.set(id, acc);
  };

  slots.forEach((p, idx) => {
    if (!p) return;
    const prof = profileFor(p, meta);
    const hit = inPos[idx];
    for (const param of [CLUB, LEAGUE, NATION] as ParamId[]) {
      const rule = prof.rules[param];
      const v = rule?.value ?? 0;
      if (rule?.universal) {
        const sameRarity = slots.filter((q) => q && q.rareflag === p.rareflag);
        const a = sameRarity.filter((q) => inPos[slots.indexOf(q)]).length;
        const s = sameRarity.length - a;
        const anyPartner = slots.some((q, j) => q && inPos[j] && groupOf(q, param) === groupOf(p, param));
        if (anyPartner) universal[param].hit[p.rareflag] = a * v;
        else universal[param].miss[p.rareflag] = a * v;
        universal[param].miss[p.rareflag] = s * v;
      }
      const g = groupOf(p, param);
      const restricted = param === CLUB ? restrictedClub(p.club) : param === LEAGUE ? restrictedLeague(p.league) : false;
      if (restricted) continue;
      add(param, g, v, hit);
      if (!present[param].includes(g)) present[param].push(g);
    }
  });

  for (const param of [CLUB, LEAGUE, NATION] as ParamId[]) {
    const hit = universal[param].hit.reduce((s, x) => s + (x ?? 0), 0);
    const miss = universal[param].miss.reduce((s, x) => s + (x ?? 0), 0);
    for (const g of present[param]) {
      const acc = maps[param].get(g);
      if (acc) {
        acc.contributions += hit;
        acc.missed += miss;
      }
    }
  }

  const perSlot = slots.map((p, idx) => {
    if (!p) return 0;
    const hit = inPos[idx];
    const prof = profileFor(p, meta);
    let points = 0;
    if ((prof.maxChem || isLegend(p) || isHero(p)) && hit) points = SLOT_MAX_CHEM;
    for (const param of [CLUB, LEAGUE, NATION] as ParamId[]) {
      const acc = maps[param].get(groupOf(p, param));
      if (!acc || acc.contributions <= 0) continue;
      const th = meta.thresholds[param];
      const cap = th[th.length - 1].requirement;
      const c = Math.min(acc.contributions, cap);
      for (const t of th) if (c >= t.requirement && hit) points += t.points;
    }
    return Math.min(points, SLOT_MAX_CHEM);
  });
  return { total: perSlot.reduce((s, x) => s + x, 0), perSlot };
}

// ---- locked ("brick") slots --------------------------------------------------

/**
 * A custom brick as the chemistry calculator sees it: it contributes its club / league / nation
 * (canContribute = isValid() || isCustomBrick()) and gets chemistry like a player in position,
 * but has no rating (isValid() is false) and is skipped by requirement counters (getNonBrickSlots).
 */
export function brickPlayer(b: BrickSlot, slotType: number): Player {
  const positions = b.positions?.map((p) => POSITION_IDS[p]).filter((p) => p !== undefined) ?? [slotType];
  return {
    id: -1 - b.index, assetId: -1 - b.index, resourceId: 0, name: 'Locked', rating: 0, rareflag: b.rareflag, tier: 1,
    positions, preferredPosition: '', possiblePositions: b.positions ?? [], club: b.club, league: b.league, nation: b.nation,
    untradeable: true, firstOwner: false, groups: [], state: 'brick', isLoan: false, minPrice: 0, fullName: '', rarityName: '',
    attributes: [], skillMoves: 0, weakFoot: 0, foot: 'Right',
  };
}

/** Field slots the user has to fill: 11 minus every locked slot (getNumOfRequiredPlayers). */
export const requiredPlayers = (bricks: BrickSlot[]) => FIELD_PLAYERS - bricks.length;

// ---- requirement evaluation -------------------------------------------------

export function matchesKey(p: Player, key: number, values: number[]): boolean {
  switch (key) {
    case Key.NATION_ID:
      return values.includes(p.nation);
    case Key.LEAGUE_ID:
      return values.includes(p.league);
    case Key.CLUB_ID:
      return values.includes(p.club);
    case Key.PLAYER_RARITY:
      return values.includes(p.rareflag);
    case Key.PLAYER_RARITY_GROUP:
      return values.some((g) => p.groups.includes(g));
    case Key.PLAYER_LEVEL:
      return values.includes(p.tier);
    case Key.PLAYER_MIN_OVR:
      return p.rating >= values[0];
    case Key.PLAYER_MAX_OVR:
      return p.rating <= values[0];
    case Key.PLAYER_EXACT_OVR:
      return p.rating === values[0];
    case Key.PLAYER_TRADABILITY:
      return values[0] === 0 ? !p.untradeable : p.untradeable;
    case Key.LEGEND_COUNT:
      return isLegend(p);
    case Key.FIRST_OWNER_PLAYERS_COUNT:
      return p.firstOwner;
    default:
      return false;
  }
}

export function compare(scope: number, actual: number, target: number): boolean {
  return scope === Scope.GREATER ? actual >= target : scope === Scope.LOWER ? actual <= target : actual === target;
}

export interface SquadEval {
  rating: number;
  chemistry: number;
  perSlotChem: number[];
  results: { text: string; met: boolean; actual: number | string }[];
  allMet: boolean;
}

export function evaluate(
  slots: (Player | null)[],
  slotTypes: number[],
  reqs: Requirement[],
  op: 'AND' | 'OR',
  meta: Meta,
  bricks: BrickSlot[] = [],
): SquadEval {
  const brickAt = new Map(bricks.map((b) => [b.index, b]));
  // requirement counters and rating see only real players; brick slots stay empty for them
  const own = slots.map((p, i) => (brickAt.has(i) ? null : p));
  const players = own.filter((p): p is Player => !!p);
  const rating = squadRating(players.map((p) => p.rating));
  // chemistry also sees custom bricks, which take part like players
  const chemSlots = own.map((p, i) => {
    const b = brickAt.get(i);
    return b?.custom ? brickPlayer(b, slotTypes[i]) : p;
  });
  const chem = chemistry(chemSlots, slotTypes, meta);
  const countBy = (f: (p: Player) => number) => {
    const m = new Map<number, number>();
    for (const p of players) m.set(f(p), (m.get(f(p)) ?? 0) + 1);
    return m;
  };

  const results = reqs.map((r) => {
    let actual = 0;
    let target = r.count;
    const [key, vals] = [...r.keys][0] ?? [-1, []];
    if (r.combined) {
      actual = players.filter((p) => [...r.keys].every(([k, vs]) => matchesKey(p, k, vs))).length;
    } else {
      const v = vals[0];
      switch (key) {
        case Key.TEAM_RATING:
          actual = rating;
          target = v;
          break;
        case Key.TEAM_STAR_RATING:
          actual = starRating(rating);
          target = v / 2;
          break;
        case Key.CHEMISTRY_POINTS:
          actual = chem.total;
          target = v;
          break;
        case Key.ALL_PLAYERS_CHEMISTRY_POINTS:
          // web app: every slot but plain bricks must reach it, custom bricks included
          actual = chem.perSlot.filter((c, i) => chemSlots[i] && compare(r.scope, c, v)).length;
          target = FIELD_PLAYERS - bricks.filter((b) => !b.custom).length;
          return { text: r.text, met: actual === target, actual: `${actual}/${target}` };
        case Key.PLAYER_QUALITY: {
          const tiers = [...new Set(players.map((p) => p.tier))];
          actual = tiers.length === 0 ? -1
            : r.scope === Scope.GREATER ? Math.min(...tiers)
            : r.scope === Scope.LOWER ? Math.max(...tiers)
            : tiers.length === 1 ? tiers[0] : -1;
          target = v;
          break;
        }
        case Key.SAME_NATION_COUNT:
          actual = Math.max(0, ...countBy((p) => p.nation).values());
          target = v;
          break;
        case Key.SAME_LEAGUE_COUNT:
          actual = Math.max(0, ...countBy((p) => p.league).values());
          target = v;
          break;
        case Key.SAME_CLUB_COUNT:
          actual = Math.max(0, ...countBy((p) => normClub(meta, p.club)).values());
          target = v;
          break;
        case Key.NATION_COUNT:
          actual = countBy((p) => p.nation).size;
          target = v;
          break;
        case Key.LEAGUE_COUNT:
          actual = countBy((p) => p.league).size;
          target = v;
          break;
        case Key.CLUB_COUNT:
          actual = countBy((p) => normClub(meta, p.club)).size;
          target = v;
          break;
        case Key.LEGEND_COUNT:
        case Key.FIRST_OWNER_PLAYERS_COUNT:
          actual = players.filter((p) => matchesKey(p, key, vals)).length;
          target = v;
          break;
        case -1:
          actual = players.length;
          break;
        default:
          actual = players.filter((p) => matchesKey(p, key, vals)).length;
      }
    }
    return { text: r.text, met: compare(r.scope, actual, target), actual };
  });

  const full = players.length === requiredPlayers(bricks);
  const allMet = full && (op === 'OR' ? results.some((x) => x.met) : results.every((x) => x.met));
  return { rating, chemistry: chem.total, perSlotChem: chem.perSlot, results, allMet };
}
