// Challenges are the same for everyone; only status and timesCompleted are per account. A set
// this account never touched can take its challenges from the shared copy instead of asking EA.
import type { Challenge, SbcSet } from './ea.js';

export type SeedSet = Pick<SbcSet, 'setId' | 'challengesCount' | 'challengesCompletedCount' | 'timesCompleted'>;

/** This account's copy of the set's challenges, or null when it must ask EA itself. */
export function seedChallenges(set: SeedSet, shared: Challenge[] | null): Challenge[] | null {
  if (!shared?.length || shared.length !== set.challengesCount) return null;
  if (set.challengesCompletedCount !== 0 || set.timesCompleted !== 0) return null;
  if (shared.some((c) => c.setId !== set.setId)) return null;
  const prio = (c: Challenge) => (c as Challenge & { priority?: number }).priority ?? 0;
  return [...shared]
    .sort((a, b) => prio(a) - prio(b) || a.challengeId - b.challengeId)
    .map((c) => ({ ...c, status: 'NOT_STARTED', timesCompleted: 0 }));
}
