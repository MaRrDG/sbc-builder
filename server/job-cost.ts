// Pure: how many EA requests a sync job will make, so a job only starts when today's budget
// (EA_DAILY_LIMIT) still has room for all of it. A job cannot be stopped half way, so estimates
// round up; the meter logs `overBudget` when one still ran past the cap.
import type { JobKind } from './jobs.js';

const CLUB_PAGE = 91; // extension/hook.js PAGE
const CLUB_FIXED = 4; // squad list, active squad, chemistry profiles, storage
export const UNKNOWN_CLUB_COST = 60;
const MAX_SETS = 40;

export function jobCost(job: { kind: JobKind; setIds?: number[] }, clubItems: number | null): number {
  switch (job.kind) {
    case 'club':
      return clubItems ? Math.ceil(clubItems / CLUB_PAGE) + 1 + CLUB_FIXED : UNKNOWN_CLUB_COST;
    case 'challenges':
      return Math.min(job.setIds?.length ?? 0, MAX_SETS);
    case 'sbc':
      return 2; // the hub, or the old list when the hub is off
    case 'academy':
    case 'challengeSquad':
      return 1;
  }
}

/** The first queued job whose cost fits in `left`; queued jobs before it that do not fit are reported. */
export function pickJob<T extends { status: string; kind: JobKind; setIds?: number[] }>(
  queue: T[], left: number, clubItems: number | null,
): { job: T | null; blocked: { job: T; cost: number }[] } {
  const blocked: { job: T; cost: number }[] = [];
  for (const j of queue) {
    if (j.status !== 'queued') continue;
    const cost = jobCost(j, clubItems);
    if (cost <= left) return { job: j, blocked };
    blocked.push({ job: j, cost });
  }
  return { job: null, blocked };
}
