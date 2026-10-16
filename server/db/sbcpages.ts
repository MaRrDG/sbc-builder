// Reads for the public SBC pages (server/sbcpages/). Sets with a vouched public snapshot and at least one
// vouched challenge; release / hidden rules in rules.ts. Snapshots are relayed JSON: anything malformed is not public.
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import type { EligibilityReq } from '../ea.js';
import { isPublic } from '../sbcpages/rules.js';
import { db } from './index.js';
import { challenges, events, sbcSets } from './schema.js';

export interface SetRow { setId: number; name: string; description: string; categoryId: number | null; repeatabilityMode: string | null; endTime: number | null; raw: Record<string, unknown>; lastSeen: Date }
export interface ChallengeRow { challengeId: number; setId: number; name: string; formation: string | null; elgOperation: string | null; elgReq: EligibilityReq[]; raw: Record<string, unknown> }

// only the vouched public snapshot (shared-sbc.ts SetSnapshot); the app's own columns take any relay
const setCols = { setId: sbcSets.setId, snap: sbcSets.publicSnapshot, lastSeen: sbcSets.lastSeen };

/** A stored snapshot as a page row; null (not public) when it is missing or malformed. */
function fromSnapshot(setId: number, snap: unknown, lastSeen: Date): SetRow | null {
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return null;
  const s = snap as Record<string, unknown>;
  const raw = s.raw;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (typeof s.name !== 'string' || !s.name.trim()) return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return {
    setId, name: s.name, description: typeof s.description === 'string' ? s.description : '',
    categoryId: num(s.categoryId), repeatabilityMode: typeof s.repeatabilityMode === 'string' ? s.repeatabilityMode : null,
    endTime: num(s.endTime), raw: raw as Record<string, unknown>, lastSeen,
  };
}

/** Fails closed: a non-numeric releaseTime or a non-boolean hidden is never public. */
function publicNow(raw: Record<string, unknown>, vouchedCount: number, nowSec: number): boolean {
  const r = raw as { releaseTime?: unknown; hidden?: unknown };
  if (r.releaseTime != null && (typeof r.releaseTime !== 'number' || !Number.isFinite(r.releaseTime))) return false;
  if (r.hidden != null && typeof r.hidden !== 'boolean') return false;
  return isPublic({ raw: r as { releaseTime?: number; hidden?: boolean } }, vouchedCount, nowSec);
}

export async function publicSetRows(nowSec: number): Promise<SetRow[]> {
  const vouched = db
    .select({ setId: challenges.setId, n: sql<number>`count(*)::int`.as('n') })
    .from(challenges).where(eq(challenges.vouched, true)).groupBy(challenges.setId).as('v');
  const rows = await db.select({ ...setCols, n: vouched.n }).from(sbcSets).innerJoin(vouched, eq(vouched.setId, sbcSets.setId)).where(isNotNull(sbcSets.publicSnapshot));
  return rows.flatMap((r) => {
    const set = fromSnapshot(r.setId, r.snap, r.lastSeen);
    return set && publicNow(set.raw, r.n, nowSec) ? [set] : [];
  });
}

export async function publicSetRow(setId: number, nowSec: number): Promise<{ set: SetRow; challenges: ChallengeRow[] } | null> {
  const [row] = await db.select(setCols).from(sbcSets).where(eq(sbcSets.setId, setId));
  const set = row && fromSnapshot(row.setId, row.snap, row.lastSeen);
  if (!set) return null;
  const list = await db
    .select({ challengeId: challenges.challengeId, setId: challenges.setId, name: challenges.name, formation: challenges.formation, elgOperation: challenges.elgOperation, elgReq: challenges.elgReq, raw: challenges.raw })
    .from(challenges).where(and(eq(challenges.setId, setId), eq(challenges.vouched, true)));
  if (!publicNow(set.raw, list.length, nowSec)) return null;
  return { set, challenges: list as ChallengeRow[] };
}

export async function solveRows(setId: number): Promise<{ userId: string | null; found: boolean }[]> {
  const rows = await db
    .select({ userId: events.userId, found: sql<boolean>`coalesce(${events.data}->>'found' = 'true', false)` })
    .from(events)
    .where(and(eq(events.type, 'solve'), sql`${events.data}->>'setId' = ${String(setId)}`));
  return rows;
}
