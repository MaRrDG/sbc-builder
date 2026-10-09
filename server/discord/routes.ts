// /api/bot/*: what the Discord bot (discord/, its own container) may ask. Token-only; Apache denies the path
// from outside. The bot never reaches EA or the database itself, everything goes through here.
import type { FastifyInstance } from 'fastify';
import { botTokenOk } from './bot-auth.js';
import { currentDay, todayGame } from '../daily/service.js';

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
