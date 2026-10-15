// "👥 Members: 123" locked voice channel at the very top of the server (no category), renamed by the bot as members join / leave.
// Bot-managed, not in layout.ts: its name changes, so setup could not match it by name.
import { ChannelType, OverwriteType, type Guild, type VoiceChannel } from 'discord.js';

const PREFIX = '👥 Members: ';
export const memberCountName = (n: number) => `${PREFIX}${n.toLocaleString('en-US')}`;
export const isMemberCountName = (name: string) => name.startsWith(PREFIX);

// Discord allows 2 renames per channel per 10 minutes; one every 5 minutes at most stays under it
export const RENAME_GAP_MS = 5 * 60_000;

/** When the next rename may run: now if the last one is old enough, otherwise when the gap ends. */
export function nextRenameAt(lastAt: number, now: number, gap = RENAME_GAP_MS): number {
  return Math.max(now, lastAt + gap);
}

/** Everyone sees it, nobody joins it; the bot may rename it. */
function overwrites(guild: Guild) {
  return [
    { id: guild.roles.everyone.id, type: OverwriteType.Role, allow: ['ViewChannel' as const], deny: ['Connect' as const] },
    { id: guild.client.user.id, type: OverwriteType.Member, allow: ['ViewChannel' as const, 'ManageChannels' as const], deny: [] },
  ];
}

async function ensureChannel(guild: Guild): Promise<VoiceChannel> {
  const channels = await guild.channels.fetch();
  const found = channels.find((c): c is VoiceChannel => c?.type === ChannelType.GuildVoice && isMemberCountName(c.name));
  const ch = found ?? await guild.channels.create({ name: memberCountName(guild.memberCount), type: ChannelType.GuildVoice, permissionOverwrites: overwrites(guild) });
  if (ch.parentId) await ch.setParent(null, { lockPermissions: false });
  if (ch.position !== 0) await ch.setPosition(0);
  return ch;
}

/** Keeps the counter channel up to date; call `bump()` on every join / leave. Failures are logged and never stop the bot. */
export function memberCounter(guild: Guild) {
  let lastAt = 0;
  let timer: NodeJS.Timeout | null = null;
  const rename = async () => {
    timer = null;
    lastAt = Date.now();
    try {
      const ch = await ensureChannel(guild);
      const name = memberCountName(guild.memberCount);
      if (ch.name !== name) await ch.setName(name);
    } catch (e) {
      console.warn(`[bot] member count: ${(e as Error).message}`);
    }
  };
  const bump = () => {
    if (timer) return; // one rename already waiting: it reads the count when it runs
    timer = setTimeout(() => void rename(), nextRenameAt(lastAt, Date.now()) - Date.now());
  };
  return { bump };
}
