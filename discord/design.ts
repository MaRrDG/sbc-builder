// The server's look beyond channels and roles: Community settings, Welcome Screen, custom emojis, server icon,
// bot avatar. Data + pure helpers on top, applyDesign (live guild) at the bottom; every step warns instead of failing.
import {
  ChannelType, GuildDefaultMessageNotifications, GuildExplicitContentFilter, GuildFeature, GuildVerificationLevel, SystemChannelFlagsBitField,
  type Client, type Guild,
} from 'discord.js';
import { ASSETS, assetPath } from './brand.js';
import { CAT, CATEGORIES, CH } from './layout.js';
import { findText } from './guild.js';

export const EMOJIS = [
  { name: 'fcs_check', file: ASSETS.check },
  { name: 'fcs_fc', file: ASSETS.avatar },
  { name: 'fcs_lime', file: ASSETS.lime },
];

export function missingEmojis(existing: string[], wanted = EMOJIS) {
  const have = new Set(existing.map((n) => n.toLowerCase()));
  return wanted.filter((e) => !have.has(e.name));
}

export function emojiTag(emojis: ReadonlyMap<string, string>, name: string, fallback: string): string {
  const id = emojis.get(name);
  return id ? `<:${name}:${id}>` : fallback;
}

/** Setup only raises these settings to the minimum it needs: a stricter value an admin set stays (all three enums grow with strictness). */
export function atLeast(current: number | null | undefined, minimum: number): number {
  return Math.max(current ?? minimum, minimum);
}

export const COMMUNITY_DESCRIPTION = 'Cheapest SBC squads from your own EA FC club. Cele mai ieftine loturi SBC din clubul tău.';

export const WELCOME = {
  description: 'Cheapest SBC squads from your own club. / Cele mai ieftine loturi SBC din clubul tău.',
  channels: [
    // Discord accepts only channels @everyone can read: new joiners see nothing else
    { category: CAT.info, channel: CH.language, emoji: '🌐', description: 'Pick your language · Alege limba' },
  ],
};

/** One design step: a failure is logged with its name and reason, the next step still runs. */
async function step(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(`[setup] design: ${name}`);
  } catch (e) {
    console.warn(`[setup] design: ${name} skipped: ${(e as Error).message}`);
  }
}

export async function applyDesign(guild: Guild, opts: { icon: boolean; avatar: boolean; client: Client }): Promise<void> {
  const me = await guild.members.fetchMe();
  for (const [perm, what] of [['ManageGuild', 'Community settings and Welcome Screen'], ['ManageGuildExpressions', 'custom emojis']] as const)
    if (!me.permissions.has(perm)) console.warn(`[setup] design: the bot lacks ${perm}: ${what} will be skipped`);

  if (opts.icon || !guild.icon) await step('server icon', () => guild.setIcon(assetPath(ASSETS.avatar)));
  if (opts.avatar) await step('bot avatar', () => opts.client.user!.setAvatar(assetPath(ASSETS.avatar)));

  await step('community settings', async () => {
    const rules = await findText(guild, CAT.info, CH.rules);
    const welcome = await findText(guild, CAT.info, CH.welcome);
    const modLog = await findText(guild, CAT.staff, CH.modLog);
    await guild.edit({
      features: [...new Set([...guild.features, GuildFeature.Community])],
      rulesChannel: rules,
      publicUpdatesChannel: modLog,
      systemChannel: welcome,
      // Discord's own boost messages stay on; setup tips, "wave to say hi" replies and the join message (the bot welcomes members itself) off
      systemChannelFlags: new SystemChannelFlagsBitField(['SuppressGuildReminderNotifications', 'SuppressJoinNotificationReplies', 'SuppressJoinNotifications']),
      verificationLevel: atLeast(guild.verificationLevel, GuildVerificationLevel.Low),
      explicitContentFilter: atLeast(guild.explicitContentFilter, GuildExplicitContentFilter.AllMembers),
      defaultMessageNotifications: atLeast(guild.defaultMessageNotifications, GuildDefaultMessageNotifications.OnlyMentions),
      description: COMMUNITY_DESCRIPTION,
      reason: 'FC Solver setup',
    });
  });

  // Announcement channels exist only in Community servers: convert the layout's text copies now (already converted = not found as text = skipped)
  const fresh = await guild.fetch();
  if (fresh.features.includes(GuildFeature.Community)) {
    const all = await guild.channels.fetch();
    for (const cat of CATEGORIES)
      for (const ch of cat.channels.filter((c) => c.kind === 'announcement')) {
        const parent = all.find((c) => c?.type === ChannelType.GuildCategory && c.name === cat.name);
        const text = all.find((c) => c?.type === ChannelType.GuildText && c.parentId === parent?.id && c.name === ch.name);
        if (text) await step(`announcement ${ch.name}`, () => guild.channels.edit(text.id, { type: ChannelType.GuildAnnouncement }));
      }
    await step('welcome screen', async () => {
      const welcomeChannels = [];
      for (const w of WELCOME.channels) welcomeChannels.push({ channel: (await findText(guild, w.category, w.channel)).id, emoji: w.emoji, description: w.description });
      await guild.editWelcomeScreen({ enabled: true, description: WELCOME.description, welcomeChannels });
    });
  } else console.warn('[setup] design: Community is off: announcements stays a text channel, no Welcome Screen');

  try {
    const have = await guild.emojis.fetch();
    for (const e of missingEmojis([...have.values()].map((x) => x.name ?? '')))
      await step(`emoji ${e.name}`, () => guild.emojis.create({ attachment: assetPath(e.file), name: e.name, reason: 'FC Solver setup' }));
  } catch (e) {
    console.warn(`[setup] design: emojis skipped: ${(e as Error).message}`);
  }
}
