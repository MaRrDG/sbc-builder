// A signed-in user's plan and quota, for /api/me, /api/solve and the admin screen.
import { isAdmin } from './admin/auth.js';
import { grantPendingInvite } from './db/referrals.js';
import { claimFounderSpot, foundersTaken, linkedInOrder, planRow } from './db/users.js';
import { foundersLimit, foundersState, type FoundersState } from './founders.js';
import { boostState, effectivePlan, planSource, quotaState, weeklyLimit, type BoostState, type PlanRow, type PlanSource, type Quota, type Tier } from './plan.js';

export interface PlanInfo {
  tier: Tier;
  premiumUntil: number | null;
  quota: Quota | null; // null: Premium, no limit
  founder: boolean; // Founding 50: Premium for life
  source: PlanSource | null; // why Premium: admin, paid or a Discord boost
  boost: BoostState | null;
}

// read on use: .env is loaded by initDb(), after this module is imported
export const limit = () => weeklyLimit(process.env.FREE_WEEKLY_SOLVES);

export function planInfo(row: PlanRow, admin: boolean, now: number): PlanInfo {
  const tier = effectivePlan(row, admin, now);
  return { tier, premiumUntil: row.premiumUntil?.getTime() ?? null, quota: tier === 'free' ? quotaState(row, limit(), now) : null, founder: !!row.founderAt, source: planSource(row, admin, now), boost: boostState(row, now) };
}

export async function planFor(userId: string): Promise<PlanInfo> {
  const row = (await planRow(userId)) ?? { plan: 'free', premiumUntil: null, quotaStart: null, quotaUsed: 0, founderAt: null, discordId: null, boostSince: null, boostEndedAt: null };
  return planInfo(row, await isAdmin(userId), Date.now());
}

/** Founding 50: linking `personaId` may earn `userId` lifetime Premium. Never throws: a link is not a purchase. */
export async function grantFounderSpot(userId: string, personaId: number): Promise<boolean> {
  try {
    const got = await claimFounderSpot(userId, personaId, await isAdmin(userId), foundersLimit());
    if (got) founders = null;
    return got;
  } catch (e) {
    console.error(`[founders] spot for ${userId} failed: ${(e as Error).message}`);
    return false;
  }
}

/** A pending invite's 7 days + the inviter's point, on an EA link. Never throws, like the founders grant. */
export async function grantInviteOnLink(userId: string, personaId: number): Promise<void> {
  try {
    await grantPendingInvite(userId, personaId);
  } catch (e) {
    console.error(`[invite] grant for ${userId} failed: ${(e as Error).message}`);
  }
}

/** On startup: users who linked before Founding 50 existed get their spots, in link order (idempotent). */
export async function backfillFounders(): Promise<void> {
  for (const { userId, personaId } of await linkedInOrder()) {
    if ((await foundersTaken()) >= foundersLimit()) return;
    await grantFounderSpot(userId, personaId);
  }
}

// the landing asks on every visit: count at most every 30 s
let founders: { at: number; state: FoundersState } | null = null;
export async function foundersNow(): Promise<FoundersState> {
  if (!founders || Date.now() - founders.at > 30_000) founders = { at: Date.now(), state: foundersState(await foundersTaken(), foundersLimit()) };
  return founders.state;
}
