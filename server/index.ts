import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { SessionError, THROTTLE_CODES, type ClubItem, type Challenge } from './ea.js';
import { loadMeta, type Meta } from './meta.js';
import { parseRequirements, serializeRequirement } from './sbc.js';
import { toPlayer, evaluate } from './squad.js';
import { solve, diagnose, pointsPool, solvePoints, NO_FILTERS, type SolveOptions, type ActiveSquad } from './solver.js';
import { challengeLayout, isBrickChallenge } from './layout.js';
import { readCache, ROOT } from './store.js';
import { applySubmittedSbc, autoSyncAll, autoSyncSoon, syncOnLink, getChallenges, getStatus, markEdited, refreshOnVisit, requestSync, type SetsData } from './sync.js';
import { enqueue, findJob, finishJob, hasPending, markCall, nextJob, webAppOpen, webAppReturned } from './jobs.js';
import { loadAccounts, registerSession, accountByKey, accountById, hello, type Account } from './accounts.js';
import { isAdmin } from './admin/auth.js';
import { registerAdminRoutes } from './admin/routes.js';
import { initAuth, optionalSiteAccount, siteAccount, siteContext, siteUser } from './auth.js';
import { linkDecision, overLinkLimit, PERSONA_USER_LIMIT } from './auth-rules.js';
import { backfillFounders, foundersNow, grantFounderSpot, grantInviteOnLink, planFor, planInfo } from './plans.js';
import {
  blockLink,
  consumeLinkToken,
  countSolve,
  createLinkToken,
  linkTokenUser,
  personaLinkUsers,
  personaRow,
  personasOf,
  takenOverFrom,
  saveOnboarding,
  setOwner,
  unlinkPersona,
} from './db/users.js';
import { parseOnboarding } from './onboarding.js';
import { redeem, referralSummary, spendPoints } from './db/referrals.js';
import { parseSpend } from './referrals.js';
import { eq } from 'drizzle-orm';
import { checkEvoAlerts, emailSecret } from './evo-alerts.js';
import { asLang, checkUnsub } from './evo-rules.js';
import { CARD_FILE } from './evo-card-svg.js';
import { CARD_DIR } from './evo-card.js';
import { prefsOf, setPrefs, trainingsOf } from './db/evos.js';
import { buildExtensionZip, requestOrigin, latestExtension } from './extension.js';
import { applyWebAppEvent, WATCHED_PATH, type WebAppEvent } from './events.js';
import { analyticsOrigins, isCanonicalHost, pageMeta, renderHead, robotsTxt, siteUrl, sitemapXml, withAnalytics } from './seo.js';
import { publicOrigin, siteOrigins } from './origins.js';
import { createLimiter } from './limits.js';
import { galleryFor } from './gallery/compute.js';
import { installLedger } from './gallery/ledger.js';
import { openGroups } from './objectives/open.js';
import { solveObjectives } from './objectives/solve.js';
import type { Condition, EaCategory } from './objectives/types.js';
import { db, initDb } from './db/index.js';
import { logEvent, pruneEvents } from './db/events.js';
import { isPointsChallenge, pointsTarget, usablePoints } from './points.js';
import { users } from './db/schema.js';

const PORT = Number(process.env.PORT ?? 5178);
// Only Apache in front of us (on the host, or the Docker bridge) may set X-Forwarded-*: req.ip is
// then the visitor, not a header anyone can write.
const app = Fastify({ logger: { level: 'warn' }, trustProxy: ['loopback', 'uniquelocal'] });
const DEV = process.env.NODE_ENV !== 'production';

// Per-IP limits: plenty for the site and the extension polling, not for a script hammering us.
const apiLimit = createLimiter({ windowMs: 60_000, max: 600 });
const proofLimit = createLimiter({ windowMs: 60_000, max: 5 }); // new EA sessions to prove (each one calls EA)
const redeemLimit = createLimiter({ windowMs: 60_000, max: 10 }); // codes cannot be guessed by trying
const reportLimit = createLimiter({ windowMs: 60_000, max: 20 });
const tooMany = () => new SessionError('Too many requests, slow down a little.', 429, 'rateLimited');

// The extension posts from a chrome-extension:// origin (unpacked, so its id differs per install).
app.addHook('onRequest', async (req, reply) => {
  if (req.url.startsWith('/api/') && !apiLimit(req.ip)) throw tooMany();
  const origin = req.headers.origin;
  if (origin && (origin.startsWith('chrome-extension://') || (DEV && origin.startsWith('http://localhost')))) {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Account-Key, Authorization, X-Persona');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') return reply.code(204).send();
});

app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
  const status = err instanceof SessionError ? err.status : err.statusCode ?? 500;
  // `code` / `params` are ours (SessionError), for the site to translate; never Fastify's own codes
  const own = err instanceof SessionError && err.msgCode ? { code: err.msgCode, params: err.params ?? {} } : {};
  // unexpected failures stay in the log: their messages can carry SQL, paths or EA answers
  if (status >= 500 && !(err instanceof SessionError)) {
    console.error(`[error] ${req.method} ${req.url.split('?')[0]}:`, err);
    return reply.code(status).send({ error: 'Something went wrong on the FC Solver server.' });
  }
  reply.code(status).send({ error: err.message, ...own });
});

// Security headers on every answer. The CSP is report-only for now: violations are logged
// (/api/csp-report) until it is known not to break Clerk, the EA card art or the fonts.
function csp(): string {
  // Clerk's Frontend API lives on clerk.<our domain> in production, *.clerk.accounts.dev in development
  const clerk = siteOrigins()
    .filter((o) => o.startsWith('https://'))
    .map((o) => `https://clerk.${new URL(o).host}`);
  const clerkAll = [...clerk, 'https://*.clerk.accounts.dev', 'https://*.clerk.com'].join(' ');
  const stats = analyticsOrigins().join(' '); // ANALYTICS_SNIPPET (OpenWebTrack)
  return [
    "default-src 'self'",
    `script-src 'self' ${clerkAll} https://challenges.cloudflare.com ${stats}`,
    `connect-src 'self' ${clerkAll} https://clerk-telemetry.com ${stats}`,
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `frame-src https://challenges.cloudflare.com ${clerkAll}`,
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    'report-uri /api/csp-report',
  ].join('; ');
}
app.addHook('onSend', async (req, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  if (req.headers['x-forwarded-proto'] === 'https') reply.header('Strict-Transport-Security', 'max-age=15552000');
  if (String(reply.getHeader('content-type') ?? '').startsWith('text/html')) reply.header('Content-Security-Policy-Report-Only', csp());
});

// Browsers post CSP violations here (report-only phase); kept short and rate limited in the log.
app.addContentTypeParser(['application/csp-report', 'application/reports+json'], { parseAs: 'string', bodyLimit: 16 * 1024 }, (_req, body, done) => {
  try {
    done(null, JSON.parse(body as string));
  } catch {
    done(null, null);
  }
});
app.post('/api/csp-report', async (req, reply) => {
  if (reportLimit(req.ip)) {
    const r = (req.body as { 'csp-report'?: Record<string, unknown> } | null)?.['csp-report'] ?? req.body;
    console.warn('[csp]', JSON.stringify(r).slice(0, 500));
  }
  return reply.code(204).send();
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
  if (!proofLimit(req.ip)) throw tooMany();
  const guid = contentGuid && /^[0-9A-F-]{36}$/i.test(contentGuid) ? contentGuid : undefined;
  const version = extVersion && /^\d+(\.\d+){1,3}$/.test(extVersion) ? extVersion : undefined;
  // no sync here: the minute ticker runs it once the session is a few seconds old (see autoSync)
  const { account: acc } = await registerSession(sid, guid, version);
  // The key goes back only to the extension that proved it holds a live session.
  return { ok: true, account: acc, accessKey: acc.info.accessKey };
});

// ---- users (site, Clerk session) --------------------------------------------------
/**
 * From an evolution email: no sign-in, the HMAC proves the link came from us. GET only asks (mail link
 * scanners open links on their own); the POST, from the button or the RFC 8058 one-click header, turns emails off.
 */
const UNSUB_TEXT = {
  en: { ask: 'Stop the emails about evolution training?', button: 'Stop the emails', done: 'Done: no more evolution emails. You can turn them back on in FC Solver settings.' },
  ro: { ask: 'Nu mai vrei emailuri despre antrenamentele evoluțiilor?', button: 'Oprește emailurile', done: 'Gata: nu mai primești emailuri despre evoluții. Le poți reporni din setările FC Solver.' },
  it: { ask: 'Smettere di ricevere email sugli allenamenti delle evoluzioni?', button: 'Interrompi le email', done: 'Fatto: niente più email sulle evoluzioni. Puoi riattivarle nelle impostazioni di FC Solver.' },
};
const unsubscribe = async (req: FastifyRequest<{ Querystring: { u?: string; t?: string } }>, reply: FastifyReply) => {
  const { u = '', t = '' } = req.query ?? {};
  if (!u || !checkUnsub(u, t, emailSecret())) return reply.code(400).type('text/plain').send('Invalid link.');
  const text = UNSUB_TEXT[(await prefsOf(u)).lang];
  if (req.method === 'POST') {
    await setPrefs(u, { evoEmails: false });
    return reply.type('text/plain; charset=utf-8').send(text.done);
  }
  const action = `/api/evos/unsubscribe?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`.replace(/&/g, '&amp;');
  return reply
    .type('text/html; charset=utf-8')
    .send(
      `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">` +
        `<title>FC Solver</title><body style="font:16px system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 16px">` +
        `<p>${text.ask}</p><form method="post" action="${action}"><button type="submit">${text.button}</button></form></body>`,
    );
};
// Encapsulated: mail clients one-click unsubscribe (RFC 8058) with a form body that is ignored (u/t are in the
// query); the parser must not change how other routes treat form bodies. Root hooks (limits, headers) still apply.
await app.register(async (s) => {
  s.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string', bodyLimit: 1024 }, (_req, _body, done) => done(null, null));
  s.get('/api/evos/unsubscribe', unsubscribe);
  s.post('/api/evos/unsubscribe', unsubscribe);
});

// Card images in evolution emails: public (mail clients fetch them without a session), unguessable names.
app.get<{ Params: { file: string } }>('/api/evos/card/:file', async (req, reply) => {
  const name = req.params.file.replace(/\.png$/, '');
  if (!CARD_FILE.test(name)) return reply.code(404).send();
  const png = await readFile(join(CARD_DIR, `${name}.png`)).catch(() => null);
  if (!png) return reply.code(404).send();
  return reply.type('image/png').header('Cache-Control', 'public, max-age=2592000, immutable').header('X-Robots-Tag', 'noindex').send(png);
});

/** Who is signed in and which EA personas they own. */
app.get('/api/me', async (req) => {
  const userId = await siteUser(req);
  const [row] = await db.select({ email: users.email, onboardedAt: users.onboardedAt, linkBlockedAt: users.linkBlockedAt }).from(users).where(eq(users.id, userId));
  const personas = (await personasOf(userId)).flatMap((id) => {
    const a = accountById(id);
    return a ? [a.toJSON()] : [];
  });
  return { user: { id: userId, email: row?.email ?? '' }, personas, admin: await isAdmin(userId), plan: await planFor(userId), prefs: await prefsOf(userId), onboarding: { done: !!row?.onboardedAt },
    // an EA account of mine that another user has since proved with EA: why the setup screen is back
    takenOver: personas.length === 0 && (await takenOverFrom(userId)),
    // a link refused for the persona limit (cleared by any successful link): who to write to
    linkBlocked: row?.linkBlockedAt ? { at: row.linkBlockedAt.getTime(), limit: PERSONA_USER_LIMIT, supportEmail: process.env.SUPPORT_EMAIL ?? null } : null };
});

/** The onboarding survey: both answers, or a skip. Asked once: a second answer is ignored. */
app.put<{ Body: Record<string, unknown> }>('/api/me/onboarding', async (req, reply) => {
  const userId = await siteUser(req);
  const answer = parseOnboarding(req.body);
  if (!answer) return reply.code(400).send({ error: 'invalid answer' });
  await saveOnboarding(userId, answer);
  // a code typed on the survey: a bad one never blocks the answer
  const raw = req.body?.code;
  if (typeof raw !== 'string' || !raw.trim() || !redeemLimit(req.ip)) return { ok: true };
  const r = await redeem(userId, raw);
  return { ok: true, redeem: r.ok ? { kind: r.kind, days: r.days, pending: r.pending, founder: r.founder } : { error: r.code } };
});

/** My invite code and link, points, invites, gift codes. */
app.get('/api/referral', async (req) => {
  const userId = await siteUser(req);
  const s = await referralSummary(userId);
  return { ...s, link: `${publicOrigin(requestOrigin(req.headers, req.protocol))}/?ref=${s.code}` };
});

/** Use an invite, promo or gift code. */
app.post<{ Body: { code?: unknown } }>('/api/redeem', async (req, reply) => {
  const userId = await siteUser(req);
  if (!redeemLimit(req.ip)) throw tooMany();
  const r = await redeem(userId, typeof req.body?.code === 'string' ? req.body.code : '');
  if (!r.ok) return reply.code(400).send({ error: r.code, code: r.code, params: {} });
  return { kind: r.kind, days: r.days, pending: r.pending, founder: r.founder };
});

/** Points → Premium for me, or a gift code. */
app.post('/api/points/spend', async (req, reply) => {
  const userId = await siteUser(req);
  const s = parseSpend(req.body);
  if (!s) return reply.code(400).send({ error: 'invalid spend', code: 'invalid', params: {} });
  const r = await spendPoints(userId, s.days, s.gift);
  if (!r.ok) return reply.code(400).send({ error: r.code, code: r.code, params: {} });
  return 'giftCode' in r ? { giftCode: r.giftCode } : { premiumUntil: r.premiumUntil };
});

const MAIL_LANGS = ['en', 'ro', 'it'];

/** Email preferences. An unknown language is ignored (not coerced), a non-boolean flag too. */
app.put<{ Body: { lang?: unknown; evoEmails?: unknown } }>('/api/me/prefs', async (req) => {
  const userId = await siteUser(req);
  const b = req.body ?? {};
  await setPrefs(userId, {
    lang: typeof b.lang === 'string' && MAIL_LANGS.includes(b.lang) ? asLang(b.lang) : undefined,
    evoEmails: typeof b.evoEmails === 'boolean' ? b.evoEmails : undefined,
  });
  return { ok: true };
});

/** Tracked evolution trainings of the active persona (Premium). Reads the DB only, never EA. */
app.get('/api/evos', async (req) => {
  const { userId, acc } = await siteContext(req);
  if ((await planFor(userId)).tier !== 'premium') throw new SessionError('Evolution alerts are a Premium feature.', 403, 'premiumOnly');
  const meta = await metaFor(acc);
  const last = await readCache(acc.key('academy'));
  const ms = (d: Date | null) => d?.getTime() ?? null;
  // a partial stored player must not break the whole list
  const playerOf = (raw: unknown) => {
    if (!raw) return null;
    try {
      return toPlayer(raw as ClubItem, meta);
    } catch {
      return null;
    }
  };
  const evos = (await trainingsOf(acc.id)).map((r) => ({
    slotId: r.slotId,
    level: r.level,
    levelCount: r.levelCount,
    slotName: r.slotName,
    player: playerOf(r.player),
    startedAt: ms(r.startedAt),
    endsAt: ms(r.endsAt),
    ready: r.ready || (!!r.endsAt && r.endsAt.getTime() <= Date.now()),
  }));
  return { fetchedAt: last?.fetchedAt ?? null, evos };
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

/** Founding 50 spots, for the landing page (public; cached 30 s). */
app.get('/api/founders', () => foundersNow());

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

/** The site opened (or came back in front): refresh a stale club, and the SBC list on the SBC screens. */
app.post<{ Body: { sbcs?: boolean } | undefined }>('/api/sync/visit', async (req) => {
  const acc = await siteAccount(req);
  await refreshOnVisit(acc, { sbcs: req.body?.sbcs !== false });
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

// ---- admin (site, ADMIN_EMAILS): server/admin/routes.ts ----------------------------
registerAdminRoutes(app);

// ---- extension 0.7+: identity and sync jobs run in the web app tab ------------------
/** The web app says who is logged in. A held key is enough; otherwise the SID proves it once (not stored). */
app.post<{ Body: { personaId?: number; sid?: string; contentGuid?: string; extVersion?: string; linkToken?: string } }>('/api/hello', async (req, reply) => {
  const { personaId, sid, contentGuid, extVersion, linkToken } = req.body ?? {};
  if (sid !== undefined && !/^[0-9a-f-]{36}$/i.test(sid)) return reply.code(400).send({ error: 'invalid sid' });
  if (sid && !accountByKey(keyOf(req)) && !proofLimit(req.ip)) throw tooMany(); // proving a new session calls EA
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
  let clubQueued = false;
  if (userId) {
    const owner = (await personaRow(r.account.id))?.userId ?? null;
    // already linked to PERSONA_USER_LIMIT other accounts: refused before any SID proof (no EA call);
    // ok for the extension (it keeps its key and drops the token), the site shows "contact support"
    if (owner !== userId && overLinkLimit(await personaLinkUsers(r.account.id), userId)) {
      await blockLink(userId);
      await consumeLinkToken(token!);
      return { ok: true, account: r.account, accessKey: r.account.info.accessKey, linked: null, linkRejected: true, linkLimit: true, clubQueued: false };
    }
    const decision = linkDecision(owner, userId, r.proved);
    // owned by someone else: only a fresh EA proof moves it; the token stays usable for the resend
    if (decision === 'needSid') return reply.code(401).send({ error: 'EA account linked to another user', needSid: true });
    if (decision !== 'already') await setOwner(r.account.id, userId);
    // Founding 50: the first links get Premium for life; on 'already' too, so a grant a DB hiccup
    // swallowed is retried (it returns at once for a founder)
    await grantFounderSpot(userId, r.account.id);
    await grantInviteOnLink(userId, r.account.id); // after the founders grant: a founder stays for life
    await consumeLinkToken(token!);
    linked = r.account.id;
    // newly linked here: load the club now (the site re-sends tokens every few minutes, so not on 'already')
    if (decision !== 'already') clubQueued = await syncOnLink(r.account);
  }
  return { ok: true, account: r.account, accessKey: r.account.info.accessKey, linked, linkRejected: !!token && !userId, clubQueued };
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
  const { visible, ready } = req.query as { visible?: string; ready?: string };
  const returned = webAppReturned(acc, visible === undefined ? undefined : visible === '1');
  // extension 0.8.8+: a web app tab not logged in to EA yet keeps the tab "open" but gets no job
  const job = nextJob(acc, ready !== '0');
  if (returned) await refreshOnVisit(acc);
  return { job: job && { id: job.id, kind: job.kind, setIds: job.setIds, challengeId: job.challengeId } };
});

/** One EA request the tab made for a job, for the daily count. Throttling codes pause the account. */
app.post<{ Params: { id: string }; Body: { method: string; path: string; status: number | null } }>(
  '/api/jobs/:id/call',
  async (req, reply) => {
    const acc = account(req);
    const { method, path, status } = req.body ?? ({} as never);
    const job = findJob(acc, req.params.id);
    if (!job || typeof method !== 'string' || typeof path !== 'string' || !path.startsWith('/'))
      return reply.code(400).send({ error: 'invalid call' });
    markCall(acc, job);
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
  // baked into the extension as its server: only ever one of our own origins
  const zip = await buildExtensionZip(publicOrigin(requestOrigin(req.headers, req.protocol)));
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
  const storage = await readCache<ClubItem[]>(acc.key('storage'));
  const squad = (await readCache<ActiveSquad>(acc.key('squad')))?.data ?? null;
  return {
    fetchedAt: club?.fetchedAt ?? null,
    players: (club?.data ?? []).map((i) => toPlayer(i, meta)),
    storage: (storage?.data ?? []).map((i) => ({ ...toPlayer(i, meta), inStorage: true })),
    storageAt: storage?.fetchedAt ?? null,
    squad,
  };
}

app.get('/api/club', async (req) => clubPlayers(await siteAccount(req)));

// FUT Gallery planner (Premium): best lineup per set from every item seen in the club
app.get('/api/gallery', async (req) => {
  const { userId, acc } = await siteContext(req);
  if ((await planFor(userId)).tier !== 'premium') throw new SessionError('FUT Gallery is a Premium feature.', 403, 'premiumOnly');
  return galleryFor(acc, await metaFor(acc));
});

// Objectives (Premium): the web app's objectives with the squad condition read from each
async function objectiveGroups(acc: Account, meta: Meta) {
  const cached = await readCache<{ categories: EaCategory[] }>(acc.key('objectives'));
  const groups = cached ? openGroups(cached.data.categories, Date.now(), meta.names) : [];
  return { fetchedAt: cached?.fetchedAt ?? null, groups };
}

app.get('/api/objectives', async (req) => {
  const { userId, acc } = await siteContext(req);
  if ((await planFor(userId)).tier !== 'premium') throw new SessionError('Objectives squads are a Premium feature.', 403, 'premiumOnly');
  const meta = await metaFor(acc);
  const squad = (await readCache<ActiveSquad>(acc.key('squad')))?.data ?? null;
  return { ...(await objectiveGroups(acc, meta)), formation: squad?.formation ?? null };
});

app.post<{ Body: { objectiveIds?: unknown; formation?: unknown; options?: { excludeIds?: unknown; maxRating?: unknown } } }>(
  '/api/objectives/solve',
  async (req, reply) => {
    const { userId, acc } = await siteContext(req);
    if ((await planFor(userId)).tier !== 'premium') throw new SessionError('Objectives squads are a Premium feature.', 403, 'premiumOnly');
    const meta = await metaFor(acc);
    const ids = Array.isArray(req.body?.objectiveIds) ? req.body.objectiveIds.filter((x): x is number => Number.isInteger(x)) : [];
    const formation = typeof req.body?.formation === 'string' ? req.body.formation : '';
    if (!Object.hasOwn(meta.formations, formation)) return reply.code(400).send({ error: 'unknown formation', code: 'badFormation', params: {} });
    const { groups } = await objectiveGroups(acc, meta);
    const picked = groups.flatMap((g) => g.objectives).filter((o) => ids.includes(o.id) && o.conditions.length > 0);
    if (picked.length === 0) return reply.code(400).send({ error: 'pick at least one objective with a squad condition', code: 'noObjectives', params: {} });
    const { players } = await clubPlayers(acc);
    if (players.length === 0) return reply.code(409).send({ error: 'club is empty (sync your club first)', code: 'clubEmpty', params: {} });
    const o = req.body?.options ?? {};
    const options = {
      excludeIds: Array.isArray(o.excludeIds) ? o.excludeIds.filter((x): x is number => Number.isInteger(x)) : [],
      maxRating: typeof o.maxRating === 'number' && Number.isFinite(o.maxRating) ? o.maxRating : 99,
    };
    const conds: { objectiveId: number; condition: Condition }[] = picked.flatMap((ob) => ob.conditions.map((condition) => ({ objectiveId: ob.id, condition })));
    const t0 = Date.now();
    const r = await solveObjectives(players, formation, conds.map((c) => c.condition), meta, options);
    logEvent({ type: 'solve', userId, personaId: acc.id, data: { kind: 'objectives', found: r.found, objectives: picked.length } });
    return {
      found: r.found,
      ms: Date.now() - t0,
      formation,
      slots: meta.formations[formation].map((position, i) => ({ position, player: r.slots[i], chem: r.eval?.perSlotChem[i] ?? 0 })),
      eval: r.eval,
      covers: r.covers.map((c, i) => ({ objectiveId: conds[i].objectiveId, condition: c.condition, itemIds: c.itemIds, met: c.met })),
      reasons: r.reasons,
    };
  },
);

app.get('/api/sets', async (req) => {
  const acc = await siteAccount(req);
  const sets = await readCache<SetsData>(acc.key('sets'));
  // a points challenge shows its target on the set tile (from the cached challenges, no EA call)
  const categories = await Promise.all(
    (sets?.data.categories ?? []).map(async (cat) => ({
      ...cat,
      sets: await Promise.all(
        cat.sets.map(async (s) => {
          const ch = (await readCache<Challenge[]>(acc.key(`challenges/${s.setId}`)))?.data.find(isPointsChallenge);
          return ch ? { ...s, pointsTarget: pointsTarget(ch) } : s;
        }),
      ),
    })),
  );
  return { fetchedAt: sets?.fetchedAt ?? null, categories };
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
          fetchedAt: ch?.fetchedAt ?? null,
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

app.post<{ Body: { setId: number; challengeId: number; options?: Partial<SolveOptions>; deep?: boolean; useStorage?: boolean } }>(
  '/api/solve',
  async (req, reply) => {
    const { userId, acc } = await siteContext(req);
    const plan = await planFor(userId);
    // Free: 20 found squads per 7-day window (server/plan.ts); checked before the solver runs
    if (plan.quota && plan.quota.used >= plan.quota.limit)
      throw new SessionError('Weekly solve limit reached.', 403, 'quotaExhausted', { limit: plan.quota.limit, resetsAt: plan.quota.resetsAt ?? 0 });
    const meta = await metaFor(acc);
    const { setId, challengeId } = req.body;
    const ch = (await getChallenges(acc, setId))?.data.find((c) => c.challengeId === challengeId);
    if (!ch) return reply.code(404).send({ error: 'challenge not found (open it in the web app first)', code: 'challengeNotFound', params: {} });
    const { players: inClub, storage } = await clubPlayers(acc);
    if (inClub.length === 0) return reply.code(409).send({ error: 'club is empty (sync your club first)', code: 'clubEmpty', params: {} });
    // SBC storage is in by default (its duplicates are cheaper, so the solver takes them first); `useStorage: false` = club only
    const clubOnly = req.body.useStorage === false;
    const players = clubOnly ? inClub : [...inClub, ...storage];
    const reqs = parseRequirements(ch.elgReq, meta);
    const options = { ...DEFAULT_OPTIONS, ...req.body.options };
    const t0 = Date.now();
    const squad = (await readCache<ActiveSquad>(acc.key('squad')))?.data ?? null;
    if (isPointsChallenge(ch)) {
      const target = pointsTarget(ch);
      if (target === 0) return reply.code(409).send({ error: 'This challenge already has all its points.', code: 'pointsDone', params: {} });
      const pool = pointsPool(players, reqs, options, squad);
      // the solver takes one card per assetId, so duplicates must not inflate what the club holds
      const have = usablePoints(pool);
      const sol = have >= target ? await solvePoints(pool, reqs, target, req.body.deep ? 30 : 10) : null;
      const found = !!sol?.check.allMet;
      // only a found selection costs a token, like squads
      const quota = plan.quota && found ? planInfo(await countSolve(userId), false, Date.now()).quota : plan.quota;
      logEvent({ type: 'solve', userId, personaId: acc.id, data: { setId, challengeId, found, points: true } });
      // enough points but no answer (infeasible / unknown / timeout): the cards do not combine, so say that
      const reasons = found
        ? undefined
        : have < target
          ? [{ code: 'points' as const, have, need: target, hidden: Math.max(0, usablePoints(pointsPool(players, reqs, NO_FILTERS, null)) - have) }]
          : [{ code: 'combo' as const }];
      return {
        found,
        status: sol?.status,
        ms: Date.now() - t0,
        cost: sol?.cost,
        eval: {
          rating: 0,
          chemistry: 0,
          results: sol?.check.results ?? [], // no selection: requirement rows stay neutral
          allMet: found,
        },
        slots: [],
        points: {
          target,
          required: ch.scoreRequirement ?? 0,
          submitted: ch.submittedScore ?? 0,
          total: sol?.check.total ?? 0,
          overshoot: sol?.check.overshoot ?? 0,
          cards: sol?.cards ?? [],
        },
        reasons,
        usedStorage: !!sol?.cards.some((p) => p.inStorage),
        clubOnly,
        quota,
      };
    }
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
      logEvent({ type: 'solve', userId, personaId: acc.id, data: { setId, challengeId, found: false } });
      return {
        found: false,
        ms: Date.now() - t0,
        reasons: diagnose(players, reqs, meta, options, squad, bricks),
        slots: slotsMeta.map((s, i) => ({ position: s, player: null, chem: 0, brick: brickOf(i), fixed: false })),
        eval: empty,
        clubOnly,
        quota: plan.quota,
      };
    }
    // only a found squad costs a token; Premium is not counted
    const quota =
      plan.quota && sol.eval.allMet ? planInfo(await countSolve(userId), false, Date.now()).quota : plan.quota;
    logEvent({ type: 'solve', userId, personaId: acc.id, data: { setId, challengeId, found: sol.eval.allMet } });
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
      usedStorage: sol.slots.some((p) => p?.inStorage),
      clubOnly,
      quota,
    };
  },
);

// ---- web ------------------------------------------------------------------------
const dist = join(ROOT, 'dist');

// Search engines: robots.txt, sitemap.xml and index.html with this page's <head> (server/seo.ts).
let indexHtml: string | null = null; // read once; a new build restarts the server
let ogVersion: string | null = null;
async function sendPage(req: FastifyRequest, reply: FastifyReply, path: string) {
  indexHtml ??= withAnalytics(await readFile(join(dist, 'index.html'), 'utf8'));
  ogVersion ??= await readFile(join(dist, 'og.png'))
    .then((b) => createHash('sha256').update(b).digest('hex').slice(0, 10))
    .catch(() => '');
  // the host decides indexing; the URLs we print are always one of our own origins
  const claimed = requestOrigin(req.headers, req.protocol);
  const canonical = isCanonicalHost(claimed);
  if (!canonical || !pageMeta(path)) reply.header('X-Robots-Tag', 'noindex, nofollow');
  return reply.header('Cache-Control', 'no-cache').type('text/html').send(renderHead(indexHtml, path, siteUrl(publicOrigin(claimed)), canonical, ogVersion));
}
app.get('/robots.txt', (req, reply) => {
  const claimed = requestOrigin(req.headers, req.protocol);
  return reply
    .type('text/plain')
    .header('Cache-Control', 'public, max-age=3600')
    .send(robotsTxt(siteUrl(publicOrigin(claimed)), isCanonicalHost(claimed)));
});
app.get('/sitemap.xml', (req, reply) =>
  reply
    .type('application/xml')
    .header('Cache-Control', 'public, max-age=3600')
    .send(sitemapXml(siteUrl(publicOrigin(requestOrigin(req.headers, req.protocol))))),
);

if (existsSync(dist))
  await app.register(fastifyStatic, {
    root: dist,
    index: false, // "/" is a page like the others: its <head> is filled by sendPage (route below)
    // Vite hashes asset names, so they can be cached forever; index.html must always be revalidated
    setHeaders: (res, path) =>
      res.header('Cache-Control', path.includes(`${join('dist', 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache'),
  });

if (existsSync(dist)) app.get('/', (req, reply) => sendPage(req, reply, '/'));

// Screens have their own URLs (/sbc/16/39, /club, ...): any other GET outside /api gets the app,
// which reads the path itself. Unknown /api paths still answer 404.
app.setNotFoundHandler((req, reply) => {
  const path = req.url.split('?')[0];
  // files (with an extension) that do not exist stay 404, so a stale page never gets HTML as JS
  if (req.method === 'GET' && !path.startsWith('/api/') && !/\.[a-z0-9]+$/i.test(path) && existsSync(dist))
    return sendPage(req, reply, path.replace(/\/+$/, '') || '/');
  return reply.code(404).send({ error: 'not found' });
});

try {
  await initDb();
  initAuth();
} catch (e) {
  console.error(`[startup] cannot start: ${(e as Error).message}`);
  process.exit(1);
}
installLedger();
void pruneEvents();
void backfillFounders().catch((e) => console.error(`[founders] backfill failed: ${(e as Error).message}`));
setInterval(() => void pruneEvents(), 24 * 60 * 60 * 1000).unref();
await app.listen({ port: PORT, host: process.env.HOST ?? '127.0.0.1' });
console.log(`FC Solver API on http://localhost:${PORT}`);

void autoSyncAll();
setInterval(() => void autoSyncAll(), 60 * 1000);
setInterval(() => void checkEvoAlerts(), 60 * 1000);
