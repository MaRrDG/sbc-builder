// EA accounts as the admin panel sees them: file cache + live meter + DB owner. Never calls EA.
import { eq } from 'drizzle-orm';
import type { ClubItem } from '../ea.js';
import { listAccounts, type Account } from '../accounts.js';
import { db } from '../db/index.js';
import { trustedIds } from '../db/sbcs.js';
import { personas, users } from '../db/schema.js';
import { latestExtension } from '../extension.js';
import { readCache } from '../store.js';
import { forcedSync, getStatus, lastSbcDrop } from '../sync.js';
import { filterAccounts, paginate, type AccountQuery } from './query.js';

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

const MEMO_MS = 5000;
let memo: { at: number; rows: Promise<AdminAccount[]> } | null = null;

/** Every account's row; reused for 5 s so a table + filter change doesn't re-read every cache file. */
export function accountRows(): Promise<AdminAccount[]> {
  if (memo && Date.now() - memo.at < MEMO_MS) return memo.rows;
  const rows = (async () => {
    const drop = lastSbcDrop();
    const trusted = await trustedIds();
    return Promise.all(listAccounts().map((a) => accountRow(a, drop, trusted)));
  })();
  memo = { at: Date.now(), rows };
  rows.catch(() => (memo = null));
  return rows;
}
/** After an admin action (trust, sync) the next read is fresh. */
export const invalidateAccountRows = () => void (memo = null);

export async function owners() {
  const rows = await db
    .select({ personaId: personas.personaId, userId: personas.userId, email: users.email, linkedAt: personas.linkedAt, previousUserId: personas.previousUserId })
    .from(personas)
    .innerJoin(users, eq(users.id, personas.userId));
  return new Map(rows.map((r) => [r.personaId, { userId: r.userId, email: r.email, linkedAt: r.linkedAt.getTime(), previousUserId: r.previousUserId }]));
}

export async function withOwners() {
  const [rows, own] = await Promise.all([accountRows(), owners()]);
  return rows.map((a) => ({ ...a, ownerId: own.get(a.personaId)?.userId ?? null, ownerEmail: own.get(a.personaId)?.email ?? null }));
}

export async function listAccountsPage(q: AccountQuery) {
  const latest = (await latestExtension()).version;
  return { ...paginate(filterAccounts(await withOwners(), q, latest), q.page), latestExtension: latest };
}
