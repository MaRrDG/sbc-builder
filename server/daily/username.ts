// Public leaderboard names: short, plain ASCII, unique ignoring case (unique index on lower(username)).
const RE = /^[A-Za-z0-9_.-]{3,16}$/;

export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const u = raw.trim();
  return RE.test(u) && /[A-Za-z0-9]/.test(u) ? u : null;
}

export const usernameKey = (u: string) => u.toLowerCase();
