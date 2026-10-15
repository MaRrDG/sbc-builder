// Maintenance mode: the admin switches it in the admin panel; while on, site API calls answer 503 `maintenance`
// (the site shows its maintenance page) and admins keep full access. Saved in data/maintenance.json so a restart keeps it.
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DATA_DIR } from './store.js';
import { SessionError } from './ea.js';
import { siteUser } from './auth.js';
import { isAdmin, requireAdmin } from './admin/auth.js';
import { env, notify } from './alert.js';
import { blockedByMaintenance, maintenanceAlert, OFF, parseMaintenance, type MaintenanceState } from './maintenance-rules.js';

const FILE = join(DATA_DIR, 'maintenance.json');
let state: MaintenanceState = OFF;

export async function loadMaintenance() {
  state = parseMaintenance(await readFile(FILE, 'utf8').then(JSON.parse, () => null));
  if (state.on) console.log('[maintenance] on');
}

async function save(next: MaintenanceState) {
  const tmp = `${FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(next));
  await rename(tmp, FILE);
  state = next;
}

/** onRequest: turns a site call away while maintenance is on, unless the caller is an admin. */
export async function maintenanceGate(req: FastifyRequest) {
  if (!state.on || !blockedByMaintenance(req.url, typeof req.headers['x-account-key'] === 'string')) return;
  const admin = await siteUser(req).then(isAdmin, () => false);
  if (!admin) throw new SessionError('FC Solver is down for maintenance. Try again soon.', 503, 'maintenance');
}

export function registerMaintenanceRoutes(app: FastifyInstance) {
  // public: the site asks on load whether to show the maintenance page
  app.get('/api/maintenance', async (_req, reply) => {
    reply.header('Cache-Control', 'no-store');
    return { maintenance: state.on, note: state.on ? state.note : '' };
  });

  app.get('/api/admin/maintenance', async (req) => {
    await requireAdmin(req);
    return state;
  });

  app.post<{ Body: { on?: boolean; note?: string } }>('/api/admin/maintenance', async (req) => {
    await requireAdmin(req);
    const body = req.body ?? {};
    const next = parseMaintenance({ on: body.on === true, note: body.note, since: body.on === true ? (state.on && state.since) || new Date().toISOString() : null });
    const changed = next.on !== state.on || next.note !== state.note;
    await save(next);
    if (changed) {
      console.log(`[maintenance] ${next.on ? 'on' : 'off'}`);
      void notify(maintenanceAlert(env(), next));
    }
    return state;
  });
}
