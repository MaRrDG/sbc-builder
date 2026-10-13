// Public leaderboard names: short, plain ASCII, unique ignoring case (unique index on lower(username)).
const RE = /^[A-Za-z0-9_.-]{3,16}$/;

export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const u = raw.trim();
  return RE.test(u) && /[A-Za-z0-9]/.test(u) ? u : null;
}

export const usernameKey = (u: string) => u.toLowerCase();

const RESERVED = ['admin', 'support', 'fcsolver', 'moderator', 'staff', 'official'];

/** Staff-looking names ("Ad.min", "FC_Solver") stay off the public leaderboard. */
export function isReservedUsername(u: string): boolean {
  const k = u.toLowerCase().replace(/[._-]/g, '');
  return RESERVED.some((w) => k.includes(w));
}

export const RENAME_COOLDOWN_MS = 7 * 24 * 3600 * 1000;

export type RenameCheck = { change: false } | { change: true; ok: true } | { change: true; ok: false; until: Date };

/** A first name is free; the same name (ignoring case) is no change; a different one needs 7 days since the last change. */
export function renameAllowed(current: string | null, next: string, changedAt: Date | null, now: Date): RenameCheck {
  if (current && usernameKey(current) === usernameKey(next)) return { change: false };
  if (!current || !changedAt) return { change: true, ok: true };
  const until = new Date(changedAt.getTime() + RENAME_COOLDOWN_MS);
  return now.getTime() >= until.getTime() ? { change: true, ok: true } : { change: true, ok: false, until };
}
