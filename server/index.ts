import Fastify, { type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { SessionError, THROTTLE_CODES, type ClubItem } from './ea.js';
import { loadMeta } from './meta.js';
import { parseRequirements, serializeRequirement } from './sbc.js';
import { toPlayer, evaluate } from './squad.js';
import { solve, diagnose, type SolveOptions, type ActiveSquad } from './solver.js';
import { readCache, ROOT } from './store.js';
import { applySubmittedSbc, autoSyncAll, getChallenges, getStatus, markEdited, requestSync, type SetsData } from './sync.js';
import { findJob, finishJob, nextJob } from './jobs.js';
import { loadAccounts, registerSession, accountByKey, hello, type Account } from './accounts.js';
import { buildExtensionZip, requestOrigin, latestExtension } from './extension.js';
import { applyWebAppEvent, WATCHED_PATH, type WebAppEvent } from './events.js';

const PORT = Number(process.env.PORT ?? 5178);
const app = Fastify({ logger: { level: 'warn' }, trustProxy: true });

// The SID bridge extension posts from a chrome-extension:// origin.
app.addHook('onRequest', async (req, reply) => {
  const origin = req.headers.origin;
  if (origin && (origin.startsWith('chrome-extension://') || origin.startsWith('http://localhost'))) {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Account-Key');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  }
  if (req.method === 'OPTIONS') return reply.code(204).send();
});

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  const code = err instanceof SessionError ? err.status : err.statusCode ?? 500;
  reply.code(code).send({ error: err.message });
});

await loadAccounts();

const keyOf = (req: FastifyRequest) => {
  const k = req.headers['x-account-key'];
  return Array.isArray(k) ? k[0] : k;
};

/** Account for this request, identified by its secret access key. */
function account(req: FastifyRequest): Account {
  const acc = accountByKey(keyOf(req));
  if (!acc) throw Object.assign(new Error('Unknown account. Connect through the extension first.'), { statusCode: 401 });
  return acc;
}

const metaFor = (acc: Account) => loadMeta(acc.key('chemProfiles'));

// ---- accounts / session ----------------------------------------------------
app.post<{ Body: { sid: string; contentGuid?: string; extVersion?: string } }>('/api/session', async (req, reply) => {
  const { sid, contentGuid, extVersion } = req.body ?? ({} as never);
  if (!sid || !/^[0-9a-f-]{36}$/i.test(sid)) return reply.code(400).send({ error: 'invalid sid' });
  const guid = contentGuid && /^[0-9A-F-]{36}$/i.test(contentGuid) ? contentGuid : undefined;
  const version = extVersion && /^\d+(\.\d+){1,3}$/.test(extVersion) ? extVersion : undefined;
  // no sync here: the minute ticker runs it once the session is a few minutes old (see autoSync)
  const { account: acc } = await registerSession(sid, guid, version);
  // The key goes back only to the extension that proved it holds a live session.
  return { ok: true, account: acc, accessKey: acc.info.accessKey };
});

/** Which of the browser's stored keys are valid, and whose accounts they are. */
app.post<{ Body: { keys: string[] } }>('/api/accounts', async (req) => {
  const keys = (req.body?.keys ?? []).slice(0, 20);
  return { accounts: keys.flatMap((key) => { const a = accountByKey(key); return a ? [{ key, account: a }] : []; }) };
});

app.get('/api/status', async (req) => {
  const acc = account(req);
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
  const acc = account(req);
  await requestSync(acc, req.body?.what ?? 'all');
  return getStatus(acc);
});

// ---- extension 0.7+: identity and sync jobs run in the web app tab ------------------
/** The web app says who is logged in. A held key is enough; otherwise the SID proves it once (not stored). */
app.post<{ Body: { personaId?: number; sid?: string; contentGuid?: string; extVersion?: string } }>('/api/hello', async (req, reply) => {
  const { personaId, sid, contentGuid, extVersion } = req.body ?? {};
  if (sid !== undefined && !/^[0-9a-f-]{36}$/i.test(sid)) return reply.code(400).send({ error: 'invalid sid' });
  const r = await hello({
    key: keyOf(req),
    personaId: Number.isInteger(personaId) ? personaId : undefined,
    sid,
    contentGuid: contentGuid && /^[0-9A-F-]{36}$/i.test(contentGuid) ? contentGuid : undefined,
    extVersion: extVersion && /^\d+(\.\d+){1,3}$/.test(extVersion) ? extVersion : undefined,
  });
  if ('needSid' in r) return reply.code(401).send({ error: 'unknown account', needSid: true });
  return { ok: true, account: r.account, accessKey: r.account.info.accessKey };
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
  const job = nextJob(acc);
  return { job: job && { id: job.id, kind: job.kind, setIds: job.setIds } };
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

app.post<{ Params: { id: string }; Body: { ok: boolean; error?: string } }>('/api/jobs/:id/done', async (req, reply) => {
  const acc = account(req);
  const job = findJob(acc, req.params.id);
  if (!job) return reply.code(404).send({ error: 'unknown job' });
  await finishJob(acc, job, !!req.body?.ok, typeof req.body?.error === 'string' ? req.body.error.slice(0, 300) : undefined);
  markEdited(acc);
  return { ok: true };
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
    .send(Buffer.from(zip));
});

// ---- data -------------------------------------------------------------------
app.get('/api/meta', async (req) => {
  const acc = accountByKey(keyOf(req));
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

app.get('/api/club', (req) => clubPlayers(account(req)));

app.get('/api/sets', async (req) => {
  const sets = await readCache<SetsData>(account(req).key('sets'));
  return { fetchedAt: sets?.fetchedAt ?? null, categories: sets?.data.categories ?? [] };
});

app.get<{ Params: { id: string }; Querystring: { refresh?: string } }>('/api/sets/:id/challenges', async (req) => {
  const acc = account(req);
  const meta = await metaFor(acc);
  const ch = await getChallenges(acc, Number(req.params.id), req.query.refresh === '1');
  return {
    fetchedAt: ch?.fetchedAt ?? null,
    challenges: (ch?.data ?? []).map((c) => ({
      ...c,
      requirements: parseRequirements(c.elgReq, meta).map(serializeRequirement),
    })),
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
};

app.post<{ Body: { setId: number; challengeId: number; options?: Partial<SolveOptions>; deep?: boolean } }>(
  '/api/solve',
  async (req, reply) => {
    const acc = account(req);
    const meta = await metaFor(acc);
    const { setId, challengeId } = req.body;
    const ch = (await getChallenges(acc, setId))?.data.find((c) => c.challengeId === challengeId);
    if (!ch) return reply.code(404).send({ error: 'challenge not found (sync SBCs first)' });
    const { players } = await clubPlayers(acc);
    if (players.length === 0) return reply.code(409).send({ error: 'club is empty (sync your club first)' });
    const reqs = parseRequirements(ch.elgReq, meta);
    const options = { ...DEFAULT_OPTIONS, ...req.body.options };
    const t0 = Date.now();
    const squad = (await readCache<ActiveSquad>(acc.key('squad')))?.data ?? null;
    const sol = await solve(players, ch.formation, reqs, ch.elgOperation, meta, options, squad, req.body.deep ? 30 : 10);
    const slotsMeta = meta.formations[ch.formation];
    if (!sol) {
      const empty = evaluate(slotsMeta.map(() => null), slotsMeta.map((s) => s.typeId), reqs, ch.elgOperation, meta);
      return {
        found: false,
        ms: Date.now() - t0,
        reasons: diagnose(players, reqs, meta, options, squad),
        slots: slotsMeta.map((s) => ({ position: s, player: null, chem: 0 })),
        eval: empty,
      };
    }
    return {
      found: sol.eval.allMet,
      status: sol.status,
      ms: Date.now() - t0,
      cost: sol.cost,
      eval: sol.eval,
      slots: slotsMeta.map((s, i) => ({ position: s, player: sol.slots[i], chem: sol.eval.perSlotChem[i] })),
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

await app.listen({ port: PORT, host: process.env.HOST ?? '127.0.0.1' });
console.log(`FC Solver API on http://localhost:${PORT}`);

void autoSyncAll();
setInterval(() => void autoSyncAll(), 60 * 1000);
