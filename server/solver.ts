// Builds an SBC problem from club players + requirements and solves it with CP-SAT
// (solver/cpsat.py). Every result is re-checked with the exact web-app formulas.
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { Meta } from './meta.js';
import { NATION, LEAGUE, CLUB, STAR_RATING_THRESHOLDS, LEGENDS_LEAGUE_ID, type ParamId } from './meta.js';
import { Key, Scope, type Requirement } from './sbc.js';
import {
  type Player, type SquadEval, FIELD_PLAYERS, evaluate, matchesKey, normClub, profileFor, isLegend, isHero, squadRating,
  brickPlayer, requiredPlayers,
} from './squad.js';
import type { BrickSlot, ChallengeLayout } from './layout.js';
import { ROOT } from './store.js';

const PYTHON = process.env.SOLVER_PYTHON ?? join(ROOT, 'solver/.venv/bin/python');
const SCRIPT = join(ROOT, 'solver/cpsat.py');

export interface SolveOptions {
  excludeIds: number[]; // never use these club items
  excludeActiveSquad: boolean; // active squad starting XI
  excludeSquadReserves: boolean; // active squad subs / reserves
  excludeNations: number[];
  excludeLeagues: number[];
  excludeClubs: number[];
  onlyUntradeable: boolean;
  maxRating: number; // don't use players above this OVR (99 = no limit)
  excludeSpecial: boolean; // keep promo / special cards out
  keepPlaced: boolean; // players already placed in the web app stay where they are
}

export interface Solution {
  slots: (Player | null)[]; // null on locked slots
  fixedIds: number[]; // players kept from the web app's squad
  placedCount: number; // placed in the web app and still in the club
  missingPlaced: number[]; // placed in the web app but no longer in the club
  eval: SquadEval;
  cost: number;
  status: string;
}

const isSpecial = (p: Player) => p.rareflag > 1;
const RESTRICTED_CLUBS = new Set([112658, 114605, 132794]);

/** Rough "how much would it hurt to lose this card" score; the solver minimises the sum. */
export function playerCost(p: Player): number {
  const r = p.rating;
  let c = r < 65 ? 1 + (r - 40) * 0.02 : r < 75 ? 2 + (r - 65) * 0.1 : 4 * Math.pow(2, (r - 75) / 2.2);
  if (!p.untradeable) c *= 1.35; // prefer burning untradeables
  if (p.inStorage) c *= 0.8; // storage has little room and holds duplicates: use it first
  if (isSpecial(p)) c *= 4;
  if (isLegend(p) || isHero(p)) c *= 6;
  return Math.round(c * 100) / 100;
}

export interface ActiveSquad {
  starters: number[];
  bench: number[];
}

export function eligiblePool(players: Player[], reqs: Requirement[], o: SolveOptions, squad: ActiveSquad | null): Player[] {
  const excluded = new Set(o.excludeIds);
  if (o.excludeActiveSquad) squad?.starters.forEach((id) => excluded.add(id));
  if (o.excludeSquadReserves) squad?.bench.forEach((id) => excluded.add(id));
  const nations = new Set(o.excludeNations);
  const leagues = new Set(o.excludeLeagues);
  const clubs = new Set(o.excludeClubs);
  let pool = players.filter(
    (p) =>
      !p.isLoan &&
      !excluded.has(p.id) &&
      // without a synced squad fall back to the item state EA puts on squad players
      !(!squad && o.excludeActiveSquad && p.state === 'inGame') &&
      !(!squad && o.excludeSquadReserves && p.state === 'IN_GAME_SIDELINES') &&
      !nations.has(p.nation) &&
      !leagues.has(p.league) &&
      !clubs.has(p.club) &&
      !(o.onlyUntradeable && !p.untradeable) &&
      !(o.excludeSpecial && isSpecial(p)) &&
      p.rating <= o.maxRating,
  );
  // "Player Quality: Min/Max X" applies to every player -> plain filter.
  for (const r of reqs) {
    const q = r.keys.get(Key.PLAYER_QUALITY);
    if (!q || r.combined) continue;
    const v = q[0];
    pool = pool.filter((p) => (r.scope === Scope.GREATER ? p.tier >= v : r.scope === Scope.LOWER ? p.tier <= v : p.tier === v));
  }
  return pool;
}

function ratingBounds(reqs: Requirement[]): { min: number | null; max: number | null } {
  let min: number | null = null;
  let max: number | null = null;
  for (const r of reqs) {
    if (r.combined) continue;
    let v: number | undefined;
    if (r.keys.has(Key.TEAM_RATING)) v = r.keys.get(Key.TEAM_RATING)![0];
    else if (r.keys.has(Key.TEAM_STAR_RATING)) {
      const half = r.keys.get(Key.TEAM_STAR_RATING)![0];
      if (r.scope !== Scope.LOWER) v = half > 0 ? STAR_RATING_THRESHOLDS[half - 1] + 1 : 0;
      else v = STAR_RATING_THRESHOLDS[half];
    } else continue;
    if (r.scope !== Scope.LOWER) min = Math.max(min ?? 0, v);
    if (r.scope !== Scope.GREATER) max = Math.min(max ?? 99, v);
  }
  return { min, max };
}

const OP = ['>=', '<=', '='] as const;

function buildProblem(
  pool: Player[], slotTypes: number[], reqs: Requirement[], meta: Meta, timeLimit: number,
  bricks: BrickSlot[] = [], fixed: Map<number, number> = new Map(),
) {
  const groupOf = (p: Player, param: ParamId) =>
    param === CLUB ? normClub(meta, p.club) : param === LEAGUE ? p.league : p.nation;
  const chemOf = (p: Player) => {
    const prof = profileFor(p, meta);
    const contrib = (param: ParamId) => {
      if (param === CLUB && RESTRICTED_CLUBS.has(p.club)) return 0;
      if (param === LEAGUE && p.league === LEGENDS_LEAGUE_ID) return 0;
      return prof.rules[param]?.value ?? 0;
    };
    return {
      groups: { 1: groupOf(p, NATION), 2: groupOf(p, LEAGUE), 3: groupOf(p, CLUB) },
      contrib: { 1: contrib(NATION), 2: contrib(LEAGUE), 3: contrib(CLUB) },
      maxChem: prof.maxChem || isLegend(p) || isHero(p),
    };
  };
  const locked = new Set(bricks.map((b) => b.index));
  const slotOfPlayer = new Map([...fixed].map(([slot, id]) => [id, slot]));

  const players = pool.map((p) => ({
    rating: p.rating,
    cost: playerCost(p),
    asset: p.assetId,
    slots: slotTypes.flatMap((t, s) => (!locked.has(s) && p.positions.includes(t) ? [s] : [])),
    fixed: slotOfPlayer.get(p.id) ?? null,
    ...chemOf(p),
  }));
  // custom bricks: always there, in chemistry only
  const brickChem = bricks
    .filter((b) => b.custom)
    .map((b) => {
      const bp = brickPlayer(b, slotTypes[b.index]);
      return { slot: b.index, inpos: bp.positions.includes(slotTypes[b.index]), ...chemOf(bp) };
    });

  const matching = (f: (p: Player) => boolean) => pool.flatMap((p, i) => (f(p) ? [i] : []));
  const constraints: Record<string, unknown>[] = [];
  let needsChem = false;
  for (const r of reqs) {
    const op = OP[r.scope];
    const [key, vals] = [...r.keys][0] ?? [-1, []];
    const v = vals[0];
    if (r.combined) {
      constraints.push({ kind: 'count', op, value: r.count, players: matching((p) => [...r.keys].every(([k, vs]) => matchesKey(p, k, vs))) });
      continue;
    }
    switch (key) {
      case Key.TEAM_RATING:
      case Key.TEAM_STAR_RATING:
      case Key.PLAYER_QUALITY:
      case -1:
        break; // rating bounds / pool filter
      case Key.CHEMISTRY_POINTS:
        needsChem = true;
        constraints.push({ kind: 'chemTotal', op, value: v });
        break;
      case Key.ALL_PLAYERS_CHEMISTRY_POINTS:
        needsChem = true;
        constraints.push({ kind: 'chemEach', op, value: v });
        break;
      case Key.SAME_NATION_COUNT:
      case Key.SAME_LEAGUE_COUNT:
      case Key.SAME_CLUB_COUNT:
        constraints.push({ kind: 'sameMax', op, value: v, param: String(key === Key.SAME_NATION_COUNT ? NATION : key === Key.SAME_LEAGUE_COUNT ? LEAGUE : CLUB) });
        break;
      case Key.NATION_COUNT:
      case Key.LEAGUE_COUNT:
      case Key.CLUB_COUNT:
        constraints.push({ kind: 'distinct', op, value: v, param: String(key === Key.NATION_COUNT ? NATION : key === Key.LEAGUE_COUNT ? LEAGUE : CLUB) });
        break;
      case Key.LEGEND_COUNT:
      case Key.FIRST_OWNER_PLAYERS_COUNT:
        constraints.push({ kind: 'count', op, value: v, players: matching((p) => matchesKey(p, key, vals)) });
        break;
      default:
        constraints.push({ kind: 'count', op, value: r.count, players: matching((p) => matchesKey(p, key, vals)) });
    }
  }

  return {
    players,
    nSlots: slotTypes.length,
    blocked: [...locked],
    bricks: brickChem,
    thresholds: Object.fromEntries(
      ([NATION, LEAGUE, CLUB] as ParamId[]).map((param) => [param, meta.thresholds[param].map((t) => [t.requirement, t.points])]),
    ),
    rating: ratingBounds(reqs),
    needsChem,
    constraints,
    timeLimit,
    workers: 8,
  };
}

interface CpResult {
  status: string;
  slots?: (number | null)[];
  kept?: number[]; // pool indexes of placed players the solver kept
  cost?: number;
  wallTime?: number;
}

function runCpSat(problem: unknown): Promise<CpResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`solver exited ${code}: ${err.slice(-500)}`));
      try {
        resolve(JSON.parse(out) as CpResult);
      } catch {
        reject(new Error(`solver returned invalid JSON: ${out.slice(0, 200)}`));
      }
    });
    child.stdin.end(JSON.stringify(problem));
  });
}

async function solveAnd(
  players: Player[], slotTypes: number[], reqs: Requirement[], meta: Meta, options: SolveOptions, squad: ActiveSquad | null,
  timeLimit: number, layout: ChallengeLayout | null,
): Promise<Solution | null> {
  const bricks = layout?.bricks ?? [];
  let pool = eligiblePool(players, reqs, options, squad);
  // players the user already placed are kept where possible, even if the settings would keep them out
  const fixed = new Map<number, number>();
  const missingPlaced: number[] = [];
  if (options.keepPlaced)
    for (const pl of layout?.placed ?? []) {
      const p = players.find((x) => x.id === pl.itemId);
      if (!p) {
        missingPlaced.push(pl.itemId);
        continue;
      }
      if (!pool.includes(p)) pool = [...pool, p];
      fixed.set(pl.index, p.id);
    }
  if (pool.length < requiredPlayers(bricks)) return null;
  const problem = buildProblem(pool, slotTypes, reqs, meta, timeLimit, bricks, fixed);
  if (process.env.SOLVER_DUMP) (await import("node:fs")).writeFileSync(process.env.SOLVER_DUMP, JSON.stringify(problem));
  const res = await runCpSat(problem);
  if (!res.slots) return null;
  const slots = res.slots.map((i) => (i === null ? null : pool[i]));
  return {
    slots, fixedIds: (res.kept ?? []).map((i) => pool[i].id), placedCount: fixed.size, missingPlaced,
    eval: evaluate(slots, slotTypes, reqs, 'AND', meta, bricks), cost: res.cost ?? 0, status: res.status,
  };
}

const NO_FILTERS: SolveOptions = {
  excludeIds: [], excludeActiveSquad: false, excludeSquadReserves: false, excludeNations: [], excludeLeagues: [],
  excludeClubs: [], onlyUntradeable: false, maxRating: 99, excludeSpecial: false, keepPlaced: true,
};

/** Why no squad exists, as data the site words in the user's language (web/src/messages.ts). */
export interface Reason {
  code: 'pool' | 'count' | 'sameGroup' | 'distinct' | 'rating' | 'combo';
  req?: string; // requirement text as EA words it
  have?: number;
  need?: number;
  hidden?: number; // extra players the user's settings hide
  all?: number; // best rating without the settings
}

/**
 * Why no squad exists: per-requirement checks that are cheap and certain. Each reason says
 * how many usable players there are, and whether the user's own settings are what hides them.
 */
export function diagnose(
  players: Player[], reqs: Requirement[], meta: Meta, options: SolveOptions, squad: ActiveSquad | null, bricks: BrickSlot[] = [],
): Reason[] {
  const need = requiredPlayers(bricks);
  const pool = eligiblePool(players, reqs, options, squad);
  const everyone = eligiblePool(players, reqs, NO_FILTERS, null);
  const hidden = (n: number, all: number) => (all > n ? all - n : 0);
  const reasons: Reason[] = [];

  if (pool.length < need) reasons.push({ code: 'pool', have: pool.length, need, hidden: hidden(pool.length, everyone.length) });

  const groupOf = (p: Player, key: number) =>
    key === Key.NATION_COUNT || key === Key.SAME_NATION_COUNT ? p.nation
    : key === Key.LEAGUE_COUNT || key === Key.SAME_LEAGUE_COUNT ? p.league
    : normClub(meta, p.club);

  for (const r of reqs) {
    if (r.scope === Scope.LOWER) continue; // "max" limits never make a squad impossible on their own
    const [key, vals] = [...r.keys][0] ?? [-1, []];
    const v = vals[0];
    const matchAll = (p: Player) => [...r.keys].every(([k, vs]) => matchesKey(p, k, vs));
    if (r.combined || ![Key.TEAM_RATING, Key.TEAM_STAR_RATING, Key.CHEMISTRY_POINTS, Key.ALL_PLAYERS_CHEMISTRY_POINTS,
      Key.PLAYER_QUALITY, Key.SAME_NATION_COUNT, Key.SAME_LEAGUE_COUNT, Key.SAME_CLUB_COUNT, Key.NATION_COUNT,
      Key.LEAGUE_COUNT, Key.CLUB_COUNT, -1].includes(key as never)) {
      const need = key === Key.LEGEND_COUNT || key === Key.FIRST_OWNER_PLAYERS_COUNT ? v : r.count;
      const f = r.combined ? matchAll : (p: Player) => matchesKey(p, key, vals);
      const have = new Set(pool.filter(f).map((p) => p.assetId)).size; // same player twice is not allowed
      const all = new Set(everyone.filter(f).map((p) => p.assetId)).size;
      if (have < need) reasons.push({ code: 'count', req: r.text, have, hidden: hidden(have, all) });
      continue;
    }
    if (key === Key.SAME_NATION_COUNT || key === Key.SAME_LEAGUE_COUNT || key === Key.SAME_CLUB_COUNT) {
      const best = (list: Player[]) => {
        const m = new Map<number, Set<number>>();
        for (const p of list) m.set(groupOf(p, key), (m.get(groupOf(p, key)) ?? new Set()).add(p.assetId));
        return Math.max(0, ...[...m.values()].map((x) => x.size));
      };
      const have = best(pool);
      if (have < v) reasons.push({ code: 'sameGroup', req: r.text, have, hidden: hidden(have, best(everyone)) });
    }
    if (key === Key.NATION_COUNT || key === Key.LEAGUE_COUNT || key === Key.CLUB_COUNT) {
      const have = new Set(pool.map((p) => groupOf(p, key))).size;
      if (have < v) reasons.push({ code: 'distinct', req: r.text, have });
    }
    if (key === Key.TEAM_RATING || key === Key.TEAM_STAR_RATING) {
      const best = (list: Player[]) => {
        const seen = new Set<number>();
        const top = [...list].sort((a, b) => b.rating - a.rating).filter((p) => !seen.has(p.assetId) && seen.add(p.assetId)).slice(0, need);
        return top.length === need ? squadRating(top.map((p) => p.rating)) : 0; // locked slots count as empty
      };
      const target = key === Key.TEAM_RATING ? v : STAR_RATING_THRESHOLDS[v - 1] + 1;
      const have = best(pool);
      if (have < target) {
        reasons.push({ code: 'rating', req: r.text, need, have, all: best(everyone) });
      }
    }
  }
  if (reasons.length === 0) reasons.push({ code: 'combo' });
  return reasons;
}

export async function solve(
  players: Player[],
  formation: string,
  reqs: Requirement[],
  op: 'AND' | 'OR',
  meta: Meta,
  options: SolveOptions,
  squad: ActiveSquad | null,
  timeLimit = 10,
  layout: ChallengeLayout | null = null,
): Promise<Solution | null> {
  const slotTypes = meta.formations[formation]?.map((s) => s.typeId);
  if (!slotTypes) throw new Error(`Unknown formation ${formation}`);
  if (op === 'AND') return solveAnd(players, slotTypes, reqs, meta, options, squad, timeLimit, layout);

  // OR: any single requirement is enough -> solve each alone, keep the cheapest.
  let best: Solution | null = null;
  for (const r of reqs) {
    const s = await solveAnd(players, slotTypes, [r], meta, options, squad, timeLimit / reqs.length, layout);
    if (s && s.eval.allMet && (!best || s.cost < best.cost)) best = s;
  }
  if (best) best.eval = evaluate(best.slots, slotTypes, reqs, 'OR', meta, layout?.bricks ?? []);
  return best;
}
