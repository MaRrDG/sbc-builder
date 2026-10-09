// /api/bot/*: what the Discord bot (discord/, its own container) may ask. Token-only; Apache denies the path
// from outside. The bot never reaches EA or the database itself, everything goes through here.
import type { FastifyInstance } from 'fastify';
import { botTokenOk } from './bot-auth.js';
import { currentDay, todayGame } from '../daily/service.js';
import { clerkApi, siteUser } from '../auth.js';
import { SessionError } from '../ea.js';
import { accountById, type Account } from '../accounts.js';
import { boostRows, discordOf, ownedPersonas, setDiscord, startBoost, stopBoost, userByDiscord } from '../db/discord.js';
import { logEvent } from '../db/events.js';
import { planFor } from '../plans.js';
import { historyTotals } from '../db/history.js';
import { playsOf } from '../db/daily.js';
import { streakOf } from '../daily/streak.js';
import { createLimiter } from '../limits.js';
import { readCache } from '../store.js';
import { getChallenges, type SetsData } from '../sync.js';
import { runSolve } from '../solve-run.js';
import { parseBoosters, reconcileBoosts, stopsAllowed } from './boost.js';
import { discordAccountIds, discordAccountOf, isDiscordId, pickPersona } from './link.js';
import { clip, defaultChallenge, matchSets, setAvailable } from './pick.js';
import { toBotSolution, type BotStats } from './solution.js';

const solving = new Set<string>(); // Discord ids with a solve running: one at a time, so the quota check cannot race
const solveLimit = createLimiter({ windowMs: 60_000, max: 6 }); // per Discord user, on top of the bot's 30 s cooldown

/** The FC Solver user behind a Discord id and the EA account the bot uses for them. */
async function botUser(discordId: unknown): Promise<{ userId: string; acc: Account; lang: 'en' | 'ro'; discordId: string }> {
  if (typeof discordId !== 'string' || !isDiscordId(discordId)) throw new SessionError('Bad Discord id.', 400, 'badRequest');
  const u = await userByDiscord(discordId);
  if (!u) throw new SessionError('Connect Discord in FC Solver Settings first.', 404, 'discordNotLinked');
  const pid = pickPersona(await ownedPersonas(u.userId));
  const acc = pid ? accountById(pid) : null;
  if (!acc) throw new SessionError('Link an EA account to FC Solver first.', 409, 'noPersona');
  return { userId: u.userId, acc, lang: u.lang === 'ro' ? 'ro' : 'en', discordId };
}

/** Applies start / stop from a reconcile: only real row changes are logged and counted (a race with another call is a no-op).
 *  `force`: undefined = no mass-stop guard (one member's event), false/true = full list. Refused: nothing is applied. */
async function applyBoost(linked: Awaited<ReturnType<typeof boostRows>>, boosters: ReadonlyMap<string, number>, via: 'event' | 'reconcile', force?: boolean) {
  const r = reconcileBoosts(linked, boosters);
  if (force !== undefined && !stopsAllowed(r.stop.length, linked.filter((u) => u.boostSince !== null).length, force))
    throw new SessionError('Too many boosts would stop; resend with force if intended.', 409, 'tooManyStops');
  let started = 0, stopped = 0;
  for (const x of r.start) {
    if (!(await startBoost(x.userId, new Date(x.since)))) continue;
    started++;
    logEvent({ type: 'boost', userId: x.userId, data: { action: 'start', via } });
  }
  for (const x of r.stop) {
    if (!(await stopBoost(x.userId))) continue;
    stopped++;
    logEvent({ type: 'boost', userId: x.userId, data: { action: 'stop', via } });
  }
  return { started, stopped };
}

export function registerBotRoutes(app: FastifyInstance): void {
  void app.register(async (s) => {
    s.addHook('onRequest', async (req, reply) => {
      // read on use: .env is loaded by initDb(); a wrong token looks like a missing route
      if (!botTokenOk(req.headers['x-bot-token'], process.env.BOT_API_TOKEN)) return reply.code(404).send({ error: 'Not found' });
    });

    // today's Daily number; live = the answer is picked (pool ready), so the post never links a "not ready" page
    s.get('/api/bot/daily', async () => {
      try {
        return { day: (await todayGame()).day, live: true };
      } catch {
        return { day: await currentDay(), live: false };
      }
    });

    s.get<{ Querystring: { discordId?: string; q?: string } }>('/api/bot/sets', async (req) => {
      const { acc } = await botUser(req.query.discordId);
      const sets = await readCache<SetsData>(acc.key('sets'));
      return { sets: matchSets(sets?.data.categories ?? [], String(req.query.q ?? '')) };
    });

    s.get<{ Querystring: { discordId?: string; setId?: string } }>('/api/bot/challenges', async (req) => {
      const { acc } = await botUser(req.query.discordId);
      const setId = Number(req.query.setId);
      if (!Number.isInteger(setId) || setId <= 0) throw new SessionError('Bad set id.', 400, 'badRequest');
      const chs = ((await getChallenges(acc, setId))?.data ?? []).slice(0, 25); // Discord shows 25 choices; defaultId must be one of them
      return {
        challenges: chs.map((c) => ({ challengeId: c.challengeId, name: clip(`${c.status === 'COMPLETED' ? '✓ ' : ''}${c.name}`), done: c.status === 'COMPLETED' })),
        defaultId: defaultChallenge(chs),
      };
    });

    // the site's solve with default settings: same quota (a found squad counts), same re-check, cache only
    s.post<{ Body: { discordId?: string; setId?: unknown; challengeId?: unknown } }>('/api/bot/solve', async (req) => {
      const b = req.body ?? {};
      const u = await botUser(b.discordId);
      if (!solveLimit(u.discordId)) throw new SessionError('Too many solves, wait a minute.', 429, 'botRateLimited');
      const setId = Number(b.setId);
      if (!Number.isInteger(setId) || setId <= 0) throw new SessionError('Bad set id.', 400, 'badRequest');
      if (b.challengeId !== undefined && b.challengeId !== null && !(Number.isInteger(b.challengeId) && (b.challengeId as number) > 0))
        throw new SessionError('Bad challenge id.', 400, 'badRequest');
      const set = (await readCache<SetsData>(u.acc.key('sets')))?.data.categories.flatMap((c) => c.sets).find((x) => x.setId === setId);
      const chs = (await getChallenges(u.acc, setId))?.data ?? [];
      const challengeId = typeof b.challengeId === 'number' ? b.challengeId : defaultChallenge(chs);
      const ch = chs.find((c) => c.challengeId === challengeId);
      if (!set || !ch) throw new SessionError('challenge not found (open it in the web app first)', 404, 'challengeNotFound');
      if (!setAvailable(set)) throw new SessionError('This SBC is done or cannot be repeated right now.', 409, 'setNotAvailable');
      if (solving.has(u.discordId)) throw new SessionError('A solve is already running, wait for it.', 429, 'botRateLimited');
      solving.add(u.discordId);
      let answer;
      try {
        answer = await runSolve(u.userId, u.acc, { setId, challengeId: ch.challengeId }, 'discord');
      } finally {
        solving.delete(u.discordId);
      }
      return toBotSolution(answer, { set: set.name, challenge: ch.name, setId, challengeId: ch.challengeId, lang: u.lang });
    });

    s.get<{ Querystring: { discordId?: string } }>('/api/bot/stats', async (req) => {
      const u = await botUser(req.query.discordId);
      const [h, club, plays, day] = await Promise.all([historyTotals(u.acc.id), readCache<unknown[]>(u.acc.key('club')), playsOf(u.userId), currentDay()]);
      const stats: BotStats = {
        sbcs: h.set, challenges: h.challenge, objectives: h.objective,
        club: club?.data.length ?? 0, streak: streakOf(plays, day).current, since: h.since, lang: u.lang,
      };
      return stats;
    });

    // one member's boost changed (GuildMemberUpdate); since = null: not boosting. Idempotent: `changed` says if it did anything.
    s.post<{ Body: { discordId?: unknown; since?: unknown } }>('/api/bot/boost', async (req) => {
      const { discordId, since } = req.body ?? {};
      if (typeof discordId !== 'string' || !isDiscordId(discordId) || (since !== null && (!Number.isInteger(since) || (since as number) < 0)))
        throw new SessionError('Bad boost.', 400, 'badRequest');
      const row = (await boostRows([discordId])).find((x) => x.discordId === discordId);
      if (!row) return { changed: false, linked: false, active: false, lang: 'en' };
      const r = await applyBoost([row], since === null ? new Map() : new Map([[discordId, since as number]]), 'event');
      const u = await userByDiscord(discordId);
      return { changed: r.started + r.stopped > 0, linked: true, active: since !== null, lang: u?.lang === 'ro' ? 'ro' : 'en' };
    });

    // full list of current boosters (bot start + every 15 min): heals missed events and links made after boosting
    s.post('/api/bot/boosts', async (req) => {
      const body = (req.body ?? {}) as { complete?: unknown; force?: unknown };
      const boosters = parseBoosters(req.body);
      if (!boosters || body.complete !== true) throw new SessionError('Bad booster list.', 400, 'badRequest');
      return applyBoost(await boostRows([...boosters.keys()]), boosters, 'reconcile', body.force === true);
    });
  });
}

async function discordView(userId: string) {
  const d = await discordOf(userId);
  return { discord: d ? { username: d.username } : null, invite: process.env.DISCORD_INVITE_URL?.trim() || null };
}

let loggedProviders = false;

/** Settings → Discord. Connecting itself happens in the browser with Clerk; here we only store what Clerk verified. */
export function registerDiscordSiteRoutes(app: FastifyInstance): void {
  app.get('/api/me/discord', async (req) => discordView(await siteUser(req)));

  app.post('/api/me/discord', async (req) => {
    const userId = await siteUser(req);
    // read from Clerk, never from the request: only a verified Discord account counts
    const externals = (await clerkApi().users.getUser(userId)).externalAccounts;
    const acc = discordAccountOf(externals);
    if (!acc) {
      if (!loggedProviders && externals.length) {
        loggedProviders = true;
        console.warn(`[discord] no Discord account recognized; Clerk providers: ${externals.map((e) => e.provider).join(', ')}`);
      }
      throw new SessionError('No Discord account is connected to your sign-in.', 400, 'discordNotConnected');
    }
    if ((await setDiscord(userId, acc)) === 'discordTaken') {
      // drop the verified-but-unstored Discord account so the user can try another one
      for (const externalAccountId of discordAccountIds(externals)) {
        try {
          await clerkApi().users.deleteUserExternalAccount({ userId, externalAccountId });
        } catch (e) {
          console.warn(`[discord] could not remove a rejected Discord account: ${(e as Error).name}`);
        }
      }
      throw new SessionError('This Discord account is already linked to another FC Solver account.', 409, 'discordTaken');
    }
    return discordView(userId);
  });

  app.delete('/api/me/discord', async (req) => {
    const userId = await siteUser(req);
    const user = await clerkApi().users.getUser(userId);
    for (const externalAccountId of discordAccountIds(user.externalAccounts))
      await clerkApi().users.deleteUserExternalAccount({ userId, externalAccountId });
    if ((await planFor(userId)).boost?.since) logEvent({ type: 'boost', userId, data: { action: 'stop', via: 'unlink' } });
    await setDiscord(userId, null);
    return discordView(userId);
  });
}
