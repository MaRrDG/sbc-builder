// Objectives -> the strongest playable squad. found comes from our own re-check, never from CP-SAT.
// With groups (objective id per condition) the solve is soft: as many objectives as possible, then the strongest.
import type { Meta } from '../meta.js';
import { evaluate, type Player, type SquadEval } from '../squad.js';
import { runCpSat } from '../solver.js';
import { buildPlayProblem, checkCovers, diagnosePlay, noXiReason, playPool, playableXi, uncoveredReasons, CHEM_WEIGHT, type Cover, type PlayReason } from './play.js';
import type { Condition } from './types.js';

export interface ObjectivesSolution {
  found: boolean;
  /** a full in-position XI, but some objective is not covered (reasons say why, per objective) */
  partial: boolean;
  /** CP-SAT proved the answer optimal (else it stopped on the time limit: more objectives might fit) */
  optimal: boolean;
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
  // the club before the user's settings (storage is never playable): reasons say how many the settings hide
  const everyone = players.filter((p) => !p.inStorage);
  const empty = slotTypes.map(() => null);
  const problem = buildPlayProblem(pool, slotTypes, conds, meta, timeLimit, undefined, chemWeight, groups);
  if (process.env.SOLVER_DUMP) (await import('node:fs')).writeFileSync(process.env.SOLVER_DUMP, JSON.stringify(problem));
  const res = await runCpSat(problem);
  const optimal = res.status === 'OPTIMAL';
  const formations = Object.fromEntries(Object.entries(meta.formations).map(([f, ss]) => [f, ss.map((x) => x.typeId)]));
  // no squad to show: an empty pitch with the reasons (per objective when the solver found an XI)
  const fail = (reasons: PlayReason[]): ObjectivesSolution => ({
    found: false, partial: false, optimal, slots: empty, eval: null, covers: checkCovers(empty, slotTypes, conds), reasons, status: res.status,
  });
  const slots = res.slots?.map((i) => (i === null ? null : pool[i]));
  if (!slots) {
    if (!groups) {
      // hard solve: a condition nobody can meet is certain; else no XI at all, else a clash (or out of time)
      const why = diagnosePlay(pool, slotTypes, conds, formations, everyone);
      if (why[0].code !== 'combo') return fail(why);
      if (res.status !== 'INFEASIBLE') return fail([{ code: 'timeout' }]);
      const xi = noXiReason(pool, slotTypes, everyone);
      return fail(xi.short.length ? [xi] : why);
    }
    // soft solve (objectives are optional there): INFEASIBLE means the pool cannot field an in-position XI in
    // this formation; anything else means time ran out with no squad at all, nothing proven
    return fail(res.status === 'INFEASIBLE' ? [noXiReason(pool, slotTypes, everyone)] : [{ code: 'timeout' }]);
  }
  if (!playableXi(slots, slotTypes)) return fail(diagnosePlay(pool, slotTypes, conds, formations, everyone));
  const covers = checkCovers(slots, slotTypes, conds);
  const evaluated = evaluate(slots, slotTypes, [], 'AND', meta, []);
  if (covers.every((c) => c.met)) return { found: true, partial: false, optimal, slots, eval: evaluated, covers, reasons: [], status: res.status };
  if (!groups) return fail(diagnosePlay(pool, slotTypes, conds, formations, everyone));
  const reasons = uncoveredReasons(pool, slotTypes, conds, groups, covers, { optimal, formations, everyone });
  // partial only when at least one picked objective is covered; none covered is a failure
  const uncovered = new Set(reasons.map((r) => r.objectiveId));
  if (new Set(groups).size === uncovered.size) return fail(reasons);
  return { found: false, partial: true, optimal, slots, eval: evaluated, covers, reasons, status: res.status };
}
