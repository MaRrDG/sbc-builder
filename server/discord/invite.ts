// The public Discord invite (DISCORD_INVITE_URL), only when it is a real Discord invite link.

const PREFIXES = ['https://discord.gg/', 'https://discord.com/invite/'];

/** The configured invite when it is an https Discord invite URL, else null (never echoes anything else). */
export function publicInvite(raw: string | undefined): string | null {
  const v = raw?.trim();
  if (!v || /\s/.test(v)) return null;
  const p = PREFIXES.find((x) => v.startsWith(x));
  return p && /^[A-Za-z0-9_-]+\/?$/.test(v.slice(p.length)) ? v : null;
}
