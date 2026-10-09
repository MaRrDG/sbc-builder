// Which Discord account a Clerk user connected (Clerk Discord social connection, connect-only), and which EA
// account the bot uses for them. Pure.
export interface ClerkExternal {
  id: string;
  provider: string;
  providerUserId: string;
  username?: string | null;
  verification?: { status?: string | null } | null;
}

/** A Discord user id (snowflake). */
export const isDiscordId = (s: string): boolean => /^\d{17,20}$/.test(s);

const isDiscord = (e: ClerkExternal) => e.provider === 'oauth_discord' || e.provider === 'discord';

/** Only a verified account counts: an abandoned OAuth attempt leaves an unverified one behind. */
export function discordAccountOf(list: ClerkExternal[]): { externalId: string; discordId: string; username: string } | null {
  const a = list.find((e) => isDiscord(e) && e.verification?.status === 'verified' && isDiscordId(e.providerUserId));
  return a ? { externalId: a.id, discordId: a.providerUserId, username: a.username ?? '' } : null;
}

/** Every Discord external account, any status (disconnect removes them all). */
export function discordAccountIds(list: ClerkExternal[]): string[] {
  return list.filter(isDiscord).map((e) => e.id);
}

/** The EA account the bot uses: the most recently linked one. */
export function pickPersona(owned: { personaId: number; linkedAt: number }[]): number | null {
  return owned.length ? [...owned].sort((a, b) => b.linkedAt - a.linkedAt)[0].personaId : null;
}
