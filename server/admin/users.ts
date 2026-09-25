// Users for the admin panel: filtered, sorted and paged in SQL; account state comes from the cache.
import { and, asc, count, desc, eq, exists, gt, gte, ilike, inArray, lt, lte, not, or, sql, type SQL } from 'drizzle-orm';
import { db } from '../db/index.js';
import { events, personas, users } from '../db/schema.js';
import { latestExtension } from '../extension.js';
import { planInfo } from '../plans.js';
import { adminEmails } from './auth.js';
import { accountRows, owners } from './accounts.js';
import { clampPage, fillDays, isOutdated, isProblem, lastDays, likePattern, PAGE_SIZE, type UserQuery } from './query.js';

const DAY = 24 * 60 * 60 * 1000;
export const TZ = () => process.env.SBC_DROP_TZ ?? 'Europe/Bucharest';

/** Effective Premium, same rule as plan.ts effectivePlan: admins, or stored premium not yet ended. */
export function premiumSql(now: Date): SQL {
  const admins = adminEmails();
  const stored = and(eq(users.plan, 'premium'), or(sql`${users.premiumUntil} is null`, gt(users.premiumUntil, now)))!;
  return admins.length ? or(stored, inArray(sql`lower(${users.email})`, admins))! : stored;
}
export const expiringSql = (now: Date): SQL =>
  and(eq(users.plan, 'premium'), gt(users.premiumUntil, now), lte(users.premiumUntil, new Date(now.getTime() + 7 * DAY)))!;

// users.id spelled out: drizzle prints it unqualified here, and inside the subquery "id" would be events.id
const solves7d = sql<number>`(select count(*)::int from ${events} e where e.user_id = "users"."id" and e.type = 'solve' and e.at > now() - interval '7 days')`;
const ownsAny = (ids?: number[]) =>
  exists(
    db.select({ x: sql`1` }).from(personas).where(and(eq(personas.userId, users.id), ids ? inArray(personas.personaId, ids.length ? ids : [-1]) : undefined)),
  );

export async function listUsers(q: UserQuery) {
  const now = new Date();
  const accs = await accountRows();
  const latest = (await latestExtension()).version;
  const where: (SQL | undefined)[] = [];
  if (q.q) {
    const s = q.q.toLowerCase();
    const ids = accs.filter((a) => String(a.personaId) === q.q || a.personaName.toLowerCase().includes(s) || a.clubName.toLowerCase().includes(s)).map((a) => a.personaId);
    where.push(or(ilike(users.email, likePattern(q.q)), ids.length ? ownsAny(ids) : undefined));
  }
  if (q.plan === 'premium') where.push(premiumSql(now));
  if (q.plan === 'free') where.push(not(premiumSql(now)));
  if (q.plan === 'expiring') where.push(expiringSql(now));
  if (q.activity === '24h') where.push(gt(users.lastSeenAt, new Date(now.getTime() - DAY)));
  if (q.activity === '7d') where.push(gt(users.lastSeenAt, new Date(now.getTime() - 7 * DAY)));
  if (q.activity === 'inactive30') where.push(lt(users.lastSeenAt, new Date(now.getTime() - 30 * DAY)));
  if (q.ea === 'with') where.push(ownsAny());
  if (q.ea === 'without') where.push(not(ownsAny()));
  if (q.ea === 'problem') where.push(ownsAny(accs.filter(isProblem).map((a) => a.personaId)));
  if (q.ea === 'outdated') where.push(ownsAny(accs.filter((a) => isOutdated(a.extVersion, latest)).map((a) => a.personaId)));
  const cond = and(...where);

  const [{ n }] = await db.select({ n: count() }).from(users).where(cond);
  const page = clampPage(q.page, n);
  const col = { lastSeen: users.lastSeenAt, createdAt: users.createdAt, solves7d, email: users.email }[q.sort];
  const order = q.dir === 'asc' ? asc(col) : desc(col);
  const rows = await db
    .select({ u: users, solves7d })
    .from(users)
    .where(cond)
    .orderBy(order, asc(users.id))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  const own = rows.length
    ? await db.select({ personaId: personas.personaId, userId: personas.userId }).from(personas).where(inArray(personas.userId, rows.map((r) => r.u.id)))
    : [];
  const online = new Set(accs.filter((a) => a.online).map((a) => a.personaId));
  const admins = adminEmails();
  return {
    total: n,
    page,
    pageSize: PAGE_SIZE,
    rows: rows.map(({ u, solves7d: s7 }) => {
      const mine = own.filter((o) => o.userId === u.id);
      const admin = !!u.email && admins.includes(u.email.toLowerCase());
      return {
        id: u.id,
        email: u.email,
        createdAt: u.createdAt.getTime(),
        lastSeenAt: u.lastSeenAt.getTime(),
        planSet: u.plan === 'premium' ? ('premium' as const) : ('free' as const),
        plan: planInfo(u, admin, now.getTime()),
        admin,
        accounts: mine.length,
        online: mine.filter((o) => online.has(o.personaId)).length,
        solves7d: s7,
      };
    }),
  };
}

/** Solves per day for one user (or everyone when userId is null), found and not found. */
export async function solvesByDay(userId: string | null, days: string[]) {
  const day = sql<string>`to_char(${events.at} at time zone ${TZ()}, 'YYYY-MM-DD')`;
  const rows = await db
    .select({
      day,
      found: sql<number>`count(*) filter (where (${events.data}->>'found')::boolean)::int`,
      notFound: sql<number>`count(*) filter (where not coalesce((${events.data}->>'found')::boolean, false))::int`,
    })
    .from(events)
    .where(and(eq(events.type, 'solve'), gte(events.at, new Date(Date.parse(`${days[0]}T00:00:00Z`) - DAY)), userId ? eq(events.userId, userId) : undefined))
    .groupBy(sql`1`); // by position: the tz is a bind parameter, so the expression would not match
  return { days, found: fillDays(days, rows, (r) => r.found), notFound: fillDays(days, rows, (r) => r.notFound) };
}

export async function userDetail(id: string) {
  const [u] = await db.select().from(users).where(eq(users.id, id));
  if (!u) return null;
  const now = Date.now();
  const admin = !!u.email && adminEmails().includes(u.email.toLowerCase());
  const [accs, own] = await Promise.all([accountRows(), owners()]);
  const mine = [...own.entries()].filter(([, o]) => o.userId === id);
  const byId = new Map(accs.map((a) => [a.personaId, a]));
  return {
    user: { id: u.id, email: u.email, createdAt: u.createdAt.getTime(), lastSeenAt: u.lastSeenAt.getTime(), admin },
    planSet: u.plan === 'premium' ? ('premium' as const) : ('free' as const),
    plan: planInfo(u, admin, now),
    accounts: mine.flatMap(([pid, o]) => {
      const a = byId.get(pid);
      return a ? [{ ...a, linkedAt: o.linkedAt, previousUserId: o.previousUserId }] : [];
    }),
    missing: mine.filter(([pid]) => !byId.has(pid)).map(([pid]) => pid),
    solves: await solvesByDay(id, lastDays(30, now, TZ())),
    latestExtension: (await latestExtension()).version,
  };
}

export type UserRow = Awaited<ReturnType<typeof listUsers>>['rows'][number];
export type UserDetail = NonNullable<Awaited<ReturnType<typeof userDetail>>>;
