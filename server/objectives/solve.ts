// Objectives -> the strongest playable squad. found comes from our own re-check, never from CP-SAT.
import type { Meta } from '../meta.js';
import { evaluate, type Player, type SquadEval } from '../squad.js';
import { runCpSat } from '../solver.js';
import { buildPlayProblem, checkCovers, diagnosePlay, playPool, CHEM_WEIGHT, type Cover, type PlayReason } from './play.js';
import type { Condition } from './types.js';

export interface ObjectivesSolution {
  found: boolean;
  slots: (Player | null)[];
  eval: SquadEval | null;
  covers: Cover[];
  reasons: PlayReason[];
  status: string;
}

export async function solveObjectives(
  players: Player[], formation: string, conds: Condition[], meta: Meta,
  options: { excludeIds: number[]; maxRating: number; includeLoans?: boolean }, timeLimit = 10, chemWeight = CHEM_WEIGHT,
): Promise<ObjectivesSolution> {
  const slotTypes = meta.formations[formation]?.map((s) => s.typeId);
  if (!slotTypes) throw new Error(`Unknown formation ${formation}`);
  const pool = playPool(players, options);
  const empty = slotTypes.map(() => null);
  const problem = buildPlayProblem(pool, slotTypes, conds, meta, timeLimit, undefined, chemWeight);
  if (process.env.SOLVER_DUMP) (await import('node:fs')).writeFileSync(process.env.SOLVER_DUMP, JSON.stringify(problem));
  const res = await runCpSat(problem);
  if (!res.slots) {
    return { found: false, slots: empty, eval: null, covers: checkCovers(empty, slotTypes, conds), reasons: diagnosePlay(pool, slotTypes, conds), status: res.status };
  }
  const slots = res.slots.map((i) => (i === null ? null : pool[i]));
  const covers = checkCovers(slots, slotTypes, conds);
  const found = slots.every((p) => p !== null) && covers.every((c) => c.met);
  return { found, slots, eval: evaluate(slots, slotTypes, [], 'AND', meta, []), covers, reasons: found ? [] : [{ code: 'combo' }], status: res.status };
}
