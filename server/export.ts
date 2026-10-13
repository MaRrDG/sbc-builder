// Data export (GDPR art. 15/20): the real readers behind assembleExport. Reads only.
import { and, asc, eq, gte, inArray, sql } from 'drizzle-orm';
import { db } from './db/index.js';
import { KEEP_DAYS } from './db/events.js';
import {
  codes, completionMarks, completions, dailyPlays, dailyReminders, events, evoTrainings, personas, pointLedger, redemptions, subscriptions, users,
} from './db/schema.js';
import { planFor } from './plans.js';
import { readCache } from './store.js';
import type { AccountInfo } from './accounts.js';
import type { MeterData } from './meter.js';
import { assembleExport, type ExportReaders } from './export-rules.js';

const iso = (d: Date | null) => (d ? d.toISOString() : null);

const readers: ExportReaders = {
  async user(userId) {
    const [u] = await db.select().from(users).where(eq(users.id, userId));
    return u ?? null;
  },
  plan: (userId) => planFor(userId) as unknown as Promise<Record<string, unknown>>,
  subscriptions: (userId) => db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).orderBy(asc(subscriptions.createdAt)),
  personas: (userId) => db.select({ personaId: personas.personaId, linkedAt: personas.linkedAt }).from(personas).where(eq(personas.userId, userId)),
  async accountInfo(id) {
    return ((await readCache<AccountInfo>(`accounts/${id}/account`))?.data as unknown as Record<string, unknown>) ?? null;
  },
  club: (id) => readCache<unknown>(`accounts/${id}/club`),
  async requestsToday(id) {
    const m = (await readCache<MeterData>(`accounts/${id}/ea-requests`))?.data;
    return m ? m.count : null;
  },
  async completions(id) {
    const r = await db.select().from(completions).where(eq(completions.personaId, id)).orderBy(asc(completions.at));
    return r.map((c) => ({ kind: c.kind, itemId: c.itemId, seq: c.seq, count: c.count, baseline: c.baseline, at: iso(c.at) }));
  },
  async marks(id) {
    const r = await db.select().from(completionMarks).where(eq(completionMarks.personaId, id));
    return r.map((c) => ({ kind: c.kind, itemId: c.itemId, count: c.count, done: c.done, firstSeen: iso(c.firstSeen), updatedAt: iso(c.updatedAt) }));
  },
  async evos(id) {
    const r = await db.select().from(evoTrainings).where(eq(evoTrainings.personaId, id));
    return r.map((e) => ({
      slotId: e.slotId, level: e.level, levelCount: e.levelCount, slotName: e.slotName, itemId: e.itemId, player: e.player,
      startedAt: iso(e.startedAt), endsAt: iso(e.endsAt), ready: e.ready, notifiedAt: iso(e.notifiedAt),
    }));
  },
  async daily(userId) {
    const [plays, reminders] = await Promise.all([
      db.select().from(dailyPlays).where(eq(dailyPlays.userId, userId)).orderBy(asc(dailyPlays.day)),
      db.select().from(dailyReminders).where(eq(dailyReminders.userId, userId)).orderBy(asc(dailyReminders.day)),
    ]);
    return {
      plays: plays.map((p) => ({ day: p.day, guesses: p.guesses, won: p.won, finishedAt: iso(p.finishedAt) })),
      reminders: reminders.map((p) => ({ day: p.day, sentAt: iso(p.sentAt) })),
    };
  },
  async invites(userId) {
    const own = await db.select().from(codes).where(eq(codes.ownerId, userId));
    const ownCodes = own.map((c) => c.code);
    const [mine, onOwn, ledger] = await Promise.all([
      db.select().from(redemptions).where(eq(redemptions.userId, userId)),
      ownCodes.length ? db.select().from(redemptions).where(inArray(redemptions.code, ownCodes)) : Promise.resolve([]),
      db.select().from(pointLedger).where(eq(pointLedger.userId, userId)).orderBy(asc(pointLedger.at)),
    ]);
    return {
      codes: own.map((c) => ({ code: c.code, kind: c.kind, days: c.days, maxUses: c.maxUses, uses: c.uses, expiresAt: iso(c.expiresAt), disabled: c.disabled, createdAt: iso(c.createdAt) })),
      // codes I used, plus uses of my own codes by others (no ids of the other users)
      redemptions: [
        ...mine.map((r) => ({ own: false, code: r.code, kind: r.kind, status: r.status, at: iso(r.at), grantedAt: iso(r.grantedAt) })),
        ...onOwn.filter((r) => r.userId !== userId).map((r) => ({ own: true, code: r.code, kind: r.kind, status: r.status, at: iso(r.at), grantedAt: iso(r.grantedAt) })),
      ],
      // an 'invite' row's ref is the invitee's user id: left out
      points: ledger.map((l) => ({ delta: l.delta, reason: l.reason, ref: l.reason === 'invite' ? null : l.ref, at: iso(l.at) })),
    };
  },
  async events(userId) {
    const r = await db
      .select()
      .from(events)
      .where(and(eq(events.userId, userId), gte(events.at, sql`now() - make_interval(days => ${KEEP_DAYS})`)))
      .orderBy(asc(events.at));
    return r.map((e) => ({ at: iso(e.at), type: e.type, personaId: e.personaId, data: e.data }));
  },
};

export const buildExport = (userId: string) => assembleExport(userId, readers);
