// server/daily/routes.ts
// Public Daily game endpoints (docs/api.md). Signed in only adds saved state, stats and points.
import type { FastifyInstance } from 'fastify';
import { optionalSiteUser } from '../auth.js';
import { SessionError } from '../ea.js';
import { createLimiter } from '../limits.js';
import { requestOrigin } from '../extension.js';
import { publicOrigin } from '../origins.js';
import { dailyInfo, guessPractice, guessToday, newPractice } from './service.js';
import { loadPlayers, namesList } from './store.js';

const BOOT = Date.now().toString(36);
const guessLimit =createLimiter({ windowMs: 60_000, max: 40 });
const tooMany = () => new SessionError('Too many requests, slow down a little.', 429, 'rateLimited');
const assetIdOf = (b: unknown) => {
  const v = (b as { assetId?: unknown } | null)?.assetId;
  if (!Number.isInteger(v) || (v as number) <= 0) throw new SessionError('Pick a player from the list.', 400, 'dailyUnknownPlayer');
  return v as number;
};

export function registerDailyRoutes(app: FastifyInstance) {
  app.get('/api/daily', async (req) => {
    const info = await dailyInfo(await optionalSiteUser(req));
    return { ...info, share: `${publicOrigin(requestOrigin(req.headers, req.protocol)).replace(/^https?:\/\//, '')}/daily` };
  });

  app.get('/api/daily/players', async (req, reply) => {
    await loadPlayers();
    const list = namesList();
    // the version restarts at every boot: tag it with the boot so a list cached before a restart
    // (e.g. still empty before daily:import) is never revalidated as current
    const etag = `"${BOOT}-${list.v}"`;
    reply.header('ETag', etag).header('Cache-Control', 'no-cache');
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    return list;
  });

  app.post<{ Body: { assetId?: unknown; state?: unknown; day?: unknown } }>('/api/daily/guess', async (req) => {
    if (!guessLimit(req.ip)) throw tooMany();
    return guessToday(await optionalSiteUser(req), assetIdOf(req.body), req.body?.state, req.body?.day);
  });

  app.post('/api/daily/practice', async (req) => {
    if (!guessLimit(req.ip)) throw tooMany();
    return newPractice();
  });

  app.post<{ Body: { token?: unknown; assetId?: unknown; state?: unknown } }>('/api/daily/practice/guess', async (req) => {
    if (!guessLimit(req.ip)) throw tooMany();
    return guessPractice(req.body?.token, assetIdOf(req.body), req.body?.state);
  });
}
