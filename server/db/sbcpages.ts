// Reads for the public SBC pages (server/sbcpages/). Sets with at least one vouched challenge;
// release / hidden rules in rules.ts. `raw` is user-relayed JSON: anything malformed is not public.
import { and, eq, sql } from 'drizzle-orm';
import type { EligibilityReq } from '../ea.js';
import { isPublic } from '../sbcpages/rules.js';
import { db } from './index.js';
import { challenges, events, sbcSets } from './schema.js';

export interface SetRow { setId: number; name: string; description: string; categoryId: number | null; repeatabilityMode: string | null; endTime: number | null; raw: Record<string, unknown>; lastSeen: Date }
export interface ChallengeRow { challengeId: number; setId: number; name: string; formation: string | null; elgOperation: string | null; elgReq: EligibilityReq[]; raw: Record<string, unknown> }

const setCols = {
  setId: sbcSets.setId, name: sbcSets.name, description: sbcSets.description, categoryId: sbcSets.categoryId,
  repeatabilityMode: sbcSets.repeatabilityMode, endTime: sbcSets.endTime, raw: sbcSets.raw, lastSeen: sbcSets.lastSeen,
};

/** Fails closed: a non-object raw or a non-numeric releaseTime is never public. */
function publicNow(raw: unknown, vouchedCount: number, nowSec: number): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const r = raw as { releaseTime?: unknown; hidden?: unknown };
  if (r.releaseTime != null && (typeof r.releaseTime !== 'number' || !Number.isFinite(r.releaseTime))) return false;
  return isPublic({ raw: r as { releaseTime?: number; hidden?: boolean } }, vouchedCount, nowSec);
}

export async function publicSetRows(nowSec: number): Promise<SetRow[]> {
  const vouched = db
    .select({ setId: challenges.setId, n: sql<number>`count(*)::int`.as('n') })
    .from(challenges).where(eq(challenges.vouched, true)).groupBy(challenges.setId).as('v');
  const rows = await db.select({ ...setCols, n: vouched.n }).from(sbcSets).innerJoin(vouched, eq(vouched.setId, sbcSets.setId));
  return rows.filter((r) => publicNow(r.raw, r.n, nowSec)).map(({ n: _n, ...r }) => r as SetRow);
}

export async function publicSetRow(setId: number, nowSec: number): Promise<{ set: SetRow; challenges: ChallengeRow[] } | null> {
  const [set] = await db.select(setCols).from(sbcSets).where(eq(sbcSets.setId, setId));
  if (!set) return null;
  const list = await db
    .select({ challengeId: challenges.challengeId, setId: challenges.setId, name: challenges.name, formation: challenges.formation, elgOperation: challenges.elgOperation, elgReq: challenges.elgReq, raw: challenges.raw })
    .from(challenges).where(and(eq(challenges.setId, setId), eq(challenges.vouched, true)));
  if (!publicNow(set.raw, list.length, nowSec)) return null;
  return { set: set as SetRow, challenges: list as ChallengeRow[] };
}

export async function solveRows(setId: number): Promise<{ userId: string | null; found: boolean }[]> {
  const rows = await db
    .select({ userId: events.userId, found: sql<boolean>`coalesce(${events.data}->>'found' = 'true', false)` })
    .from(events)
    .where(and(eq(events.type, 'solve'), sql`${events.data}->>'setId' = ${String(setId)}`));
  return rows;
}
