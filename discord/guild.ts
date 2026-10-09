// Finding the layout's channels and the bot's own messages in a live guild.
import { ChannelType, type Guild, type Message, type TextChannel } from 'discord.js';

export async function findText(guild: Guild, category: string, name: string): Promise<TextChannel> {
  const all = await guild.channels.fetch();
  const cat = all.find((c) => c?.type === ChannelType.GuildCategory && c.name.toLowerCase() === category.toLowerCase());
  const ch = cat && all.find((c) => c?.type === ChannelType.GuildText && c.parentId === cat.id && c.name === name);
  if (!ch) throw new Error(`#${name} in ${category} not found: run npm run discord:setup`);
  return ch as TextChannel;
}

export async function findOwnMessage(channel: TextChannel, botId: string, match: (m: Message) => boolean, limit = 50): Promise<Message | null> {
  const msgs = await channel.messages.fetch({ limit });
  return msgs.find((m) => m.author.id === botId && match(m)) ?? null;
}

/** The category name of an interaction's channel (decides the bot's language), null outside a category. */
export function categoryOf(channel: unknown): string | null {
  const parent = (channel as { parent?: { name?: unknown } | null } | null)?.parent;
  return typeof parent?.name === 'string' ? parent.name : null;
}
