import Fastify, { type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SessionError, THROTTLE_CODES, type ClubItem } from './ea.js';
import { loadMeta } from './meta.js';
import { parseRequirements, serializeRequirement } from './sbc.js';
import { toPlayer, evaluate } from './squad.js';
import { solve, diagnose, type SolveOptions, type ActiveSquad } from './solver.js';
import { challengeLayout, isBrickChallenge } from './layout.js';
import { readCache, ROOT } from './store.js';
import { adminSync, applySubmittedSbc, autoSyncAll, autoSyncSoon, getChallenges, getStatus, markEdited, refreshSbcsOnVisit, requestSync, type SetsData } from './sync.js';
import { enqueue, findJob, finishJob, hasPending, nextJob, webAppOpen, webAppReturned } from './jobs.js';
import { loadAccounts, registerSession, accountByKey, accountById, hello, listAccounts, type Account } from './accounts.js';
import { adminStats, isAdmin, requireAdmin } from './admin.js';
import { initAuth, optionalSiteAccount, siteAccount, siteUser } from './auth.js';
import { linkDecision } from './auth-rules.js';
import { consumeLinkToken, createLinkToken, linkTokenUser, personaRow, personasOf, setOwner, unlinkPersona } from './db/users.js';
import { eq } from 'drizzle-orm';
import { buildExtensionZip, requestOrigin, latestExtension } from './extension.js';
import { applyWebAppEvent, WATCHED_PATH, type WebAppEvent } from './events.js';
import { db, initDb } from './db/index.js';
import { users } from './db/schema.js';

const PORT = Number(process.env.PORT ?? 5178);
const app = Fastify({ logger: { level: 'warn' }, trustProxy: true });

// The SID bridge extension posts from a chrome-extension:// origin.
app.addHook('onRequest', async (req, reply) => {
  const origin = req.headers.origin;
  if (origin && (origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost'))) {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Account-Key, Authorization, X-Persona');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') return reply.code(204).send();
});

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  const status = err instanceof SessionError ? err.status : err.statusCode ?? 500;
  // `code` / `params` are ours (SessionError), for the site to translate; never Fastify's own codes
  const own = err instanceof SessionError && err.msgCode ? { code: err.msgCode, params: err.params ?? {} } : {};
  reply.code(status).send({ error: err.message, ...own });
});

await loadAccounts();

const keyOf = (req: FastifyRequest) => {
  const k = req.headers['x-account-key'];
  return Array.isArray(k) ? k[0] : k;
};

/** Extension requests: the account behind its secret access key. */
function account(req: FastifyRequest): Account {
  const acc = accountByKey(keyOf(req));
  if (!acc) throw new SessionError('Unknown account. Connect through the extension first.', 401, 'unknownAccount');
  return acc;
}

const metaFor = (acc: Account) => loadMeta(acc.key('chemProfiles'));

// ---- accounts / session ----------------------------------------------------
app.post<{ Body: { sid: string; contentGuid?: string; extVersion?: string } }>('/api/session', async (req, reply) => {
  const { sid, contentGuid, extVersion } = req.body ?? ({} as never);
  if (!sid || !/^[0-9a-f-]{36}$/i.test(sid)) return reply.code(400).send({ error: 'invalid sid' });
  const guid = contentGuid && /^[0-9A-F-]{36}$/i.test(contentGuid) ? contentGuid : undefined;
  const version = extVersion && /^\d+(\.\d+){1,3}$/.test(extVersion) ? extVersion : undefined;
  // no sync here: the minute ticker runs it once the session is a few seconds old (see autoSync)
  const { account: acc } = await registerSession(sid, guid, version);
  // The key goes back only to the extension that proved it holds a live session.
  return { ok: true, account: acc, accessKey: acc.info.accessKey };
});

// ---- users (site, Clerk session) --------------------------------------------------
/** Who is signed in and which EA personas they own. */
app.get('/api/me', async (req) => {
  const userId = await siteUser(req);
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  const personas = (await personasOf(userId)).flatMap((id) => {
    const a = accountById(id);
    return a ? [a.toJSON()] : [];
  });
  return { user: { id: userId, email: row?.email ?? '' }, personas, admin: await isAdmin(userId) };
});

/** One-time migration of solver settings saved under old browser keys: key prefix -> persona, own personas only. */
app.post<{ Body: { keys?: string[] } }>('/api/me/legacy-keys', async (req) => {
  const userId = await siteUser(req);
  const mine = new Set(await personasOf(userId));
  const map: Record<string, number> = {};
  for (const key of (req.body?.keys ?? []).slice(0, 20)) {
    const a = typeof key === 'string' ? accountByKey(key) : null;
    if (a && mine.has(a.id)) map[key.slice(0, 8)] = a.id;
  }
  return { map };
});

/** A short-lived token the site hands the extension, so its next hello links the persona to this user. */
app.post('/api/link-token', async (req) => {
  const userId = await siteUser(req);
  return { token: await createLinkToken(userId), expiresIn: 600 };
});

app.delete<{ Params: { id: string } }>('/api/personas/:id', async (req, reply) => {
  const userId = await siteUser(req);
  const ok = await unlinkPersona(Number(req.params.id), userId);
  if (!ok) return reply.code(404).send({ error: 'not linked to you' });
  return { ok: true };
});

app.get('/api/status', async (req) => {
  const acc = await siteAccount(req);
  return { account: acc, sync: await getStatus(acc), extension: await latestExtension() };
});

/** Latest extension release; the extension polls this to show its own update notice. */
app.get('/api/extension/version', () => latestExtension());

/** The extension says which version it is right after install/update, no EA session needed. */
app.post<{ Body: { version: string } }>('/api/extension/report', async (req, reply) => {
  const acc = account(req);
  const version = req.body?.version;
  if (!version || !/^\d+(\.\d+){1,3}$/.test(version)) return reply.code(400).send({ error: 'invalid version' });
  if (acc.info.extVersion !== version) {
    acc.info.extVersion = version;
    await acc.save();
  }
  return latestExtension();
});

app.post<{ Body: { what: 'club' | 'sbc' | 'all' } }>('/api/sync', async (req) => {
  const acc = await siteAccount(req);
  await requestSync(acc, req.body?.what ?? 'all');
  return getStatus(acc);
});

/** The site's SBC page opened: refresh the SBC list through the web app tab unless it is fresh. */
app.post('/api/sync/visit', async (req) => {
  const acc = await siteAccount(req);
  await refreshSbcsOnVisit(acc);
  return getStatus(acc);
});

/** Read a started challenge's squad (locked slots, placed players) through the web app tab. */
app.post<{ Params: { id: string } }>('/api/challenges/:id/read', async (req, reply) => {
  const acc = await siteAccount(req);
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return reply.code(400).send({ error: 'invalid challenge' });
  if (!acc.clientMode || !webAppOpen(acc))
    return reply.code(409).send({ error: 'Open the FC27 web app in this browser first.', code: 'webAppClosed', params: {} });
  await acc.meter.check();
  await enqueue(acc, 'challengeSquad', undefined, id);
  return getStatus(acc);
});

// ---- admin (site, ADMIN_EMAILS) ---------------------------------------------------
app.get('/api/admin/stats', async (req) => {
  await requireAdmin(req);
  return adminStats();
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
  return { results };
});

// ---- extension 0.7+: identity and sync jobs run in the web app tab ------------------
/** The web app says who is logged in. A held key is enough; otherwise the SID proves it once (not stored). */
app.post<{ Body: { personaId?: number; sid?: string; contentGuid?: string; extVersion?: string; linkToken?: string } }>('/api/hello', async (req, reply) => {
  const { personaId, sid, contentGuid, extVersion, linkToken } = req.body ?? {};
  if (sid !== undefined && !/^[0-9a-f-]{36}$/i.test(sid)) return reply.code(400).send({ error: 'invalid sid' });
  const r = await hello({
    key: keyOf(req),
    personaId: Number.isInteger(personaId) ? personaId : undefined,
    sid,
    contentGuid: contentGuid && /^[0-9A-F-]{36}$/i.test(contentGuid) ? contentGuid : undefined,
    extVersion: extVersion && /^\d+(\.\d+){1,3}$/.test(extVersion) ? extVersion : undefined,
  });
  if ('needSid' in r) return reply.code(401).send({ error: 'unknown account', needSid: true });
  autoSyncSoon(r.account); // a day's club / SBC sync missed while offline runs right away
  // a signed-in site handed the extension a link token: attach this persona to that user
  const token = typeof linkToken === 'string' && /^[\w-]{20,100}$/.test(linkToken) ? linkToken : null;
  const userId = token ? await linkTokenUser(token) : null;
  let linked: number | null = null;
  if (userId) {
    const decision = linkDecision((await personaRow(r.account.id))?.userId ?? null, userId, r.proved);
    // owned by someone else: only a fresh EA proof moves it; the token stays usable for the resend
    if (decision === 'needSid') return reply.code(401).send({ error: 'EA account linked to another user', needSid: true });
    if (decision !== 'already') await setOwner(r.account.id, userId);
    await consumeLinkToken(token!);
    linked = r.account.id;
  }
  return { ok: true, account: r.account, accessKey: r.account.info.accessKey, linked, linkRejected: !!token && !userId };
});

/** Next sync job for the web app tab (null when idle). Polling also marks the tab as open. */
app.get('/api/jobs/next', async (req) => {
  const acc = account(req);
  if (!acc.clientMode) return { job: null };
  try {
    await acc.meter.check();
  } catch {
    return { job: null }; // over budget or paused: the queue waits
  }
  // came (back) to the web app: SBCs done elsewhere in the meantime show up; handed out next poll
  const visible = (req.query as { visible?: string }).visible;
  const returned = webAppReturned(acc, visible === undefined ? undefined : visible === '1');
  const job = nextJob(acc);
  if (returned) await refreshSbcsOnVisit(acc);
  return { job: job && { id: job.id, kind: job.kind, setIds: job.setIds, challengeId: job.challengeId } };
});

/** One EA request the tab made for a job, for the daily count. Throttling codes pause the account. */
app.post<{ Params: { id: string }; Body: { method: string; path: string; status: number | null } }>(
  '/api/jobs/:id/call',
  async (req, reply) => {
    const acc = account(req);
    const { method, path, status } = req.body ?? ({} as never);
    if (!findJob(acc, req.params.id) || typeof method !== 'string' || typeof path !== 'string' || !path.startsWith('/'))
      return reply.code(400).send({ error: 'invalid call' });
    await acc.meter.record(method.toUpperCase().slice(0, 8), path.slice(0, 200), Number.isInteger(status) ? status : null);
    if (THROTTLE_CODES.includes(status ?? 0)) acc.meter.pause();
    return { ok: true };
  },
);

app.post<{ Params: { id: string }; Body: { ok: boolean; error?: string; pagesTagged?: boolean } }>('/api/jobs/:id/done', async (req, reply) => {
  const acc = account(req);
  const job = findJob(acc, req.params.id);
  if (!job) return reply.code(404).send({ error: 'unknown job' });
  const error = typeof req.body?.error === 'string' ? req.body.error.slice(0, 300) : undefined;
  const { playedElsewhere, changedSets } = await finishJob(acc, job, !!req.body?.ok, error, req.body?.pagesTagged === true);
  // SBCs done on a console or in the companion app used club players: refresh the club too (daily cap applies)
  const clubQueued = playedElsewhere && (await requestSync(acc, 'club', true).then(() => hasPending(acc, 'club'), () => false));
  markEdited(acc);
  // what happened, for the notice the extension shows in the web app (0.8.5+)
  const players = job.kind === 'club' && job.status === 'done' ? (await readCache<ClubItem[]>(acc.key('club')))?.data.length ?? null : null;
  return { ok: true, kind: job.kind, status: job.status, error: job.error ?? null, players, changedSets, clubQueued };
});

/** Sent by the extension after the web app successfully submits an SBC. */
app.post<{ Body: { challengeId: number; itemIds: number[] } }>('/api/sbc-submitted', async (req, reply) => {
  const acc = account(req);
  const { challengeId, itemIds } = req.body ?? ({} as never);
  if (!Number.isInteger(challengeId) || !Array.isArray(itemIds) || itemIds.length > 23 || !itemIds.every(Number.isInteger))
    return reply.code(400).send({ error: 'invalid payload' });
  return { ok: true, ...(await applySubmittedSbc(acc, challengeId, itemIds)) };
});

/** Packs opened, items moved and data loaded in the web app, relayed by the extension's page hook. */
app.post<{ Body: WebAppEvent }>('/api/webapp-event', { bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => {
  const acc = account(req);
  const ev = req.body;
  if (!ev || typeof ev.method !== 'string' || typeof ev.path !== 'string' || !WATCHED_PATH.test(ev.path))
    return reply.code(400).send({ error: 'unsupported event' });
  return { ok: true, summary: await applyWebAppEvent(acc, ev) };
});

/** The Chrome extension, pre-pointed at this server. */
app.get('/api/extension.zip', async (req, reply) => {
  const origin = requestOrigin(req.headers, req.protocol);
  if (!/^https?:\/\/[\w.-]+(:\d+)?$/.test(origin)) return reply.code(400).send({ error: 'bad host' });
  const zip = await buildExtensionZip(origin);
  return reply
    .header('Content-Type', 'application/zip')
    .header('Content-Disposition', 'attachment; filename="fc-solver-extension.zip"')
    // never from a cache (Cloudflare kept a zip for 4 h and handed out the old version after an update)
    .header('Cache-Control', 'no-store')
    .send(Buffer.from(zip));
});

// ---- data -------------------------------------------------------------------
app.get('/api/meta', async (req) => {
  const acc = await optionalSiteAccount(req);
  const m = acc ? await metaFor(acc) : await loadMeta();
  return {
    names: { nation: m.names.nation, league: m.names.league, club: m.names.club, rarity: m.names.rarity },
    formations: m.formations,
    rarities: m.rarities,
    contentBase: m.contentBase,
  };
});

async function clubPlayers(acc: Account) {
  const meta = await metaFor(acc);
  const club = await readCache<ClubItem[]>(acc.key('club'));
  const squad = (await readCache<ActiveSquad>(acc.key('squad')))?.data ?? null;
  return { fetchedAt: club?.fetchedAt ?? null, players: (club?.data ?? []).map((i) => toPlayer(i, meta)), squad };
}

app.get('/api/club', async (req) => clubPlayers(await siteAccount(req)));

app.get('/api/sets', async (req) => {
  const sets = await readCache<SetsData>((await siteAccount(req)).key('sets'));
  return { fetchedAt: sets?.fetchedAt ?? null, categories: sets?.data.categories ?? [] };
});

app.get<{ Params: { id: string }; Querystring: { refresh?: string } }>('/api/sets/:id/challenges', async (req) => {
  const acc = await siteAccount(req);
  const meta = await metaFor(acc);
  const ch = await getChallenges(acc, Number(req.params.id), req.query.refresh === '1');
  return {
    fetchedAt: ch?.fetchedAt ?? null,
    challenges: await Promise.all(
      (ch?.data ?? []).map(async (c) => {
        const layout = await challengeLayout(acc, c.challengeId);
        return {
          ...c,
          requirements: parseRequirements(c.elgReq, meta).map(serializeRequirement),
          layout,
          // EA locks slots in this challenge but we have not seen which yet
          needsLayout: isBrickChallenge(c.type) && !layout,
        };
      }),
    ),
  };
});

const DEFAULT_OPTIONS: SolveOptions = {
  excludeIds: [],
  excludeActiveSquad: true,
  excludeSquadReserves: false,
  excludeNations: [],
  excludeLeagues: [],
  excludeClubs: [],
  onlyUntradeable: false,
  maxRating: 99,
  excludeSpecial: true,
  keepPlaced: false,
};

app.post<{ Body: { setId: number; challengeId: number; options?: Partial<SolveOptions>; deep?: boolean } }>(
  '/api/solve',
  async (req, reply) => {
    const acc = await siteAccount(req);
    const meta = await metaFor(acc);
    const { setId, challengeId } = req.body;
    const ch = (await getChallenges(acc, setId))?.data.find((c) => c.challengeId === challengeId);
    if (!ch) return reply.code(404).send({ error: 'challenge not found (open it in the web app first)', code: 'challengeNotFound', params: {} });
    const { players } = await clubPlayers(acc);
    if (players.length === 0) return reply.code(409).send({ error: 'club is empty (sync your club first)', code: 'clubEmpty', params: {} });
    const reqs = parseRequirements(ch.elgReq, meta);
    const options = { ...DEFAULT_OPTIONS, ...req.body.options };
    const t0 = Date.now();
    const squad = (await readCache<ActiveSquad>(acc.key('squad')))?.data ?? null;
    const layout = await challengeLayout(acc, challengeId);
    if (isBrickChallenge(ch.type) && !layout)
      return reply.code(409).send({
        error: 'This SBC has locked slots. Open it once in the FC27 web app so FC Solver sees which, then solve again.',
        code: 'needsLayout',
        params: {},
      });
    const bricks = layout?.bricks ?? [];
    const brickAt = new Map(bricks.map((b) => [b.index, b]));
    const sol = await solve(players, ch.formation, reqs, ch.elgOperation, meta, options, squad, req.body.deep ? 30 : 10, layout);
    const slotsMeta = meta.formations[ch.formation];
    const brickOf = (i: number) => {
      const b = brickAt.get(i);
      return b ? { custom: b.custom, nation: b.nation, league: b.league, club: b.club } : null;
    };
    if (!sol) {
      const empty = evaluate(slotsMeta.map(() => null), slotsMeta.map((s) => s.typeId), reqs, ch.elgOperation, meta, bricks);
      return {
        found: false,
        ms: Date.now() - t0,
        reasons: diagnose(players, reqs, meta, options, squad, bricks),
        slots: slotsMeta.map((s, i) => ({ position: s, player: null, chem: 0, brick: brickOf(i), fixed: false })),
        eval: empty,
      };
    }
    return {
      found: sol.eval.allMet,
      status: sol.status,
      ms: Date.now() - t0,
      cost: sol.cost,
      eval: sol.eval,
      slots: slotsMeta.map((s, i) => ({
        position: s,
        player: sol.slots[i],
        chem: sol.eval.perSlotChem[i],
        brick: brickOf(i),
        fixed: !!sol.slots[i] && sol.fixedIds.includes(sol.slots[i]!.id),
      })),
      missingPlaced: sol.missingPlaced,
      placed: { kept: sol.fixedIds.length, total: sol.placedCount },
    };
  },
);

// ---- web ------------------------------------------------------------------------
const dist = join(ROOT, 'dist');
if (existsSync(dist))
  await app.register(fastifyStatic, {
    root: dist,
    // Vite hashes asset names, so they can be cached forever; index.html must always be revalidated
    setHeaders: (res, path) =>
      res.header('Cache-Control', path.includes(`${join('dist', 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache'),
  });

// Screens have their own URLs (/sbc/16/39, /club, ...): any other GET outside /api gets the app,
// which reads the path itself. Unknown /api paths still answer 404.
app.setNotFoundHandler((req, reply) => {
  const path = req.url.split('?')[0];
  // files (with an extension) that do not exist stay 404, so a stale page never gets HTML as JS
  if (req.method === 'GET' && !path.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(path) && existsSync(dist))
    return reply.header('Cache-Control', 'no-cache').type('text/html').sendFile('index.html');
  return reply.code(404).send({ error: 'not found' });
});

try {
  await initDb();
  initAuth();
} catch (e) {
  console.error(`[startup] cannot start: ${(e as Error).message}`);
  process.exit(1);
}
await app.listen({ port: PORT, host: process.env.HOST ?? '127.0.0.1' });
console.log(`FC Solver API on http://localhost:${PORT}`);

void autoSyncAll();
setInterval(() => void autoSyncAll(), 60 * 1000);
