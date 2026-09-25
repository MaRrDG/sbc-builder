// Admin dashboard: KPIs, daily series, what needs attention, extension versions. Reads DB + cache only.
import { and, count, eq, gte, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { brickReports, challenges, events, sbcSets, trustedAccounts, users } from '../db/schema.js';
import { latestExtension } from '../extension.js';
import { meterDay } from '../meter.js';
import { lastSbcDrop } from '../sync.js';
import { withOwners } from './accounts.js';
import { fillDays, isOutdated, isProblem, lastDays } from './query.js';
import { expiringSql, premiumSql, solvesByDay, TZ } from './users.js';

const DAY = 24 * 60 * 60 * 1000;

export type AttentionItem =
  | { kind: 'error' | 'paused' | 'atLimit' | 'outdated'; personaId: number; personaName: string; userId: string | null; detail: string | null }
  | { kind: 'expiring'; userId: string; email: string; until: number };

export async function overview(range: 7 | 30) {
  const now = Date.now();
  const nowD = new Date(now);
  const tz = TZ();
  const days = lastDays(range, now, tz);
  const since = new Date(Date.parse(`${days[0]}T00:00:00Z`) - DAY); // a day of slack for the tz offset; fillDays drops extras
  const latest = (await latestExtension()).version;
  const accs = await withOwners();

  // raw sql params: postgres-js binds strings, not Date objects
  const dayOf = (col: typeof events.at | typeof users.createdAt) => sql<string>`to_char(${col} at time zone ${tz}, 'YYYY-MM-DD')`;
  const evDay = dayOf(events.at);
  const [userAgg] = await db
    .select({
      total: count(),
      active24h: sql<number>`count(*) filter (where ${users.lastSeenAt} > ${new Date(now - DAY).toISOString()})::int`,
      active7d: sql<number>`count(*) filter (where ${users.lastSeenAt} > ${new Date(now - 7 * DAY).toISOString()})::int`,
      new7d: sql<number>`count(*) filter (where ${users.createdAt} > ${new Date(now - 7 * DAY).toISOString()})::int`,
      premium: sql<number>`count(*) filter (where ${premiumSql(nowD)})::int`,
      expiring: sql<number>`count(*) filter (where ${expiringSql(nowD)})::int`,
    })
    .from(users);
  const signupDay = dayOf(users.createdAt);
  const [signups, syncs, eaDays, solves, expiringUsers, [sets], [chs], [bricks], [trusted]] = await Promise.all([
    db.select({ day: signupDay, n: sql<number>`count(*)::int` }).from(users).where(gte(users.createdAt, since)).groupBy(sql`1`),
    db
      .select({ day: evDay, n: sql<number>`count(*)::int`, failed: sql<number>`count(*) filter (where not (${events.data}->>'ok')::boolean)::int` })
      .from(events)
      .where(and(eq(events.type, 'sync'), gte(events.at, since)))
      .groupBy(sql`1`), // by position (tz is a bind parameter)
    // one ea_day row per account and day; a repeat after a restart is collapsed by max()
    db.execute<{ day: string; n: number }>(sql`
      select day, sum(c)::int as n from (
        select ${events.personaId} as p, ${events.data}->>'day' as day, max((${events.data}->>'count')::int) as c
        from ${events} where ${events.type} = 'ea_day' and ${events.at} >= ${since.toISOString()} group by 1, 2
      ) t group by day`),
    solvesByDay(null, days),
    db.select({ id: users.id, email: users.email, until: users.premiumUntil }).from(users).where(expiringSql(nowD)),
    db.select({ n: count() }).from(sbcSets),
    db.select({ n: count() }).from(challenges),
    db.select({ n: count() }).from(brickReports),
    db.select({ n: count() }).from(trustedAccounts),
  ]);

  const eaToday = accs.reduce((n, a) => n + a.ea.today, 0);
  const eaRequests = fillDays(days, [...eaDays].filter((r) => r.day !== meterDay()), (r) => Number(r.n));
  eaRequests[eaRequests.length - 1] = eaToday; // today comes from the live meters

  const attention: AttentionItem[] = [
    ...accs.flatMap((a): AttentionItem[] => {
      const base = { personaId: a.personaId, personaName: a.personaName, userId: a.ownerId };
      if (a.error) return [{ kind: 'error' as const, ...base, detail: a.error }];
      if (a.ea.pausedUntil) return [{ kind: 'paused' as const, ...base, detail: null }];
      if (a.ea.today >= a.ea.limit) return [{ kind: 'atLimit' as const, ...base, detail: null }];
      if (isOutdated(a.extVersion, latest)) return [{ kind: 'outdated' as const, ...base, detail: a.extVersion }];
      return [];
    }),
    ...expiringUsers.map((u) => ({ kind: 'expiring' as const, userId: u.id, email: u.email, until: u.until!.getTime() })),
  ];

  const versions = new Map<string, number>();
  for (const a of accs) versions.set(a.extVersion ?? '?', (versions.get(a.extVersion ?? '?') ?? 0) + 1);

  return {
    at: now,
    lastDrop: lastSbcDrop(),
    latestExtension: latest,
    range,
    kpis: {
      users: { total: userAgg.total, active24h: userAgg.active24h, active7d: userAgg.active7d, new7d: userAgg.new7d },
      premium: { total: userAgg.premium, expiring7d: userAgg.expiring },
      accounts: { total: accs.length, online: accs.filter((a) => a.online).length, problem: accs.filter(isProblem).length, unlinked: accs.filter((a) => !a.ownerId).length },
      solvesToday: solves.found.at(-1)! + solves.notFound.at(-1)!,
      ea: { today: eaToday, limit: accs.reduce((n, a) => n + a.ea.limit, 0) },
    },
    series: {
      days,
      found: solves.found,
      notFound: solves.notFound,
      signups: fillDays(days, signups, (r) => r.n),
      eaRequests,
      syncs: fillDays(days, syncs, (r) => r.n),
      syncFailed: fillDays(days, syncs, (r) => r.failed),
    },
    attention,
    versions: [...versions].map(([version, n]) => ({ version, count: n, latest: version === latest })).sort((a, b) => b.count - a.count),
    db: { sets: sets.n, challenges: chs.n, brickReports: bricks.n, trusted: trusted.n },
  };
}
export type Overview = Awaited<ReturnType<typeof overview>>;
