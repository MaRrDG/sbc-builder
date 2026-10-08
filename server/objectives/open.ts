// Which objectives the user can still work on, with the squad condition we read from each.
import { parseConditions } from './parse.js';
import type { EaCategory, Names, ObjectiveGroupView } from './types.js';

export function openGroups(categories: EaCategory[], now: number, names: Names): ObjectiveGroupView[] {
  const out: ObjectiveGroupView[] = [];
  for (const cat of categories)
    for (const g of cat.groupsList ?? []) {
      const started = g.startTime * 1000 <= now;
      const ended = g.endTime > 0 && g.endTime * 1000 <= now;
      if (!started || ended) continue;
      const objectives = (g.objectives ?? [])
        .filter((o) => o.state !== 'REDEEMED')
        .map((o) => ({
          id: o.objectiveId,
          name: o.name,
          description: o.description,
          progress: o.currentProgress ?? 0,
          target: o.multiplier,
          awards: o.awards ?? [],
          conditions: parseConditions(o.description, names),
        }));
      if (!objectives.length) continue;
      out.push({ id: g.groupId, title: g.title, category: cat.name, endsAt: g.endTime > 0 ? g.endTime * 1000 : null, awards: g.awardsList ?? [], objectives });
    }
  return out;
}
