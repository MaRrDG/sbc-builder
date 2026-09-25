// /api/admin/*: admins only (ADMIN_EMAILS). Reads DB + cache; the POSTs are the existing actions.
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { accountById, listAccounts } from '../accounts.js';
import { db } from '../db/index.js';
import { userEventCount, userEvents } from '../db/events.js';
import { setTrusted } from '../db/sbcs.js';
import { resetQuota, setPlan } from '../db/users.js';
import { users } from '../db/schema.js';
import { adminSync } from '../sync.js';
import { requireAdmin } from './auth.js';
import { invalidateAccountRows, listAccountsPage } from './accounts.js';
import { overview } from './overview.js';
import { clampPage, PAGE_SIZE, parseAccountQuery, parsePage, parseRange, parseUserQuery } from './query.js';
import { listUsers, userDetail } from './users.js';

type Q = { Querystring: Record<string, string> };

export function registerAdminRoutes(app: FastifyInstance) {
  app.get<Q>('/api/admin/overview', async (req) => {
    await requireAdmin(req);
    return overview(parseRange(req.query.range));
  });
  app.get<Q>('/api/admin/users', async (req) => {
    await requireAdmin(req);
    return listUsers(parseUserQuery(req.query));
  });
  app.get<{ Params: { id: string } }>('/api/admin/users/:id', async (req, reply) => {
    await requireAdmin(req);
    const d = await userDetail(req.params.id);
    return d ?? reply.code(404).send({ error: 'unknown user' });
  });
  app.get<{ Params: { id: string } } & Q>('/api/admin/users/:id/events', async (req) => {
    await requireAdmin(req);
    const page = clampPage(parsePage(req.query.page), await userEventCount(req.params.id));
    return { ...(await userEvents(req.params.id, page, PAGE_SIZE)), page, pageSize: PAGE_SIZE };
  });
  app.get<Q>('/api/admin/accounts', async (req) => {
    await requireAdmin(req);
    return listAccountsPage(parseAccountQuery(req.query));
  });

  /** Sync every account (or the listed ones) with the usual limits; offline ones sync on their next visit. */
  app.post<{ Body: { what?: 'club' | 'sbc' | 'all'; personaIds?: number[] } }>('/api/admin/sync', async (req, reply) => {
    await requireAdmin(req);
    const what = req.body?.what ?? 'all';
    if (!['club', 'sbc', 'all'].includes(what)) return reply.code(400).send({ error: 'invalid what' });
    const ids = req.body?.personaIds;
    if (ids !== undefined && (!Array.isArray(ids) || !ids.every(Number.isInteger))) return reply.code(400).send({ error: 'invalid personaIds' });
    const targets = ids ? ids.flatMap((id) => accountById(id) ?? []) : listAccounts();
    const results = [];
    for (const acc of targets) results.push(await adminSync(acc, what));
    invalidateAccountRows();
    return { results };
  });

  /** Trust or untrust an EA account: its locked-slot (brick) layouts then win over the vote. */
  app.post<{ Body: { personaId?: number; trusted?: boolean } }>('/api/admin/trust', async (req, reply) => {
    const adminId = await requireAdmin(req);
    const { personaId, trusted } = req.body ?? {};
    if (!Number.isInteger(personaId) || typeof trusted !== 'boolean') return reply.code(400).send({ error: 'invalid payload' });
    const acc = accountById(personaId!);
    if (!acc) return reply.code(404).send({ error: 'unknown account' });
    const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, adminId));
    await setTrusted(acc.id, trusted, `admin ${row?.email ?? adminId}, ${new Date().toISOString().slice(0, 10)}`);
    invalidateAccountRows();
    return { ok: true, personaId: acc.id, trusted };
  });

  /** Free or Premium, optionally until a date (then Free again). The quota is left as it is. */
  app.post<{ Body: { userId?: string; tier?: string; premiumUntil?: string | null } }>('/api/admin/plan', async (req, reply) => {
    await requireAdmin(req);
    const { userId, tier, premiumUntil } = req.body ?? {};
    if (premiumUntil != null && typeof premiumUntil !== 'string') return reply.code(400).send({ error: 'invalid payload' });
    const until = premiumUntil ? new Date(premiumUntil) : null;
    if (typeof userId !== 'string' || (tier !== 'free' && tier !== 'premium') || (until && Number.isNaN(until.getTime())))
      return reply.code(400).send({ error: 'invalid payload' });
    if (!(await setPlan(userId, tier, tier === 'premium' ? until : null))) return reply.code(404).send({ error: 'unknown user' });
    invalidateAccountRows();
    return { ok: true };
  });

  /** Gives a Free user their whole week back. */
  app.post<{ Body: { userId?: string } }>('/api/admin/quota-reset', async (req, reply) => {
    await requireAdmin(req);
    const userId = req.body?.userId;
    if (typeof userId !== 'string') return reply.code(400).send({ error: 'invalid payload' });
    if (!(await resetQuota(userId))) return reply.code(404).send({ error: 'unknown user' });
    invalidateAccountRows();
    return { ok: true };
  });
}
