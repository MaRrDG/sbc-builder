// The objectives of the active groups, with the squad condition we read from each and whether each is done.
import { parseConditions } from './parse.js';
import { trimAward } from './shared.js';
import type { Condition, EaAward, EaCategory, EaGroup, EaObjective, Names, ObjectiveGroupView } from './types.js';

/** EA says it is done (COMPLETED / REDEEMED), or the progress already reached the target. */
const isDone = (o: EaObjective) => o.state === 'COMPLETED' || o.state === 'REDEEMED' || (typeof o.currentProgress === 'number' ? o.currentProgress : 0) >= o.multiplier;

/** Only open objectives with a squad condition can be solved for. */
export const solvable = (o: { done: boolean; conditions: Condition[] }) => !o.done && o.conditions.length > 0;

const list = <T>(x: unknown): T[] => (Array.isArray(x) ? x : []);
const num = (x: unknown, or = 0) => (typeof x === 'number' && Number.isFinite(x) ? x : or);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/**
 * EA's answer is relayed as-is, so every shape is checked: a group or objective without an id is skipped,
 * an objective without a text gets no conditions, a missing list is empty. One odd entry never sinks the screen.
 */
export function openGroups(categories: EaCategory[], now: number, names: Names): ObjectiveGroupView[] {
  const out: ObjectiveGroupView[] = [];
  for (const cat of list<EaCategory>(categories)) {
    if (!isObj(cat)) continue;
    for (const g of list<EaGroup>(cat.groupsList)) {
      if (!isObj(g) || !Number.isInteger(g.groupId)) continue;
      const started = num(g.startTime) * 1000 <= now;
      const ended = num(g.endTime) > 0 && num(g.endTime) * 1000 <= now;
      if (!started || ended) continue;
      const objectives = list<EaObjective>(g.objectives)
        .filter((o) => isObj(o) && Number.isInteger(o.objectiveId))
        .map((o) => {
          const description = typeof o.description === 'string' ? o.description : '';
          const target = num(o.multiplier, 1);
          return {
            id: o.objectiveId,
            name: typeof o.name === 'string' ? o.name : '',
            description,
            progress: num(o.currentProgress),
            target,
            awards: list<EaAward>(o.awards).filter(isObj).map(trimAward),
            conditions: description ? parseConditions(description, names) : [],
            done: isDone({ ...o, multiplier: target }),
          };
        });
      if (!objectives.length) continue;
      out.push({
        id: g.groupId,
        title: typeof g.title === 'string' ? g.title : '',
        category: typeof cat.name === 'string' ? cat.name : '',
        endsAt: num(g.endTime) > 0 ? num(g.endTime) * 1000 : null,
        awards: list<EaAward>(g.awardsList).filter(isObj).map(trimAward),
        objectives,
        progressKnown: true,
      });
    }
  }
  return out;
}
