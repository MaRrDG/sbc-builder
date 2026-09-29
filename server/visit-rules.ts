// Pure rules for what a visit (site opened, web app back in front) may refresh.

/** A visit syncs the club when it is older than `staleMs` and today's club cap is not used up. */
export function clubDueOnVisit(fetchedAt: number | null, now: number, staleMs: number, usedToday: number, limit: number): boolean {
  if (usedToday >= limit) return false;
  return fetchedAt === null || now - fetchedAt >= staleMs;
}
