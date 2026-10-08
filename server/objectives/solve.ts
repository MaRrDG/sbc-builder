// Objectives -> the strongest playable squad. found comes from our own re-check, never from CP-SAT.
// With groups (objective id per condition) the solve is soft: as many objectives as possible, then the strongest.
import type { Meta } from '../meta.js';
import { evaluate, type Player, type SquadEval } from '../squad.js';
import { runCpSat } from '../solver.js';
import { buildPlayProblem, checkCovers, diagnosePlay, playPool, uncoveredReasons, CHEM_WEIGHT, type Cover, type PlayReason } from './play.js';
import type { Condition } from './types.js';

export interface ObjectivesSolution {
  found: boolean;
  /** a full in-position XI, but some objective is not covered (reasons say why, per objective) */
  partial: boolean;
  slots: (Player | null)[];
  eval: SquadEval | null;
  covers: Cover[];
  reasons: PlayReason[];
  status: string;
}

export async function solveObjectives(
  players: Player[], formation: string, conds: Condition[], meta: Meta,
  options: { excludeIds: number[]; maxRating: number; includeLoans?: boolean }, timeLimit = 10, chemWeight = CHEM_WEIGHT,
  groups?: number[],
): Promise<ObjectivesSolution> {
  const slotTypes = meta.formations[formation]?.map((s) => s.typeId);
  if (!slotTypes) throw new Error(`Unknown formation ${formation}`);
  const pool = playPool(players, options);
  const empty = slotTypes.map(() => null);
  const problem = buildPlayProblem(pool, slotTypes, conds, meta, timeLimit, undefined, chemWeight, groups);
  if (process.env.SOLVER_DUMP) (await import('node:fs')).writeFileSync(process.env.SOLVER_DUMP, JSON.stringify(problem));
  const res = await runCpSat(problem);
  if (!res.slots) {
    const covers = checkCovers(empty, slotTypes, conds);
    return { found: false, partial: false, slots: empty, eval: null, covers, reasons: diagnosePlay(pool, slotTypes, conds), status: res.status };
  }
  const slots = res.slots.map((i) => (i === null ? null : pool[i]));
  const covers = checkCovers(slots, slotTypes, conds);
  const full = slots.every((p) => p !== null);
  const found = full && covers.every((c) => c.met);
  const partial = full && !found && !!groups;
  const reasons: PlayReason[] = found ? [] : partial ? uncoveredReasons(pool, slotTypes, conds, groups!, covers) : [{ code: 'combo' }];
  return { found, partial, slots, eval: evaluate(slots, slotTypes, [], 'AND', meta, []), covers, reasons, status: res.status };
}
