// Pure: how many EA requests a sync job will make, so a job only starts when today's budget
// (EA_DAILY_LIMIT) still has room for all of it. A job cannot be stopped half way, so estimates
// round up; the meter logs `overBudget` when one still ran past the cap.
import type { JobKind } from './jobs.js';

const CLUB_PAGE = 91; // extension/hook.js PAGE
const CLUB_FIXED = 4; // squad list, active squad, chemistry profiles, storage
export const SQUADS_MAX = 12; // extension/hook.js MAX_SQUADS: the squads job reads the list, then at most this many squads
const CLUB_MAX_ITEMS = 5000; // the recipe stops paging here
const CLUB_MAX_COST = Math.ceil(CLUB_MAX_ITEMS / CLUB_PAGE) + 1 + CLUB_FIXED;
export const UNKNOWN_CLUB_COST = 60;
const MAX_SETS = 40;

export function jobCost(job: { kind: JobKind; setIds?: number[] }, clubItems: number | null): number {
  switch (job.kind) {
    case 'club':
      return clubItems ? Math.min(Math.ceil(clubItems / CLUB_PAGE) + 1 + CLUB_FIXED, CLUB_MAX_COST) : UNKNOWN_CLUB_COST;
    case 'challenges':
      return Math.min(job.setIds?.length ?? 0, MAX_SETS);
    case 'sbc':
      return 2; // the hub, or the old list when the hub is off
    case 'squads':
      return 1 + SQUADS_MAX;
    case 'academy':
    case 'challengeSquad':
      return 1;
  }
}

/**
 * The first queued job whose cost fits in `left`; queued jobs before it that do not fit are reported.
 * With `limit`: on a fresh day (`left === limit`) a job costing more than the whole cap still runs,
 * otherwise it could never run at all.
 */
export function pickJob<T extends { status: string; kind: JobKind; setIds?: number[] }>(
  queue: T[], left: number, clubItems: number | null, limit?: number,
): { job: T | null; blocked: { job: T; cost: number }[] } {
  const blocked: { job: T; cost: number }[] = [];
  for (const j of queue) {
    if (j.status !== 'queued') continue;
    const cost = jobCost(j, clubItems);
    if (cost <= left || (limit !== undefined && left === limit && left > 0)) return { job: j, blocked };
    blocked.push({ job: j, cost });
  }
  return { job: null, blocked };
}

/** Stamps each job with its budget block (or clears it); true when anything changed (worth a notify). */
export function stampBudget<T extends { budget?: { cost: number; left: number } }>(
  queue: T[], blocked: { job: T; cost: number }[], left: number,
): boolean {
  let changed = false;
  for (const j of queue) {
    const b = blocked.find((x) => x.job === j);
    const next = b ? { cost: b.cost, left } : undefined;
    if (j.budget?.cost !== next?.cost || j.budget?.left !== next?.left) changed = true;
    j.budget = next;
  }
  return changed;
}
