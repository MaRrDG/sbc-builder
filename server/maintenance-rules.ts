// Pure rules of maintenance mode (server/maintenance.ts): which requests still pass and what a saved state may hold.

export interface MaintenanceState {
  on: boolean;
  since: string | null; // ISO time it was switched on
  note: string; // optional words for users, shown as typed (any language)
}

export const OFF: MaintenanceState = { on: false, since: null, note: '' };
export const NOTE_MAX = 280;

// Always open: uptime checks, the status the site polls, Paddle webhooks (state must keep following Paddle),
// CSP reports, the admin panel (switching it off again) and the extension handshake.
const OPEN = ['/api/health', '/api/maintenance', '/api/hello', '/api/billing/webhook', '/api/csp-report'];

/**
 * True when maintenance turns this request away. Only site calls are blocked: the extension (X-Account-Key, it keeps
 * relaying the web app into the cache) and the Discord bot (/api/bot/*, its own token) keep working; admins pass (checked by the caller).
 */
export function blockedByMaintenance(url: string, hasAccountKey: boolean): boolean {
  const path = url.split('?')[0];
  if (!path.startsWith('/api/')) return false;
  if (hasAccountKey) return false;
  if (path.startsWith('/api/admin/') || path.startsWith('/api/bot/')) return false;
  return !OPEN.includes(path);
}

/** A saved or posted state, cleaned: anything malformed is "off". */
export function parseMaintenance(raw: unknown): MaintenanceState {
  if (!raw || typeof raw !== 'object') return OFF;
  const r = raw as Record<string, unknown>;
  if (r.on !== true) return OFF;
  const note = typeof r.note === 'string' ? r.note.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX) : '';
  const since = typeof r.since === 'string' && !Number.isNaN(Date.parse(r.since)) ? r.since : null;
  return { on: true, since, note };
}

/** The owner's Discord line for a switch. */
export function maintenanceAlert(env: string, s: MaintenanceState): string {
  if (!s.on) return `**[${env}] maintenance OFF** · the site is open again`;
  return `**[${env}] maintenance ON** · users see the maintenance page${s.note ? `\nNote: ${s.note}` : ''}`;
}
