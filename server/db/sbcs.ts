// SBC history and shared brick layouts. Sets / challenges are upserted (never deleted);
// brick reports are append-only and the shared layout is voted from them (server/bricks.ts).
import { eq, sql } from 'drizzle-orm';
import type { Challenge, SbcSet } from '../ea.js';
import type { BrickSlot } from '../layout.js';
import { canonicalBricks, chooseLayout, layoutHash, rejectReason } from '../bricks.js';
import { db } from './index.js';
import { brickReports, challenges, sbcSets, trustedAccounts } from './schema.js';

const uniqueBy = <T>(list: T[], key: (x: T) => number) => [...new Map(list.map((x) => [key(x), x])).values()];

export async function saveSets(sets: SbcSet[]): Promise<void> {
  const rows = uniqueBy(sets, (s) => s.setId).map((s) => ({
    setId: s.setId,
    name: s.name ?? '',
    description: s.description ?? '',
    categoryId: s.categoryId ?? null,
    repeatabilityMode: s.repeatabilityMode ?? null,
    endTime: s.endTime ?? null,
    raw: s,
  }));
  if (!rows.length) return;
  await db.insert(sbcSets).values(rows).onConflictDoUpdate({
    target: sbcSets.setId,
    set: {
      name: sql`excluded.name`,
      description: sql`excluded.description`,
      categoryId: sql`excluded.category_id`,
      repeatabilityMode: sql`excluded.repeatability_mode`,
      endTime: sql`excluded.end_time`,
      raw: sql`excluded.raw`,
      lastSeen: sql`now()`,
    },
  });
}

export async function saveChallenges(setId: number, list: Challenge[]): Promise<void> {
  const rows = uniqueBy(list, (c) => c.challengeId).map((c) => ({
    challengeId: c.challengeId,
    setId,
    name: c.name ?? '',
    type: c.type ?? null,
    formation: c.formation ?? null,
    elgOperation: c.elgOperation ?? null,
    elgReq: c.elgReq ?? [],
    raw: c,
  }));
  if (!rows.length) return;
  // challenges can arrive before their set; keep the FK happy with a placeholder the set later fills
  await db.insert(sbcSets).values({ setId, raw: {} }).onConflictDoNothing();
  await db.insert(challenges).values(rows).onConflictDoUpdate({
    target: challenges.challengeId,
    set: {
      setId: sql`excluded.set_id`,
      name: sql`excluded.name`,
      type: sql`excluded.type`,
      formation: sql`excluded.formation`,
      elgOperation: sql`excluded.elg_operation`,
      elgReq: sql`excluded.elg_req`,
      raw: sql`excluded.raw`,
      lastSeen: sql`now()`,
    },
  });
}

const CACHE_MS = 10 * 60 * 1000; // db:trust runs in another process, so entries also expire
const chosen = new Map<number, { bricks: BrickSlot[] | null; at: number }>();

/** Store one account's view of a challenge's locked slots. Null when stored, else why it was refused. */
export async function reportBricks(
  challengeId: number, personaId: number, bricks: BrickSlot[], capturedAt: number,
): Promise<string | null> {
  const [ch] = await db.select({ type: challenges.type }).from(challenges).where(eq(challenges.challengeId, challengeId));
  if (!ch) return 'unknown challenge';
  const why = rejectReason(ch.type, bricks);
  if (why) return why;
  const layout = canonicalBricks(bricks);
  await db
    .insert(brickReports)
    .values({ challengeId, personaId, layout, layoutHash: layoutHash(layout), capturedAt: new Date(capturedAt) })
    .onConflictDoNothing();
  chosen.delete(challengeId);
  return null;
}

/** The layout everyone uses for this challenge, or null if nobody has reported one yet. */
export async function sharedBricks(challengeId: number): Promise<BrickSlot[] | null> {
  const hit = chosen.get(challengeId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.bricks;
  const rows = await db.select().from(brickReports).where(eq(brickReports.challengeId, challengeId));
  const trusted = rows.length
    ? new Set((await db.select({ id: trustedAccounts.personaId }).from(trustedAccounts)).map((r) => r.id))
    : new Set<number>();
  const bricks = chooseLayout(
    rows.map((r) => ({ personaId: r.personaId, hash: r.layoutHash, bricks: r.layout, capturedAt: r.capturedAt.getTime() })),
    trusted,
  );
  chosen.set(challengeId, { bricks, at: Date.now() });
  return bricks;
}
