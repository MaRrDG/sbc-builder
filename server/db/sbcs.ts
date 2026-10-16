// SBC history and shared brick layouts. Sets / challenges are upserted (never deleted);
// brick reports are append-only and the shared layout is voted from them (server/bricks.ts).
import { and, countDistinct, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Challenge, SbcSet } from '../ea.js';
import type { BrickSlot } from '../layout.js';
import { canonicalBricks, chooseLayout, layoutHash, rejectReason } from '../bricks.js';
import { challengesFingerprint, setFingerprint, setSnapshot, shareableList, shareableSet, shareDecision } from '../shared-sbc.js';
import { db } from './index.js';
import { brickReports, challengeSightings, challenges, sbcSets, trustedAccounts } from './schema.js';

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

/**
 * One account relayed the SBC list: the app's rows (saveSets) always take it, the public snapshot of
 * each set only when shareDecision says so (a trusted account, or AGREE_PERSONAS accounts that sent the
 * same public fields; sightings share challenge_sightings under a `set:` fingerprint). Returns how many
 * snapshots were written.
 */
export async function relaySets(sets: unknown[], personaId: number): Promise<number> {
  const list = uniqueBy(sets.filter(shareableSet), (s) => s.setId);
  await saveSets(list);
  if (!list.length) return 0;
  const nowSec = Math.floor(Date.now() / 1000);
  const seen = list.map((s) => {
    const snap = setSnapshot(nowSec, s);
    return { setId: s.setId, snap, fingerprint: setFingerprint(s.setId, snap) };
  });
  await db
    .insert(challengeSightings)
    .values(seen.map(({ setId, fingerprint }) => ({ setId, fingerprint, personaId })))
    .onConflictDoUpdate({ target: [challengeSightings.setId, challengeSightings.fingerprint, challengeSightings.personaId], set: { seenAt: sql`now()` } });
  const trusted = (await trustedIds()).has(personaId);
  const agree = new Map<string, number>();
  if (!trusted) {
    const rows = await db
      .select({ fingerprint: challengeSightings.fingerprint, n: countDistinct(challengeSightings.personaId) })
      .from(challengeSightings)
      // set_id first: it leads the primary key, so this seeks instead of scanning every sighting
      .where(and(inArray(challengeSightings.setId, seen.map((x) => x.setId)), inArray(challengeSightings.fingerprint, seen.map((x) => x.fingerprint))))
      .groupBy(challengeSightings.fingerprint);
    for (const r of rows) agree.set(r.fingerprint, r.n);
  }
  let written = 0;
  for (const x of seen) {
    if (shareDecision(trusted, agree.get(x.fingerprint) ?? 0) !== 'share') continue;
    // unchanged snapshots are left alone, so public_at is when the public text last changed
    const done = await db
      .update(sbcSets)
      .set({ publicSnapshot: x.snap, publicAt: sql`now()` })
      .where(and(eq(sbcSets.setId, x.setId), sql`${sbcSets.publicSnapshot} is distinct from ${JSON.stringify(x.snap)}::jsonb`))
      .returning({ setId: sbcSets.setId });
    written += done.length;
  }
  return written;
}

/**
 * One account relayed a set's challenges (its own cache already has them). The shared rows only take
 * them when shared-sbc.ts shareDecision says so: a trusted account, or AGREE_PERSONAS accounts that
 * sent the same fingerprint. Otherwise only unknown challenges get an unvouched row (names for the
 * admin history), which seeds nobody and takes no brick report. Returns what happened.
 */
export async function relayChallenges(setId: number, list: unknown, personaId: number): Promise<'share' | 'hold' | 'invalid'> {
  if (!shareableList(setId, list)) return 'invalid';
  const fingerprint = challengesFingerprint(setId, list);
  await db
    .insert(challengeSightings)
    .values({ setId, fingerprint, personaId })
    .onConflictDoUpdate({ target: [challengeSightings.setId, challengeSightings.fingerprint, challengeSightings.personaId], set: { seenAt: sql`now()` } });
  const trusted = (await trustedIds()).has(personaId);
  const [agree] = await db
    .select({ n: countDistinct(challengeSightings.personaId) })
    .from(challengeSightings)
    .where(and(eq(challengeSightings.setId, setId), eq(challengeSightings.fingerprint, fingerprint)));
  const decision = shareDecision(trusted, agree?.n ?? 0);
  await saveChallenges(setId, list, decision === 'share', trusted);
  return decision;
}

async function saveChallenges(setId: number, list: Challenge[], vouched: boolean, trusted: boolean): Promise<void> {
  const rows = uniqueBy(list, (c) => c.challengeId).map((c) => ({
    challengeId: c.challengeId,
    setId,
    name: c.name ?? '',
    type: c.type ?? null,
    formation: c.formation ?? null,
    elgOperation: c.elgOperation ?? null,
    elgReq: c.elgReq ?? [],
    raw: c,
    vouched,
  }));
  if (!rows.length) return;
  // challenges can arrive before their set; keep the FK happy with a placeholder the set later fills
  await db.insert(sbcSets).values({ setId, raw: {} }).onConflictDoNothing();
  if (!vouched) {
    await db.insert(challenges).values(rows).onConflictDoNothing(); // never changes a row someone else relied on
    return;
  }
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
      vouched: sql`true`,
      lastSeen: sql`now()`,
    },
    // agreeing untrusted accounts never move a vouched challenge to another set or change its type
    ...(!trusted && {
      setWhere: sql`${challenges.vouched} = false or (${challenges.setId} = excluded.set_id and ${challenges.type} is not distinct from excluded.type)`,
    }),
  });
}

/** A set's vouched challenges as last seen since `since` (for seeding other accounts). */
export async function sharedChallenges(setId: number, since: Date): Promise<Challenge[]> {
  const rows = await db
    .select({ raw: challenges.raw })
    .from(challenges)
    .where(and(eq(challenges.setId, setId), eq(challenges.vouched, true), gte(challenges.lastSeen, since)));
  return rows.map((r) => r.raw as Challenge);
}

const CACHE_MS = 10 * 60 * 1000; // db:trust runs in another process, so entries also expire
const chosen = new Map<number, { bricks: BrickSlot[] | null; at: number }>();

/** Persona ids whose brick reports win over the vote. */
export async function trustedIds(): Promise<Set<number>> {
  return new Set((await db.select({ id: trustedAccounts.personaId }).from(trustedAccounts)).map((r) => r.id));
}

/** Trust or untrust an account (admin screen, or `npm run db:trust`); layouts are chosen again. */
export async function setTrusted(personaId: number, trusted: boolean, note = ''): Promise<void> {
  if (trusted)
    await db.insert(trustedAccounts).values({ personaId, note }).onConflictDoUpdate({ target: trustedAccounts.personaId, set: { note } });
  else await db.delete(trustedAccounts).where(eq(trustedAccounts.personaId, personaId));
  chosen.clear();
}

/** Store one account's view of a challenge's locked slots. Null when stored, else why it was refused. */
export async function reportBricks(
  challengeId: number, personaId: number, bricks: BrickSlot[], capturedAt: number,
): Promise<string | null> {
  const [ch] = await db.select({ type: challenges.type, vouched: challenges.vouched }).from(challenges).where(eq(challenges.challengeId, challengeId));
  if (!ch) return 'unknown challenge';
  // only a challenge a trusted account or several accounts vouched for: one forged list cannot invent a brick challenge
  if (!ch.vouched) return 'challenge not vouched';
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
  const trusted = rows.length ? await trustedIds() : new Set<number>();
  const bricks = chooseLayout(
    rows.map((r) => ({ personaId: r.personaId, hash: r.layoutHash, bricks: r.layout, capturedAt: r.capturedAt.getTime() })),
    trusted,
  );
  chosen.set(challengeId, { bricks, at: Date.now() });
  return bricks;
}
