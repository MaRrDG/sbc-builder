// The objectives of the active groups, with the squad condition we read from each and whether each is done.
import { parseConditions } from './parse.js';
import type { Condition, EaCategory, EaObjective, Names, ObjectiveGroupView } from './types.js';

/** EA says it is done (COMPLETED / REDEEMED), or the progress already reached the target. */
const isDone = (o: EaObjective) => o.state === 'COMPLETED' || o.state === 'REDEEMED' || (o.currentProgress ?? 0) >= o.multiplier;

/** Only open objectives with a squad condition can be solved for. */
export const solvable = (o: { done: boolean; conditions: Condition[] }) => !o.done && o.conditions.length > 0;

export function openGroups(categories: EaCategory[], now: number, names: Names): ObjectiveGroupView[] {
  const out: ObjectiveGroupView[] = [];
  for (const cat of categories)
    for (const g of cat.groupsList ?? []) {
      const started = g.startTime * 1000 <= now;
      const ended = g.endTime > 0 && g.endTime * 1000 <= now;
      if (!started || ended) continue;
      const objectives = (g.objectives ?? [])
        .map((o) => ({
          id: o.objectiveId,
          name: o.name,
          description: o.description,
          progress: o.currentProgress ?? 0,
          target: o.multiplier,
          awards: o.awards ?? [],
          conditions: parseConditions(o.description, names),
          done: isDone(o),
        }));
      if (!objectives.length) continue;
      out.push({ id: g.groupId, title: g.title, category: cat.name, endsAt: g.endTime > 0 ? g.endTime * 1000 : null, awards: g.awardsList ?? [], objectives });
    }
  return out;
}
