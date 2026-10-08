// Objective conditions -> the CP-SAT "play" problem, and the checks we trust instead of the solver.
import { NATION, LEAGUE, CLUB, POSITION_IDS, type Meta, type ParamId } from '../meta.js';
import type { Player } from '../squad.js';
import { playerChem } from '../solver.js';
import type { Condition, Filter, Stat } from './types.js';

/**
 * One chemistry point is worth this many rating points in the play objective. Tuned on a real club
 * (2026-10-08): 0 gives 11-17 chem, 2 / 4 / 6 all give 30-33 chem at the same team rating (84-85, no
 * 85+ swapped for a sub-82); 2 sits right at 30 on some picks, 4 keeps a margin without costing rating.
 */
export const CHEM_WEIGHT = 4;

const T = POSITION_IDS;
/** Slots where a player scores: strikers, forwards, wingers, CAM. */
export const SCORE_TYPES = [T.ST, T.CF, T.LF, T.RF, T.LW, T.RW, T.CAM];
/** Slots where a player creates: the scorers plus wide and central midfielders. */
export const ASSIST_TYPES = [...SCORE_TYPES, T.LM, T.RM, T.CM];
const STAT_INDEX: Record<Stat, number> = { PAC: 0, SHO: 1, PAS: 2, DRI: 3, DEF: 4, PHY: 5 };

export function matchesFilter(p: Player, f: Filter): boolean {
  if (f.nation && !f.nation.includes(p.nation)) return false;
  if (f.league && !f.league.includes(p.league)) return false;
  if (f.club && !f.club.includes(p.club)) return false;
  if (f.rarity && !f.rarity.includes(p.rareflag)) return false;
  if (f.position && (f.preferredOnly ? p.preferredPosition !== f.position : !p.possiblePositions.includes(f.position))) return false;
  if (f.attr) {
    if (p.preferredPosition === 'GK') return false; // GK attributes are DIV/HAN/KIC/REF/SPE/POS
    if ((p.attributes[STAT_INDEX[f.attr.stat]] ?? 0) < f.attr.min) return false;
  }
  return true;
}

/** Slot indexes of the formation where this condition's player has to stand. */
export function roleSlots(c: Condition, slotTypes: number[]): number[] {
  const types =
    c.filter.position !== undefined ? [T[c.filter.position]] : c.role === 'score' ? SCORE_TYPES : c.role === 'assist' ? ASSIST_TYPES : null;
  return slotTypes.flatMap((t, s) => (types === null || types.includes(t) ? [s] : []));
}

/** The club as a playing squad sees it: storage is out, loans are in, the user's exclusions apply. */
/** Who may play: club players (no storage), not excluded, not over max OVR; loans only when asked (they run out). */
export function playPool(players: Player[], o: { excludeIds: number[]; maxRating: number; includeLoans?: boolean }): Player[] {
  const excluded = new Set(o.excludeIds);
  return players.filter((p) => !p.inStorage && !excluded.has(p.id) && p.rating <= o.maxRating && (o.includeLoans || !p.isLoan));
}

type Chem = ReturnType<typeof playerChem>;

export function buildPlayProblem(
  pool: Player[], slotTypes: number[], conds: Condition[], meta: Meta, timeLimit: number,
  chem: (p: Player) => Chem = (p) => playerChem(p, meta), chemWeight = CHEM_WEIGHT,
  /** objective id per condition: soft problem, cover as many objectives as possible (all conditions of one id) */
  groups?: number[],
) {
  const matching = (f: Filter) => pool.flatMap((p, i) => (matchesFilter(p, f) ? [i] : []));
  const constraints = conds.map((c, i) => ({
    ...(c.role === 'xi' && c.filter.position === undefined
      ? { kind: 'count', op: '>=', value: c.min, players: matching(c.filter) }
      : { kind: 'slotCount', op: '>=', value: c.min, players: matching(c.filter), slots: roleSlots(c, slotTypes) }),
    ...(groups ? { group: groups[i] } : {}),
  }));
  return {
    mode: 'play',
    ...(groups ? { soft: true } : {}),
    chemWeight,
    players: pool.map((p) => ({
      rating: p.rating,
      asset: p.assetId,
      slots: slotTypes.flatMap((t, s) => (p.positions.includes(t) ? [s] : [])),
      fixed: null,
      ...chem(p),
    })),
    nSlots: slotTypes.length,
    blocked: [],
    bricks: [],
    thresholds: Object.fromEntries(
      ([NATION, LEAGUE, CLUB] as ParamId[]).map((param) => [param, (meta.thresholds[param] ?? []).map((t) => [t.requirement, t.points])]),
    ),
    rating: {},
    needsChem: true,
    constraints,
    timeLimit,
    workers: 8,
  };
}

/** Our own check that the solver's XI can be played: every slot filled, in position, no card twice. */
export function playableXi(slots: (Player | null)[], slotTypes: number[]): slots is Player[] {
  const assets = new Set<number>();
  return slots.every((p, s) => {
    if (!p || !p.positions.includes(slotTypes[s]) || assets.has(p.assetId)) return false;
    assets.add(p.assetId);
    return true;
  });
}

export interface Cover {
  condition: Condition;
  itemIds: number[]; // players in the squad that satisfy it
  met: boolean;
}

/** The squad re-checked against every condition (in-position players in the role's slots). */
export function checkCovers(slots: (Player | null)[], slotTypes: number[], conds: Condition[]): Cover[] {
  return conds.map((c) => {
    const allowed = new Set(roleSlots(c, slotTypes));
    const itemIds = slots.flatMap((p, s) =>
      p && allowed.has(s) && p.positions.includes(slotTypes[s]) && matchesFilter(p, c.filter) ? [p.id] : [],
    );
    return { condition: c, itemIds, met: itemIds.length >= c.min };
  });
}

/**
 * Why an objective is out. objectiveId: the uncovered objective (absent on the old whole-problem diagnosis).
 * noSlot: the formation has no slot where the condition can be met (formations: up to 2 that have one);
 * noMatch: the slots exist, nobody in the pool fits them; combo: proven not to fit with the other picks;
 * selfClash: proven that its own conditions cannot all be met at once here; timeout: not fitted, nothing proven.
 */
export type PlayReason =
  | { code: 'noMatch'; condition: Condition; objectiveId?: number }
  | { code: 'noSlot'; condition: Condition; formations: string[]; objectiveId?: number }
  | { code: 'combo' | 'selfClash' | 'timeout'; objectiveId?: number };

/** How many slots of formation a would have to change position to become formation b. */
function slotChanges(a: number[], b: number[]): number {
  const left = [...b];
  let same = 0;
  for (const t of a) {
    const k = left.indexOf(t);
    if (k >= 0) {
      left.splice(k, 1);
      same++;
    }
  }
  return a.length - same;
}

/** Why there is no squad: a condition with no slot in the formation or nobody to meet it, else the conditions clash. */
export function diagnosePlay(pool: Player[], slotTypes: number[], conds: Condition[], formations: Record<string, number[]> = {}): PlayReason[] {
  const out: PlayReason[] = [];
  for (const c of conds) {
    const slots = roleSlots(c, slotTypes);
    if (slots.length === 0) {
      // formations that have the slot, closest to this one first (fewest slots to change)
      const others = Object.entries(formations)
        .filter(([, types]) => roleSlots(c, types).length > 0)
        .map(([f, types]) => ({ f, d: slotChanges(slotTypes, types) }))
        .sort((a, b) => a.d - b.d)
        .map((x) => x.f);
      out.push({ code: 'noSlot', condition: c, formations: others.slice(0, 2) });
      continue;
    }
    const fits = pool.filter((p) => matchesFilter(p, c.filter) && slots.some((s) => p.positions.includes(slotTypes[s])));
    if (new Set(fits.map((p) => p.assetId)).size < c.min) out.push({ code: 'noMatch', condition: c });
  }
  return out.length ? out : [{ code: 'combo' }];
}

/**
 * Why each objective a squad leaves uncovered (some condition not met) is out, groups[i] being the objective of
 * conds[i]: noSlot / noMatch for a condition, else (only when the solve is proven optimal) combo if another
 * objective is covered, selfClash if none is (then each one fails even alone); not optimal: timeout.
 */
export function uncoveredReasons(
  pool: Player[], slotTypes: number[], conds: Condition[], groups: number[], covers: Cover[],
  o: { optimal: boolean; formations?: Record<string, number[]> },
): PlayReason[] {
  const ids = [...new Set(groups)];
  const covered = (id: number) => conds.every((_c, i) => groups[i] !== id || covers[i].met);
  const anyCovered = ids.some(covered);
  return ids.flatMap((objectiveId): PlayReason[] => {
    if (covered(objectiveId)) return [];
    const own = diagnosePlay(pool, slotTypes, conds.filter((_c, i) => groups[i] === objectiveId), o.formations);
    const why = own[0].code === 'combo' ? [{ code: !o.optimal ? 'timeout' : anyCovered ? 'combo' : 'selfClash' } as PlayReason] : own;
    return why.map((r) => ({ ...r, objectiveId }));
  });
}
