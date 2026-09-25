// A signed-in user's plan and quota, for /api/me, /api/solve and the admin screen.
import { isAdmin } from './admin/auth.js';
import { planRow } from './db/users.js';
import { effectivePlan, quotaState, weeklyLimit, type PlanRow, type Quota, type Tier } from './plan.js';

export interface PlanInfo {
  tier: Tier;
  premiumUntil: number | null;
  quota: Quota | null; // null: Premium, no limit
}

// read on use: .env is loaded by initDb(), after this module is imported
export const limit = () => weeklyLimit(process.env.FREE_WEEKLY_SOLVES);

export function planInfo(row: PlanRow, admin: boolean, now: number): PlanInfo {
  const tier = effectivePlan(row, admin, now);
  return { tier, premiumUntil: row.premiumUntil?.getTime() ?? null, quota: tier === 'free' ? quotaState(row, limit(), now) : null };
}

export async function planFor(userId: string): Promise<PlanInfo> {
  const row = (await planRow(userId)) ?? { plan: 'free', premiumUntil: null, quotaStart: null, quotaUsed: 0 };
  return planInfo(row, await isAdmin(userId), Date.now());
}
