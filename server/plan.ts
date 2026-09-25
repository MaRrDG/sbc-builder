// Free and Premium plans: which one a user is on and how much of the weekly solve quota is left.
// Pure rules; the rows come from server/db/users.ts, the admin flag from server/admin/auth.ts.

export type Tier = 'free' | 'premium';
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface PlanRow {
  plan: string;
  premiumUntil: Date | null;
  quotaStart: Date | null;
  quotaUsed: number;
}

export interface Quota {
  used: number;
  limit: number;
  /** when the current window ends; null while no window is open */
  resetsAt: number | null;
}

/** Admins are always Premium; a Premium end date in the past falls back to Free. */
export function effectivePlan(row: PlanRow, admin: boolean, now: number): Tier {
  if (admin) return 'premium';
  if (row.plan !== 'premium') return 'free';
  return !row.premiumUntil || row.premiumUntil.getTime() > now ? 'premium' : 'free';
}

/** The window opens on the first counted solve and closes 7 days later (Claude-style). */
export function quotaState(row: PlanRow, limit: number, now: number): Quota {
  const start = row.quotaStart?.getTime() ?? null;
  if (start === null || now >= start + WEEK_MS) return { used: 0, limit, resetsAt: null };
  return { used: row.quotaUsed, limit, resetsAt: start + WEEK_MS };
}

export function weeklyLimit(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : 20;
}
