// Free and Premium plans: which one a user is on and how much of the weekly solve quota is left.
// Pure rules; the rows come from server/db/users.ts, the admin flag from server/admin/auth.ts.

export type Tier = 'free' | 'premium';
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export interface PlanRow {
  plan: string;
  premiumUntil: Date | null;
  quotaStart: Date | null;
  quotaUsed: number;
  founderAt?: Date | null;
  boostSince?: Date | null; // boosting the Discord server now (server/discord/boost.ts)
  boostEndedAt?: Date | null; // the boost ended here; Premium lasts BOOST_GRACE_MS more
}

export interface Quota {
  used: number;
  limit: number;
  /** when the current window ends; null while no window is open */
  resetsAt: number | null;
}

/** Premium after a Discord boost ends (owner decision: 12 hours). */
export const BOOST_GRACE_MS = 12 * 60 * 60 * 1000;

export interface BoostState {
  since: number | null;
  graceUntil: number | null;
}
export type PlanSource = 'admin' | 'paid' | 'boost';

const paidActive = (row: PlanRow, now: number) => row.plan === 'premium' && (!row.premiumUntil || row.premiumUntil.getTime() > now);

/** Boosting now, or inside the grace after the boost ended; null otherwise. */
export function boostState(row: PlanRow, now: number): BoostState | null {
  if (row.boostSince) return { since: row.boostSince.getTime(), graceUntil: null };
  const end = row.boostEndedAt ? row.boostEndedAt.getTime() + BOOST_GRACE_MS : 0;
  return end > now ? { since: null, graceUntil: end } : null;
}

/** Why a user is Premium: admin, paid (codes, points, founders, admin grant), or a Discord boost. Separate sources: a boost never consumes paid days. */
export function planSource(row: PlanRow, admin: boolean, now: number): PlanSource | null {
  if (admin) return 'admin';
  if (paidActive(row, now)) return 'paid';
  return boostState(row, now) ? 'boost' : null;
}

/** Admins are always Premium; a Premium end date in the past falls back to Free; a boost (plus grace) is Premium. */
export function effectivePlan(row: PlanRow, admin: boolean, now: number): Tier {
  return planSource(row, admin, now) ? 'premium' : 'free';
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
