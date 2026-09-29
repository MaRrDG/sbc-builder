// Pure rules for when the club may be synced again.

/** A visit syncs the club when it is older than `staleMs` (or was never loaded). */
export function clubDueOnVisit(fetchedAt: number | null, now: number, staleMs: number): boolean {
  return fetchedAt === null || now - fetchedAt >= staleMs;
}

/** When the Club button works again: `cooldownMs` after the latest club load or queued sync (null: now). */
export function clubManualAt(lastAt: number | null, now: number, cooldownMs: number): number | null {
  if (lastAt === null) return null;
  const at = lastAt + cooldownMs;
  return at > now ? at : null;
}
