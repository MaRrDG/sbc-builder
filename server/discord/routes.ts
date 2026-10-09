// /api/bot/*: what the Discord bot (discord/, its own container) may ask. Token-only; Apache denies the path
// from outside. The bot never reaches EA or the database itself, everything goes through here.
import type { FastifyInstance } from 'fastify';
import { botTokenOk } from './bot-auth.js';
import { currentDay, todayGame } from '../daily/service.js';
import { clerkApi, siteUser } from '../auth.js';
import { SessionError } from '../ea.js';
import { discordOf, setDiscord } from '../db/discord.js';
import { discordAccountIds, discordAccountOf } from './link.js';

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
    await setDiscord(userId, null);
    return discordView(userId);
  });
}
