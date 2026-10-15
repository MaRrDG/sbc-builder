import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { SessionError, THROTTLE_CODES, type ClubItem, type Challenge } from './ea.js';
import { loadMeta, type Meta } from './meta.js';
import { parseRequirements, serializeRequirement } from './sbc.js';
import { toPlayer } from './squad.js';
import { killAllSolvers, type ActiveSquad } from './solver.js';
import { challengeLayout, isBrickChallenge } from './layout.js';
import { readCache, readShared, ROOT } from './store.js';
import { etagOf, notModified } from './etag.js';
import { compactCspReport, cspHeaderName } from './csp-report.js';
import { applySubmittedSbc, autoSyncAll, autoSyncSoon, syncOnLink, getChallenges, getStatus, markEdited, refreshOnVisit, requestSync, type SetsData } from './sync.js';
import { enqueue, findJob, finishJob, hasPending, markBlocked, markCall, markPoll, markReady, nextJob, restLeft, waitForWork, wakeAll, isShuttingDown, webAppOpen, webAppReturned } from './jobs.js';
import { dropStream, endAllStreams, notify, sseFrame, subscribe, takeStream, trackStream } from './live.js';
import { isTabPoll } from './job-rules.js';
import { loadAccounts, accountByKey, accountById, hello, type Account } from './accounts.js';
import { isAdmin } from './admin/auth.js';
import { versionLess } from './admin/query.js';
import { registerAdminRoutes } from './admin/routes.js';
import { loadMaintenance, maintenanceGate, registerMaintenanceRoutes } from './maintenance.js';
import { billingOf, registerBillingRoutes } from './billing/routes.js';
import { cancelDeletion, requestDeletion, scheduleDeletions } from './deletion.js';
import { deleteAtOf } from './db/deletion.js';
import { schedulePrune } from './prune.js';
import { initAuth, optionalSiteAccount, siteAccount, siteContext, siteUser } from './auth.js';
import { linkDecision, overLinkLimit, PERSONA_USER_LIMIT, sidProofRuns } from './auth-rules.js';
import { backfillFounders, foundersNow, grantFounderSpot, grantInviteOnLink, planFor } from './plans.js';
import {
  blockLink,
  consumeLinkToken,
  createLinkToken,
  linkTokenUser,
  personaLinkUsers,
  personaRow,
  personasOf,
  takenOverFrom,
  saveOnboarding,
  linkPersona,
  unlinkPersona,
} from './db/users.js';
import { parseOnboarding } from './onboarding.js';
import { redeem, referralSummary, spendPoints } from './db/referrals.js';
import { parseSpend } from './referrals.js';
import { eq, sql } from 'drizzle-orm';
import { checkEvoAlerts, emailSecret } from './evo-alerts.js';
import { asLang, checkUnsub } from './evo-rules.js';
import { checkReminderUnsub } from './daily/reminder-rules.js';
import { checkDailyReminders } from './daily/reminder.js';
import { CARD_FILE } from './evo-card-svg.js';
import { CARD_DIR } from './evo-card.js';
import { prefsOf, setPrefs, trainingsOf } from './db/evos.js';
import { buildExtensionZip, requestOrigin, latestExtension, parseInstall } from './extension.js';
import { applyWebAppEvent, WATCHED_PATH, type WebAppEvent } from './events.js';
import { isKnownPath } from '../shared/paths.js';
import { analyticsFor, analyticsOrigins, analyticsWarnings, isCanonicalHost, pageMeta, renderHead, robotsTxt, siteUrl, sitemapXml, withAnalytics } from './seo.js';
import { publicOrigin, siteOrigins } from './origins.js';
import { createLimiter } from './limits.js';
import { createRelayBudget } from './relay-rules.js';
import { buildExport } from './export.js';
import { galleryFor } from './gallery/compute.js';
import { installLedger } from './gallery/ledger.js';
import { squadFor, squadsFor } from './squads/io.js';
import { installDailyIngest } from './daily/store.js';
import { installHistory } from './history/ingest.js';
import { registerDailyRoutes } from './daily/routes.js';
import { registerBotRoutes, registerDiscordSiteRoutes } from './discord/routes.js';
import { scheduleDaily } from './daily/service.js';
import { openGroups, solvable } from './objectives/open.js';
import { solveObjectives } from './objectives/solve.js';
import { mergeGroups, nameAwards, SHARED_OBJECTIVES_KEY } from './objectives/shared.js';
import type { Condition, EaCategory } from './objectives/types.js';
import { closeDb, db, initDb } from './db/index.js';
import { alert } from './alert.js';
import { logEvent, pruneEvents } from './db/events.js';
import { ipHash } from './ip-hash.js';
import { pruneBillingEvents } from './db/billing.js';
import { isPointsChallenge, pointsTarget } from './points.js';
import { users } from './db/schema.js';
import { clubPlayers, metaFor, runSolve, type SolveBody } from './solve-run.js';

const PORT = Number(process.env.PORT ?? 5178);
// Only nginx in front of us (on the host, or the Docker bridge) may set X-Forwarded-*: req.ip is
// then the visitor, not a header anyone can write.
const app = Fastify({ logger: { level: 'warn' }, trustProxy: ['loopback', 'uniquelocal'] });
const DEV = process.env.NODE_ENV !== 'production';

// Per-IP limits: plenty for the site and the extension polling, not for a script hammering us.
const apiLimit = createLimiter({ windowMs: 60_000, max: 600 });
const proofLimit = createLimiter({ windowMs: 60_000, max: 5 }); // EA sessions to prove (each one calls EA)
const proofKeyLimit = createLimiter({ windowMs: 60_000, max: 5 }); // the same, per account key (rotating IPs does not help)
const solveLimit = createLimiter({ windowMs: 60_000, max: 6 }); // per user: SBC and objectives solves (CP-SAT runs)
const relayBudget = createRelayBudget(); // per EA account: what the extension relays (/api/webapp-event)
const redeemLimit = createLimiter({ windowMs: 60_000, max: 10 }); // codes cannot be guessed by trying
const redeemUserLimit = createLimiter({ windowMs: 86_400_000, max: 20 }); // per user: rotating IPs does not help either
const reportLimit = createLimiter({ windowMs: 60_000, max: 20 });
const exportLimit = createLimiter({ windowMs: 60_000, max: 1 }); // a data export reads a lot: once a minute per user
const tooMany = () => new SessionError('Too many requests, slow down a little.', 429, 'rateLimited');

// The extension posts from a chrome-extension:// origin (unpacked, so its id differs per install).
app.addHook('onRequest', async (req, reply) => {
  // /api/bot/* is guarded by its token and every Discord user shares the bot's IP
  if (req.url.startsWith('/api/') && !req.url.startsWith('/api/bot/') && req.url !== '/api/health' && !apiLimit(req.ip)) throw tooMany();
  const origin = req.headers.origin;
  if (origin && (origin.startsWith('chrome-extension://') || (DEV && origin.startsWith('http://localhost')))) {
    reply.header('Access-Control-Allow-Origin', origin);
    reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Account-Key, Authorization, X-Persona');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  }
  if (req.method === 'OPTIONS') return reply.code(204).send();
  await maintenanceGate(req);
});

app.setErrorHandler((err: Error & { statusCode?: number }, req, reply) => {
  const status = err instanceof SessionError ? err.status : err.statusCode ?? 500;
  // `code` / `params` are ours (SessionError), for the site to translate; never Fastify's own codes
  const own = err instanceof SessionError && err.msgCode ? { code: err.msgCode, params: err.params ?? {} } : {};
  // unexpected failures stay in the log: their messages can carry SQL, paths or EA answers
  if (status >= 500 && !(err instanceof SessionError)) {
    console.error(`[error] ${req.method} ${req.url.split('?')[0]}:`, err);
    void alert('500', err, `${req.method} ${req.routeOptions.url ?? req.url.split('?')[0]}`);
    return reply.code(status).send({ error: 'Something went wrong on the FC Solver server.', code: 'internal', params: {} });
  }
  reply.code(status).send({ error: err.message, ...own });
});

// Security headers on every answer. The CSP is report-only unless CSP_ENFORCE=1: violations are
// logged (/api/csp-report) until it is known not to break Clerk, the EA card art or the fonts.
function csp(): string {
  // Clerk's Frontend API lives on clerk.<our domain> in production, *.clerk.accounts.dev in development
  const clerk = siteOrigins()
    .filter((o) => o.startsWith('https://'))
    .map((o) => `https://clerk.${new URL(o).host}`);
  const clerkAll = [...clerk, 'https://*.clerk.accounts.dev', 'https://*.clerk.com'].join(' ');
  // Clerk bot protection probes its own hosts on non-default ports; a host source without a port allows only 443
  const clerkProtect = 'https://*.protect.clerk.com:*';
  const stats = analyticsOrigins().join(' '); // ANALYTICS_SNIPPET (OpenWebTrack)
  // Paddle.js (script, its styles and fonts), its APIs (price preview, checkout) and the inline checkout frame (server/billing/)
  const paddleCdn = 'https://cdn.paddle.com https://sandbox-cdn.paddle.com';
  const paddleFrames = 'https://buy.paddle.com https://sandbox-buy.paddle.com';
  const paddleApi = 'https://api.paddle.com https://sandbox-api.paddle.com https://checkout-service.paddle.com https://sandbox-checkout-service.paddle.com';
  return [
    "default-src 'self'",
    `script-src 'self' ${clerkAll} https://challenges.cloudflare.com ${stats} ${paddleCdn}`,
    `connect-src 'self' ${clerkAll} ${clerkProtect} https://clerk-telemetry.com ${stats} ${paddleApi}`,
    "img-src 'self' data: blob: https:",
    `style-src 'self' 'unsafe-inline' ${paddleCdn}`,
    `font-src 'self' data: ${paddleCdn}`,
    `frame-src https://challenges.cloudflare.com ${clerkAll} ${paddleFrames}`,
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
  reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(self "https://buy.paddle.com" "https://sandbox-buy.paddle.com")');
  if (req.headers['x-forwarded-proto'] === 'https') reply.header('Strict-Transport-Security', 'max-age=15552000');
  if (String(reply.getHeader('content-type') ?? '').startsWith('text/html')) reply.header(cspHeaderName(process.env.CSP_ENFORCE), csp());
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
    for (const line of compactCspReport(req.body)) console.warn('[csp]', JSON.stringify(line));
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


// ---- accounts / session ----------------------------------------------------
// extensions before 0.7 synced from the server with the user's SID; that mode is gone (2026-10-13)
app.post('/api/session', async () => {
  throw new SessionError('This extension version is too old. Download the new one from FC Solver.', 410, 'extTooOld');
});

// ---- users (site, Clerk session) --------------------------------------------------
/**
 * From an evolution or Daily reminder email: no sign-in, the HMAC proves the link came from us. GET only asks
 * (mail link scanners open links on their own); the POST, from the button or the RFC 8058 one-click header,
 * turns that one kind of email off.
 */
const UNSUB_TEXT = {
  evo: {
    en: { ask: 'Stop the emails about evolution training?', button: 'Stop the emails', done: 'Done: no more evolution emails. You can turn them back on in FC Solver settings.' },
    ro: { ask: 'Nu mai vrei emailuri despre antrenamentele evoluțiilor?', button: 'Oprește emailurile', done: 'Gata: nu mai primești emailuri despre evoluții. Le poți reporni din setările FC Solver.' },
    it: { ask: 'Smettere di ricevere email sugli allenamenti delle evoluzioni?', button: 'Interrompi le email', done: 'Fatto: niente più email sulle evoluzioni. Puoi riattivarle nelle impostazioni di FC Solver.' },
  },
  daily: {
    en: { ask: 'Stop the FC Solver Daily reminder emails?', button: 'Stop the reminders', done: 'Done: no more Daily reminders. You can turn them back on in FC Solver settings.' },
    ro: { ask: 'Nu mai vrei memento-uri pe email pentru FC Solver Daily?', button: 'Oprește memento-urile', done: 'Gata: nu mai primești memento-uri pentru Daily. Le poți reporni din setările FC Solver.' },
    it: { ask: 'Smettere di ricevere i promemoria di FC Solver Daily?', button: 'Interrompi i promemoria', done: 'Fatto: niente più promemoria del Daily. Puoi riattivarli nelle impostazioni di FC Solver.' },
  },
};
const UNSUB = {
  evo: { path: '/api/evos/unsubscribe', check: checkUnsub, off: { evoEmails: false } },
  daily: { path: '/api/daily/unsubscribe', check: checkReminderUnsub, off: { dailyReminder: false } },
} as const;
const unsubscribe = (kind: keyof typeof UNSUB) => async (req: FastifyRequest<{ Querystring: { u?: string; t?: string } }>, reply: FastifyReply) => {
  const { path, check, off } = UNSUB[kind];
  const { u = '', t = '' } = req.query ?? {};
  if (!u || !check(u, t, emailSecret())) return reply.code(400).type('text/plain').send('Invalid link.');
  const text = UNSUB_TEXT[kind][(await prefsOf(u)).lang];
  if (req.method === 'POST') {
    await setPrefs(u, off);
    return reply.type('text/plain; charset=utf-8').send(text.done);
  }
  const action = `${path}?u=${encodeURIComponent(u)}&t=${encodeURIComponent(t)}`.replace(/&/g, '&amp;');
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
  for (const kind of ['evo', 'daily'] as const) {
    s.get(UNSUB[kind].path, unsubscribe(kind));
    s.post(UNSUB[kind].path, unsubscribe(kind));
  }
});

// Card images in evolution emails: public (mail clients fetch them without a session), unguessable names.
app.get<{ Params: { file: string } }>('/api/evos/card/:file', async (req, reply) => {
  const name = req.params.file.replace(/\.png$/, '');
  if (!CARD_FILE.test(name)) return reply.code(404).send();
  const png = await readFile(join(CARD_DIR, `${name}.png`)).catch(() => null);
  if (!png) return reply.code(404).send();
  return reply.type('image/png').header('Cache-Control', 'public, max-age=2592000, immutable').header('X-Robots-Tag', 'noindex').send(png);
});

/** JSON with an ETag; an unchanged answer is a 304 with no body (the browser keeps its copy). */
function sendTagged(req: FastifyRequest, reply: FastifyReply, body: unknown) {
  const json = JSON.stringify(body);
  const tag = etagOf(json);
  reply.header('ETag', tag).header('Cache-Control', 'private, no-cache').header('Vary', 'X-Persona');
  if (notModified(req.headers['if-none-match'], tag)) return reply.code(304).send();
  return reply.type('application/json; charset=utf-8').send(json);
}

/** Who is signed in and which EA personas they own. */
app.get('/api/me', async (req) => {
  const userId = await siteUser(req);
  const [[row], ids, admin, plan, prefs, billing, deleteAt] = await Promise.all([
    db.select({ email: users.email, onboardedAt: users.onboardedAt, linkBlockedAt: users.linkBlockedAt }).from(users).where(eq(users.id, userId)),
    personasOf(userId),
    isAdmin(userId),
    planFor(userId),
    prefsOf(userId),
    billingOf(userId),
    deleteAtOf(userId),
  ]);
  const personas = ids.flatMap((id) => {
    const a = accountById(id);
    return a ? [a.toJSON()] : [];
  });
  return { user: { id: userId, email: row?.email ?? '' }, personas, admin, plan, prefs, onboarding: { done: !!row?.onboardedAt },
    billing, // Paddle subscription, null without one or while billing is off
    deleteAt: deleteAt?.getTime() ?? null, // account deletion scheduled for (ms), null when none
    // an EA account of mine that another user has since proved with EA: why the setup screen is back
    takenOver: personas.length === 0 && (await takenOverFrom(userId)),
    // a link refused for the persona limit (cleared by any successful link): who to write to
    linkBlocked: row?.linkBlockedAt ? { at: row.linkBlockedAt.getTime(), limit: PERSONA_USER_LIMIT, supportEmail: process.env.SUPPORT_EMAIL || null } : null };
});

/** Everything FC Solver keeps about me, as a JSON download (GDPR art. 15/20); never secrets. */
app.get('/api/me/export', async (req, reply) => {
  const userId = await siteUser(req);
  if (!exportLimit(userId)) throw tooMany();
  const body = await buildExport(userId);
  return reply
    .header('Content-Type', 'application/json; charset=utf-8')
    .header('Content-Disposition', `attachment; filename="fc-solver-${new Date().toISOString().slice(0, 10)}.json"`)
    .header('Cache-Control', 'no-store')
    .send(JSON.stringify(body, null, 2));
});

/** Schedule the account's deletion in 7 days (stops the Paddle renewal); `confirm` is the typed confirm word. */
app.post<{ Body: { confirm?: unknown } }>('/api/me/delete', async (req) => {
  const userId = await siteUser(req);
  return requestDeletion(userId, req.body?.confirm);
});

/** Keep the account: clears the date and undoes the scheduled subscription cancel. */
app.post('/api/me/delete/cancel', async (req) => {
  const userId = await siteUser(req);
  return cancelDeletion(userId);
});

/** The onboarding survey: both answers, or a skip. Asked once: a second answer is ignored. */
app.put<{ Body: Record<string, unknown> }>('/api/me/onboarding', async (req, reply) => {
  const userId = await siteUser(req);
  const answer = parseOnboarding(req.body);
  if (!answer) return reply.code(400).send({ error: 'invalid answer' });
  await saveOnboarding(userId, answer);
  // a code typed on the survey: a bad one never blocks the answer
  const raw = req.body?.code;
  if (typeof raw !== 'string' || !raw.trim() || !redeemLimit(req.ip) || !redeemUserLimit(userId)) return { ok: true };
  const r = await redeem(userId, raw, ipHash(req.ip));
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
  if (!redeemLimit(req.ip) || !redeemUserLimit(userId)) throw tooMany();
  const r = await redeem(userId, typeof req.body?.code === 'string' ? req.body.code : '', ipHash(req.ip));
  if (!r.ok) return reply.code(400).send({ error: r.code, code: r.code, params: {} });
  return { kind: r.kind, days: r.days, pending: r.pending, founder: r.founder };
});

/** Points → Premium for me, or a gift code. */
app.post('/api/points/spend', async (req, reply) => {
  const userId = await siteUser(req);
  const s = parseSpend(req.body);
  if (!s) return reply.code(400).send({ error: 'invalid spend', code: 'invalid', params: {} });
  const r = await spendPoints(userId, s.days, s.gift, ipHash(req.ip));
  if (!r.ok) return reply.code(400).send({ error: r.code, code: r.code, params: {} });
  return 'giftCode' in r ? { giftCode: r.giftCode } : { premiumUntil: r.premiumUntil };
});

const MAIL_LANGS = ['en', 'ro', 'it'];

/** Email preferences. An unknown language is ignored (not coerced), a non-boolean flag too. */
app.put<{ Body: { lang?: unknown; evoEmails?: unknown; dailyReminder?: unknown } }>('/api/me/prefs', async (req) => {
  const userId = await siteUser(req);
  const b = req.body ?? {};
  // turning the Daily reminder on is Premium; turning it off is always allowed
  if (b.dailyReminder === true && (await planFor(userId)).tier !== 'premium') {
    throw new SessionError('The Daily reminder is a Premium feature.', 403, 'premiumOnly');
  }
  await setPrefs(userId, {
    lang: typeof b.lang === 'string' && MAIL_LANGS.includes(b.lang) ? asLang(b.lang) : undefined,
    evoEmails: typeof b.evoEmails === 'boolean' ? b.evoEmails : undefined,
    dailyReminder: typeof b.dailyReminder === 'boolean' ? b.dailyReminder : undefined,
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

/** Live dashboard updates (server-sent events): the status on change, which cache keys changed, a heartbeat. */
app.get('/api/stream', async (req, reply) => {
  const { userId, acc } = await siteContext(req);
  if (!takeStream(userId)) throw new SessionError('Too many open FC Solver tabs.', 429, 'tooManyStreams');
  reply.hijack();
  const res = reply.raw;
  if (req.raw.destroyed || res.destroyed) {
    dropStream(userId); // the tab left during the auth lookup: 'close' already fired
    return;
  }
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no', // nginx: pass every event through at once
    'X-Content-Type-Options': 'nosniff',
  });
  // a late write (a push resolving after the 5 min end) must never throw: Fastify's own 'error'
  // listener is gone once the response finished, and an unhandled stream error kills the process
  res.on('error', () => {});
  const alive = () => !res.writableEnded && !res.destroyed;
  let last = '';
  let pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  const push = async () => {
    timer = null;
    const keys = [...pending];
    pending = new Set();
    if (!alive()) return;
    if (keys.length) res.write(sseFrame('changed', { keys }));
    const body = JSON.stringify({ account: acc, sync: await getStatus(acc), extension: await latestExtension() });
    if (!alive()) return; // the stream ended while the status was read
    if (body !== last) {
      last = body;
      res.write(`event: status\ndata: ${body}\n\n`);
    }
  };
  // a burst of writes (a club page, its unassigned fix-up, the job progress) goes out as one update
  const schedule = (keys: string[]) => {
    if (!alive()) return; // ended: 'close' unsubscribes a few ticks later
    for (const k of keys) pending.add(k);
    timer ??= setTimeout(() => void push().catch(() => {}), 300);
  };
  const off = subscribe(acc.id, schedule);
  const beat = setInterval(() => alive() && res.write(': ping\n\n'), 25_000); // Cloudflare drops idle streams after 100 s
  const tick = setInterval(() => schedule([]), 15_000); // jobs time out and cooldowns end without a write
  // the site reconnects with a fresh Clerk token; nothing scheduled may write after the end
  // also on shutdown (endAllStreams): the site reconnects to the next server
  const finish = () => {
    clearInterval(beat);
    clearInterval(tick);
    clearTimeout(end);
    if (timer) clearTimeout(timer);
    timer = null;
    if (alive()) res.end();
  };
  const end = setTimeout(finish, 5 * 60_000);
  const untrack = trackStream(finish);
  req.raw.on('close', () => {
    untrack();
    off();
    clearInterval(beat);
    clearInterval(tick);
    clearTimeout(end);
    if (timer) clearTimeout(timer);
    dropStream(userId);
  });
  void push().catch(() => {});
});

/** Latest extension release; the extension polls this to show its own update notice. */
app.get('/api/extension/version', () => latestExtension());

/** Founding 50 spots, for the landing page (public; cached 30 s). */
app.get('/api/founders', () => foundersNow());

/** The extension says which version it is right after install/update, no EA session needed. */
app.post<{ Body: { version: string; install?: string } }>('/api/extension/report', async (req, reply) => {
  const acc = account(req);
  const version = req.body?.version;
  if (!version || !/^\d+(\.\d+){1,3}$/.test(version)) return reply.code(400).send({ error: 'invalid version' });
  if (acc.reportExtension(version, parseInstall(req.body?.install))) await acc.save();
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
registerMaintenanceRoutes(app);
registerBillingRoutes(app);
registerDailyRoutes(app);
registerBotRoutes(app);
registerDiscordSiteRoutes(app);

// ---- extension 0.7+: identity and sync jobs run in the web app tab ------------------
/** The web app says who is logged in. A held key is enough; otherwise the SID proves it once (not stored). */
app.post<{ Body: { personaId?: number; sid?: string; contentGuid?: string; extVersion?: string; install?: string; linkToken?: string } }>('/api/hello', async (req, reply) => {
  const { personaId, sid, contentGuid, extVersion, install, linkToken } = req.body ?? {};
  if (sid !== undefined && !/^[0-9a-f-]{36}$/i.test(sid)) return reply.code(400).send({ error: 'invalid sid' });
  // proving a session calls EA: per IP and per key, whenever the proof will run (not only for unknown keys)
  const key = keyOf(req);
  if (sidProofRuns(accountByKey(key)?.id ?? null, Number.isInteger(personaId) ? personaId : undefined, sid)) {
    if (!proofLimit(req.ip)) throw tooMany();
    if (key && !proofKeyLimit(key)) throw tooMany();
  }
  const r = await hello({
    key: keyOf(req),
    personaId: Number.isInteger(personaId) ? personaId : undefined,
    sid,
    contentGuid: contentGuid && /^[0-9A-F-]{36}$/i.test(contentGuid) ? contentGuid : undefined,
    extVersion: extVersion && /^\d+(\.\d+){1,3}$/.test(extVersion) ? extVersion : undefined,
    extInstall: parseInstall(install),
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
    const limited = async () => {
      await blockLink(userId);
      await consumeLinkToken(token!);
      return { ok: true, account: r.account, accessKey: r.account.info.accessKey, linked: null, linkRejected: true, linkLimit: true, clubQueued: false };
    };
    if (owner !== userId && overLinkLimit(await personaLinkUsers(r.account.id), userId)) return limited();
    // owned by someone else: only a fresh EA proof moves it; the token stays usable for the resend
    const needSid = () => reply.code(401).send({ error: 'EA account linked to another user', needSid: true });
    let decision = linkDecision(owner, userId, r.proved);
    if (decision === 'needSid') return needSid();
    if (decision !== 'already') {
      // checked again under a per-persona lock: two parallel links cannot both pass the limit
      const done = await linkPersona(r.account.id, userId, r.proved);
      if (done === 'limit') return limited();
      if (done === 'needSid') return needSid();
      if (done === 'already') decision = 'already';
    }
    // Founding 50: the first links get Premium for life; on 'already' too, so a grant a DB hiccup
    // swallowed is retried (it returns at once for a founder)
    await grantFounderSpot(userId, r.account.id);
    await grantInviteOnLink(userId, r.account.id, ipHash(req.ip)); // after the founders grant: a founder stays for life
    await consumeLinkToken(token!);
    linked = r.account.id;
    // newly linked here: load the club now (the site re-sends tokens every few minutes, so not on 'already')
    if (decision !== 'already') clubQueued = await syncOnLink(r.account);
  }
  return { ok: true, account: r.account, accessKey: r.account.info.accessKey, linked, linkRejected: !!token && !userId, clubQueued };
});

const LONG_POLL_MS = 20_000; // under nginx's 60 s proxy timeout and the 30 s open / live windows

/** Next sync job for the web app tab (null when idle). Polling also marks the tab as open. */
app.get('/api/jobs/next', async (req) => {
  const acc = account(req);
  if (!acc.clientMode) return { job: null, again: 5000 };
  const { visible, ready, wait } = req.query as { visible?: string; ready?: string; wait?: string };
  // the extension's own poll after /api/hello (also sent on an FC Solver site visit, with no web
  // app tab open): not a tab, so it takes no job and does not mark the web app as open
  if (!isTabPoll(acc.info.extVersion, ready)) return { job: null, again: 5000 };
  const clubItems = async () => (await readShared<unknown[]>(acc.key('club')))?.data.length ?? null;
  try {
    await acc.meter.check();
  } catch (e) {
    // over budget or paused: the queue waits, but the tab is still there (its jobs stay "paused",
    // not failed as if the tab closed); no job is handed out, nothing reaches EA
    markPoll(acc);
    markReady(acc, ready !== '0');
    // cap fully used: queued jobs show "over budget" (not "queued", which would hold Solve all day)
    if (e instanceof SessionError && e.msgCode === 'budget') markBlocked(acc, await clubItems());
    return { job: null, again: 5000 };
  }
  const returned = webAppReturned(acc, visible === undefined ? undefined : visible === '1');
  markPoll(acc); // open from now, so the visit below may queue
  // came (back) to the web app: SBCs done elsewhere in the meantime show up, handed out in this same answer
  if (returned) await refreshOnVisit(acc);
  const canRun = ready !== '0'; // extension 0.8.8+: a web app tab not logged in to EA gets no job
  // extension 1.0.3+: hold the request until a job is ready (or 20 s), so a queued sync starts at once
  const hold = wait === '1' && canRun;
  const gone = () => req.raw.socket?.destroyed ?? false;
  const until = Date.now() + LONG_POLL_MS;
  const budgetNow = async () => {
    const [m, items] = await Promise.all([acc.meter.summary(), clubItems()]);
    return { left: Math.max(0, m.limit - m.today), limit: m.limit, clubItems: items };
  };
  // shutting down: hand out nothing, the next server would not know the job (its EA calls would be wasted)
  if (isShuttingDown()) return { job: null, again: hold ? 1000 : 5000 };
  let budget = await budgetNow();
  if (isShuttingDown()) return { job: null, again: hold ? 1000 : 5000 };
  let job = nextJob(acc, canRun, budget);
  while (!job && hold && Date.now() < until && !gone() && !isShuttingDown()) {
    await waitForWork(acc, Math.min(until - Date.now(), restLeft(acc) || LONG_POLL_MS, 10_000));
    if (gone() || isShuttingDown()) break;
    markPoll(acc); // still holding: the tab is still there
    try {
      await acc.meter.check();
    } catch (e) {
      if (e instanceof SessionError && e.msgCode === 'budget') markBlocked(acc, await clubItems());
      break;
    }
    if (gone()) break; // the socket may have closed during the meter check
    budget = await budgetNow();
    if (isShuttingDown()) return { job: null, again: hold ? 1000 : 5000 };
    job = nextJob(acc, canRun, budget);
  }
  return { job: job && { id: job.id, kind: job.kind, setIds: job.setIds, challengeId: job.challengeId }, again: hold ? 1000 : 5000 };
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
    await acc.meter.record(method.toUpperCase().slice(0, 8), path.slice(0, 200), Number.isInteger(status) ? status : null, job.kind);
    if (THROTTLE_CODES.includes(status ?? 0)) {
      await acc.meter.pause();
      notify(acc.id);
    }
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
  // per-account budget (relay-rules.ts): over it the relay is dropped; the extension does not retry
  const bytes = Number(req.headers['content-length']) || JSON.stringify(ev).length;
  if (!relayBudget(acc.id, bytes)) return reply.code(429).send({ ok: false, summary: null });
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
/** Uptime monitor + compose health check: the API answers and Postgres answers within 2 s. */
app.get('/api/health', async (_req, reply) => {
  reply.header('Cache-Control', 'no-store');
  const ok = await Promise.race([db.execute(sql`select 1`).then(() => true, () => false), new Promise<boolean>((r) => setTimeout(() => r(false), 2000).unref())]);
  return reply.code(ok ? 200 : 503).send({ ok });
});

app.get('/api/meta', async (req, reply) => {
  const acc = await optionalSiteAccount(req);
  const m = acc ? await metaFor(acc) : await loadMeta();
  return sendTagged(req, reply, {
    names: { nation: m.names.nation, league: m.names.league, club: m.names.club, rarity: m.names.rarity },
    formations: m.formations,
    rarities: m.rarities,
    contentBase: m.contentBase,
  });
});

app.get('/api/club', async (req, reply) => sendTagged(req, reply, await clubPlayers(await siteAccount(req))));

// FUT Gallery planner (Premium): best lineup per set from every item seen in the club
app.get('/api/gallery', async (req) => {
  const { userId, acc } = await siteContext(req);
  if ((await planFor(userId)).tier !== 'premium') throw new SessionError('FUT Gallery is a Premium feature.', 403, 'premiumOnly');
  return galleryFor(acc, await metaFor(acc));
});

// My Squads (Premium): the saved squads the web app loaded, each with its value (EA's marketAverage); cache only
app.get('/api/squads', async (req) => {
  const { userId, acc } = await siteContext(req);
  if ((await planFor(userId)).tier !== 'premium') throw new SessionError('My Squads is a Premium feature.', 403, 'premiumOnly');
  return { ...(await squadsFor(acc, await metaFor(acc))), calculating: hasPending(acc, 'squads') };
});

// "Calculate" on My Squads: the user asks the web app tab to read the squad list and every saved squad
// (read-only, at most 1 + SQUADS_MAX requests); never on a page load. Extension 1.0.5+ has the recipe.
app.post('/api/squads/calculate', async (req, reply) => {
  const { userId, acc } = await siteContext(req);
  if ((await planFor(userId)).tier !== 'premium') throw new SessionError('My Squads is a Premium feature.', 403, 'premiumOnly');
  if (!acc.clientMode || !webAppOpen(acc))
    return reply.code(409).send({ error: 'Open the FC27 web app in this browser first.', code: 'webAppClosed', params: {} });
  if (!acc.info.extVersion || versionLess(acc.info.extVersion, '1.0.5'))
    return reply.code(409).send({ error: 'Update the extension to read your squads.', code: 'squadsExtOld', params: { version: '1.0.5' } });
  await acc.meter.check();
  await enqueue(acc, 'squads');
  return { calculating: true };
});

app.get<{ Params: { id: string } }>('/api/squads/:id', async (req, reply) => {
  const { userId, acc } = await siteContext(req);
  if ((await planFor(userId)).tier !== 'premium') throw new SessionError('My Squads is a Premium feature.', 403, 'premiumOnly');
  const id = /^\d{1,9}$/.test(req.params.id) ? Number(req.params.id) : null;
  const squad = id === null ? null : await squadFor(acc, await metaFor(acc), id);
  if (!squad) return reply.code(404).send({ error: 'squad not found', code: 'squadNotFound', params: {} });
  return squad;
});

// Objectives (Premium): the web app's objectives with the squad condition read from each, plus the groups of
// the shared catalogue (relayed by trusted accounts) this account has not loaded itself, progress unknown
async function objectiveGroups(acc: Account, meta: Meta) {
  const [own, shared] = await Promise.all([
    readCache<{ categories: EaCategory[] }>(acc.key('objectives')),
    readCache<{ categories: EaCategory[] }>(SHARED_OBJECTIVES_KEY),
  ]);
  const now = Date.now();
  const open = (c: typeof own) => (c ? openGroups(c.data.categories, now, meta.names) : null);
  const { source, groups } = mergeGroups(open(own), open(shared));
  return { fetchedAt: own?.fetchedAt ?? shared?.fetchedAt ?? null, source, groups: nameAwards(groups, meta.players) };
}

app.get('/api/objectives', async (req) => {
  const { userId, acc } = await siteContext(req);
  if ((await planFor(userId)).tier !== 'premium') throw new SessionError('Objectives squads are a Premium feature.', 403, 'premiumOnly');
  const meta = await metaFor(acc);
  const squad = (await readCache<ActiveSquad>(acc.key('squad')))?.data ?? null;
  return { ...(await objectiveGroups(acc, meta)), formation: squad?.formation ?? null };
});

// one objectives solve per user at a time (a CP-SAT run takes up to 10 s on 4 workers)
const objectivesSolving = new Set<string>();

app.post<{ Body: { objectiveIds?: unknown; formation?: unknown; options?: { excludeIds?: unknown; maxRating?: unknown; includeLoans?: unknown } } }>(
  '/api/objectives/solve',
  async (req, reply) => {
    const { userId, acc } = await siteContext(req);
    if ((await planFor(userId)).tier !== 'premium') throw new SessionError('Objectives squads are a Premium feature.', 403, 'premiumOnly');
    if (!solveLimit(userId)) throw tooMany(); // per user, on top of one at a time
    const key = String(userId);
    if (objectivesSolving.has(key)) return reply.code(429).send({ error: 'a solve is already running', code: 'busy', params: {} });
    objectivesSolving.add(key);
    try {
      const meta = await metaFor(acc);
      const ids = Array.isArray(req.body?.objectiveIds) ? req.body.objectiveIds.filter((x): x is number => Number.isInteger(x)) : [];
      const formation = typeof req.body?.formation === 'string' ? req.body.formation : '';
      if (!Object.hasOwn(meta.formations, formation)) return reply.code(400).send({ error: 'unknown formation', code: 'badFormation', params: {} });
      const { groups } = await objectiveGroups(acc, meta);
      const picked = groups.flatMap((g) => g.objectives).filter((o) => ids.includes(o.id) && solvable(o));
      if (picked.length === 0) return reply.code(400).send({ error: 'pick at least one objective with a squad condition', code: 'noObjectives', params: {} });
      const { players } = await clubPlayers(acc);
      if (players.length === 0) return reply.code(409).send({ error: 'club is empty (sync your club first)', code: 'clubEmpty', params: {} });
      const o = req.body?.options ?? {};
      const options = {
        excludeIds: Array.isArray(o.excludeIds) ? o.excludeIds.filter((x): x is number => Number.isInteger(x)) : [],
        maxRating: typeof o.maxRating === 'number' && Number.isFinite(o.maxRating) ? o.maxRating : 99,
        includeLoans: o.includeLoans === true, // loans run out after a few matches: only when asked
      };
      const conds: { objectiveId: number; condition: Condition }[] = picked.flatMap((ob) => ob.conditions.map((condition) => ({ objectiveId: ob.id, condition })));
      const t0 = Date.now();
      // soft solve: each objective is a group, as many covered as possible, then the strongest squad
      const r = await solveObjectives(players, formation, conds.map((c) => c.condition), meta, options, undefined, undefined, conds.map((c) => c.objectiveId));
      logEvent({ type: 'solve', userId, personaId: acc.id, data: { kind: 'objectives', found: r.found, partial: r.partial, optimal: r.optimal, objectives: picked.length } });
      return {
        found: r.found,
        partial: r.partial,
        optimal: r.optimal,
        ms: Date.now() - t0,
        formation,
        slots: meta.formations[formation].map((position, i) => ({ position, player: r.slots[i], chem: r.eval?.perSlotChem[i] ?? 0 })),
        eval: r.eval,
        covers: r.covers.map((c, i) => ({ objectiveId: conds[i].objectiveId, condition: c.condition, itemIds: c.itemIds, met: c.met })),
        reasons: r.reasons,
      };
    } finally {
      objectivesSolving.delete(key);
    }
  },
);

app.get('/api/sets', async (req, reply) => {
  const acc = await siteAccount(req);
  const sets = await readShared<SetsData>(acc.key('sets'));
  // a points challenge shows its target on the set tile (from the cached challenges, no EA call)
  const categories = await Promise.all(
    (sets?.data.categories ?? []).map(async (cat) => ({
      ...cat,
      sets: await Promise.all(
        cat.sets.map(async (s) => {
          const ch = (await readShared<Challenge[]>(acc.key(`challenges/${s.setId}`)))?.data.find(isPointsChallenge);
          return ch ? { ...s, pointsTarget: pointsTarget(ch) } : s;
        }),
      ),
    })),
  );
  return sendTagged(req, reply, { fetchedAt: sets?.fetchedAt ?? null, categories });
});

app.get<{ Params: { id: string } }>('/api/sets/:id/challenges', async (req) => {
  const acc = await siteAccount(req);
  const meta = await metaFor(acc);
  const ch = await getChallenges(acc, Number(req.params.id));
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

app.post<{ Body: SolveBody }>('/api/solve', async (req) => {
  const { userId, acc } = await siteContext(req);
  if (!solveLimit(userId)) throw tooMany(); // each solve is a CP-SAT run, found or not
  return runSolve(userId, acc, req.body);
});

// ---- web ------------------------------------------------------------------------
const dist = join(ROOT, 'dist');

// Search engines: robots.txt, sitemap.xml and index.html with this page's <head> (server/seo.ts).
let plainHtml: string | null = null; // read once; a new build restarts the server
let ogVersion: string | null = null;
for (const w of analyticsWarnings()) console.warn(`[analytics] ANALYTICS_SNIPPET: ${w}`);
async function sendPage(req: FastifyRequest, reply: FastifyReply, path: string) {
  if (!isKnownPath(path)) reply.code(404); // the site shows its 404 page (shared/paths.ts)
  plainHtml ??= await readFile(join(dist, 'index.html'), 'utf8');
  const indexHtml = analyticsFor(path) ? withAnalytics(plainHtml) : plainHtml;
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
    setHeaders: (res, path) => {
      // the landing art, brand and icon files change rarely: a week; sw.js, offline.html and the manifest revalidate
      const week = [join('dist', 'landing'), join('dist', 'brand')].some((d) => path.includes(d)) || /icon|favicon|og\.png/.test(path);
      res.header('Cache-Control', path.includes(`${join('dist', 'assets')}`) ? 'public, max-age=31536000, immutable' : week ? 'public, max-age=604800' : 'no-cache');
      if (path.endsWith('offline.html')) res.header('X-Robots-Tag', 'noindex'); // the PWA's offline fallback, not a page
    },
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
  await loadMaintenance();
} catch (e) {
  console.error(`[startup] cannot start: ${(e as Error).message}`);
  process.exit(1);
}
installLedger();
installDailyIngest();
installHistory();
scheduleDaily();
scheduleDeletions();
schedulePrune();
void pruneEvents();
void pruneBillingEvents();
void backfillFounders().catch((e) => console.error(`[founders] backfill failed: ${(e as Error).message}`));
setInterval(() => {
  void pruneEvents();
  void pruneBillingEvents();
}, 24 * 60 * 60 * 1000).unref();
await app.listen({ port: PORT, host: process.env.HOST ?? '127.0.0.1' });
console.log(`FC Solver API on http://localhost:${PORT}`);

process.on('unhandledRejection', (e) => {
  console.error('[unhandledRejection]', e);
  void alert('unhandled', e);
});
process.on('uncaughtException', (e) => {
  console.error('[uncaughtException]', e);
  // Docker restarts the container; the alert gets 2 s at most
  void Promise.race([alert('uncaught', e), new Promise((r) => setTimeout(r, 2000))]).finally(() => process.exit(1));
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) process.exit(0); // a second signal: no more waiting
  stopping = true;
  console.log(`[shutdown] ${signal}: closing`);
  const hard = setTimeout(() => process.exit(0), 20_000).unref(); // in-flight requests get 20 s
  endAllStreams(); // live streams and held polls reconnect to the next server
  wakeAll();
  killAllSolvers();
  try {
    await app.close();
    await closeDb();
  } catch (e) {
    console.error(`[shutdown] ${(e as Error).message}`);
  }
  clearTimeout(hard);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

void autoSyncAll();
setInterval(() => void autoSyncAll(), 60 * 1000);
setInterval(() => void checkEvoAlerts(), 60 * 1000);
setInterval(() => void checkDailyReminders(), 60 * 1000);
