// Admin dashboard: who uses FC Solver, how fresh every account's data is, and a manual sync for
// everyone. Admins are users whose (Clerk primary) email is in ADMIN_EMAILS.
import type { FastifyRequest } from 'fastify';
import { count, eq } from 'drizzle-orm';
import { SessionError, type ClubItem } from './ea.js';
import { listAccounts, type Account } from './accounts.js';
import { siteUser } from './auth.js';
import { db } from './db/index.js';
import { trustedIds } from './db/sbcs.js';
import { brickReports, challenges, personas, sbcSets, trustedAccounts, users } from './db/schema.js';
import { latestExtension } from './extension.js';
import { readCache } from './store.js';
import { forcedSync, getStatus, lastSbcDrop } from './sync.js';

// read on use: .env is loaded by initDb(), after this module is imported
const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? 'dragutmariotheodor1@gmail.com')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export async function isAdmin(userId: string): Promise<boolean> {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  const email = row?.email.toLowerCase() ?? '';
  return !!email && adminEmails().includes(email);
}

export async function requireAdmin(req: FastifyRequest): Promise<string> {
  const userId = await siteUser(req);
  if (!(await isAdmin(userId))) throw new SessionError('Admins only.', 403, 'adminOnly');
  return userId;
}

const DAY = 24 * 60 * 60 * 1000;

async function accountRow(acc: Account, drop: number, trusted: Set<number>) {
  const st = await getStatus(acc);
  const club = await readCache<ClubItem[]>(acc.key('club'));
  return {
    personaId: acc.id,
    personaName: acc.info.personaName,
    clubName: acc.info.clubName,
    mode: acc.clientMode ? ('client' as const) : ('legacy' as const),
    extVersion: acc.info.extVersion ?? null,
    online: acc.hasSession,
    clubAt: st.clubAt,
    sbcAt: st.sbcAt,
    clubStale: !st.clubAt || st.clubAt < drop,
    sbcStale: !st.sbcAt || st.sbcAt < drop,
    players: club?.data.length ?? 0,
    unassigned: st.unassigned,
    running: st.running,
    error: st.error,
    ea: { today: st.ea.today, limit: st.ea.limit, pausedUntil: st.ea.pausedUntil },
    clubSyncs: st.clubSyncs,
    forced: forcedSync(acc),
    trusted: trusted.has(acc.id), // its brick layouts win over the vote
  };
}

export type AdminAccount = Awaited<ReturnType<typeof accountRow>>;

export async function adminStats() {
  const now = Date.now();
  const drop = lastSbcDrop();
  const trustedSet = await trustedIds();
  const accounts = await Promise.all(listAccounts().map((a) => accountRow(a, drop, trustedSet)));
  const byId = new Map(accounts.map((a) => [a.personaId, a]));

  const userRows = await db.select().from(users);
  const owners = await db.select({ personaId: personas.personaId, userId: personas.userId, linkedAt: personas.linkedAt }).from(personas);
  const ownerOf = new Map(owners.map((o) => [o.personaId, o.userId]));
  const [[sets], [chs], [bricks], [trusted]] = await Promise.all([
    db.select({ n: count() }).from(sbcSets),
    db.select({ n: count() }).from(challenges),
    db.select({ n: count() }).from(brickReports),
    db.select({ n: count() }).from(trustedAccounts),
  ]);

  const latest = (await latestExtension()).version;
  const versions: Record<string, number> = {};
  for (const a of accounts) {
    const v = a.extVersion ?? '?';
    versions[v] = (versions[v] ?? 0) + 1;
  }

  const since = (t: Date, ms: number) => now - t.getTime() < ms;
  return {
    at: now,
    lastDrop: drop,
    latestExtension: latest,
    users: {
      total: userRows.length,
      active24h: userRows.filter((u) => since(u.lastSeenAt, DAY)).length,
      active7d: userRows.filter((u) => since(u.lastSeenAt, 7 * DAY)).length,
      new7d: userRows.filter((u) => since(u.createdAt, 7 * DAY)).length,
      withPersona: new Set(owners.map((o) => o.userId)).size,
    },
    accounts: {
      total: accounts.length,
      linked: accounts.filter((a) => ownerOf.has(a.personaId)).length,
      client: accounts.filter((a) => a.mode === 'client').length,
      legacy: accounts.filter((a) => a.mode === 'legacy').length,
      online: accounts.filter((a) => a.online).length,
      clubStale: accounts.filter((a) => a.clubStale).length,
      sbcStale: accounts.filter((a) => a.sbcStale).length,
      failing: accounts.filter((a) => a.error).length,
      paused: accounts.filter((a) => a.ea.pausedUntil).length,
      atLimit: accounts.filter((a) => a.ea.today >= a.ea.limit).length,
      versions,
    },
    ea: { today: accounts.reduce((n, a) => n + a.ea.today, 0) },
    db: { sets: sets.n, challenges: chs.n, brickReports: bricks.n, trusted: trusted.n },
    userList: userRows
      .sort((a, b) => b.lastSeenAt.getTime() - a.lastSeenAt.getTime())
      .map((u) => ({
        id: u.id,
        email: u.email,
        createdAt: u.createdAt.getTime(),
        lastSeenAt: u.lastSeenAt.getTime(),
        personas: owners.filter((o) => o.userId === u.id).flatMap((o) => byId.get(o.personaId) ?? []),
      })),
    // accounts whose extension never linked them to a site user (old extensions)
    unlinked: accounts.filter((a) => !ownerOf.has(a.personaId)),
  };
}
