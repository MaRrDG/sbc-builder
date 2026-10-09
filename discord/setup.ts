// Applies discord/layout.ts to DISCORD_GUILD_ID: roles (colours, order), categories, channels (names, topics,
// slowmode, overwrites), the rules message (banner + ✅), welcome and role pickers, then the slash commands.
// Idempotent: run it after every layout change. Community / welcome screen / emojis / icon: applyDesign (design.ts).
import { ChannelType, Client, Events, GatewayIntentBits, type Guild, type GuildBasedChannel, type TextChannel } from 'discord.js';
import { loadConfig, loadEnvFile } from './config.js';
import { CAT, CATEGORIES, CH, ROLES, overwritesFor, type PickerGroup, type RoleIds } from './layout.js';
import { planSync, rolePositions, type Existing } from './sync-plan.js';
import { RULES_TITLE, WELCOME_TITLE, pickerMessage, pickerTitle, rulesMessage, welcomeMessage } from './content.js';
import { COMMANDS } from './commands.js';
import { findOwnMessage, findText } from './guild.js';
import { applyDesign } from './design.js';

loadEnvFile();
const cfg = loadConfig();
const reason = 'FC Solver setup';
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
const ready = new Promise<void>((r) => client.once(Events.ClientReady, () => r()));
await client.login(cfg.token);
await ready;
try {
  await apply(await client.guilds.fetch(cfg.guildId));
  console.log('[setup] done');
} catch (e) {
  console.error(`[setup] ${(e as Error).message}`);
  process.exitCode = 1;
} finally {
  await client.destroy();
}

function kindOf(c: GuildBasedChannel): Existing['channels'][number]['kind'] {
  if (c.type === ChannelType.GuildCategory) return 'category';
  if (c.type === ChannelType.GuildText) return 'text';
  if (c.type === ChannelType.GuildAnnouncement) return 'announcement';
  return c.type === ChannelType.GuildVoice ? 'voice' : 'other';
}

async function snapshot(guild: Guild): Promise<Existing> {
  const roles = await guild.roles.fetch();
  const channels = await guild.channels.fetch();
  return {
    roles: [...roles.values()].map((r) => ({ id: r.id, name: r.name, managed: r.managed || r.id === guild.id })),
    channels: [...channels.values()].flatMap((c) => (c ? [{ id: c.id, name: c.name, kind: kindOf(c), parentId: c.parentId }] : [])),
  };
}

async function apply(guild: Guild) {
  const me = await guild.members.fetchMe();
  const botRole = me.roles.botRole;
  if (!botRole) throw new Error('the bot has no role of its own: invite it with the "bot" scope');
  const icon = client.user!.displayAvatarURL({ extension: 'png', size: 256 });
  const roleNames = ROLES.map((r) => r.name);
  const actions = planSync(await snapshot(guild), ROLES, CATEGORIES);
  // Discord only lets the bot hand out permissions it holds itself
  if (!me.permissions.has('Administrator')) {
    const lacking = [...new Set(ROLES.flatMap((r) => r.permissions))].filter((p) => !me.permissions.has(p));
    if (lacking.length) throw new Error(`The bot's role lacks permissions it must give to roles: ${lacking.join(', ')}. Grant them to the bot role (or Administrator), then run setup again.`);
  }
  // an existing role we manage at or above the bot cannot be edited: checked before anything is created
  const botAt = (await guild.roles.fetch(botRole.id))?.position ?? 0;
  for (const a of actions)
    if (a.op === 'updateRole' && (guild.roles.cache.get(a.id)?.position ?? 0) >= botAt)
      throw new Error(`The role "${a.role.name}" is above the bot's role: move the bot role to the top of the role list, then run setup again.`);
  let created = 0;

  // roles: name (aliases get renamed), colour, permissions; the ⚽ icon only where Discord allows role icons (boost level 2)
  const byName = new Map<string, string>();
  const icons = guild.premiumTier >= 2;
  for (const a of actions) {
    if (a.op !== 'createRole' && a.op !== 'updateRole') continue;
    const data = { name: a.role.name, colors: { primaryColor: a.role.color }, permissions: a.role.permissions, hoist: a.role.hoist, mentionable: false, reason, ...(icons && a.role.icon ? { unicodeEmoji: a.role.icon } : {}) };
    const id = a.op === 'createRole' ? (await guild.roles.create(data)).id : (await guild.roles.edit(a.id, data)).id;
    if (a.op === 'createRole') created++;
    byName.set(a.role.name.toLowerCase(), id);
  }
  // new roles were inserted under the bot, which pushed its role up: read its position again
  const botPos = (await guild.roles.fetch(botRole.id, { force: true }))?.position ?? 0;
  await guild.roles.setPositions(rolePositions(roleNames, botPos).map((p) => ({ role: byName.get(p.name.toLowerCase())!, position: p.position })));
  const ids: RoleIds = { everyone: guild.roles.everyone.id, bot: botRole.id, byName };

  const catId = new Map<string, string>();
  for (const a of actions) {
    if (a.op !== 'createCategory' && a.op !== 'updateCategory') continue;
    const data = { name: a.category.name, permissionOverwrites: overwritesFor(a.category.access, 'category', false, ids), position: a.position, reason };
    if (a.op === 'createCategory') {
      catId.set(a.category.name, (await guild.channels.create({ ...data, type: ChannelType.GuildCategory })).id);
      created++;
    } else {
      await guild.channels.edit(a.id, data);
      catId.set(a.category.name, a.id);
    }
  }
  for (const a of actions) {
    if (a.op !== 'createChannel' && a.op !== 'updateChannel') continue;
    const cat = CATEGORIES.find((c) => c.name === a.category)!;
    const ch = a.channel;
    const textLike = ch.kind !== 'voice';
    const data = {
      name: ch.name,
      parent: catId.get(a.category)!,
      permissionOverwrites: overwritesFor(ch.access ?? cat.access, ch.kind, !!ch.readOnly, ids),
      position: a.position,
      reason,
      ...(textLike ? { topic: ch.topic ?? '', rateLimitPerUser: ch.slowmode ?? 0 } : {}),
    };
    if (a.op === 'createChannel') {
      // announcement channels need Community: created as text here, converted by applyDesign (Task 8)
      await guild.channels.create({ ...data, type: textLike ? ChannelType.GuildText : ChannelType.GuildVoice });
      created++;
    } else await guild.channels.edit(a.id, { ...data, lockPermissions: false });
  }
  console.log(`[setup] ${created} created, ${actions.length - created} checked`);
  await applyDesign(guild, { icon: process.argv.includes('--icon'), avatar: process.argv.includes('--avatar'), client });

  const rules = await findText(guild, CAT.info, CH.rules);
  const own = await findOwnMessage(rules, client.user!.id, (m) => m.embeds.some((e) => e.title === RULES_TITLE));
  // attachments: [] drops the previous banner so an edit never stacks images
  const msg = own ? await own.edit({ ...rulesMessage(icon), attachments: [] }) : await rules.send(rulesMessage(icon));
  await msg.react('✅');
  if (!msg.pinned) await msg.pin().catch((e) => console.warn(`[setup] pin rules: ${(e as Error).message}`));

  const rolesCh = await findText(guild, CAT.info, CH.roles);
  await upsert(await findText(guild, CAT.info, CH.welcome), WELCOME_TITLE, welcomeMessage(cfg.siteUrl, { rules: rules.id, roles: rolesCh.id }, icon));
  for (const g of ['lang', 'world'] as PickerGroup[]) await upsert(rolesCh, pickerTitle(g), pickerMessage(g, icon));
  await upsert(await findText(guild, CAT.ro, CH.superliga), pickerTitle('superliga'), pickerMessage('superliga', icon));

  await guild.commands.set(COMMANDS);
  console.log(`[setup] ${COMMANDS.length} slash commands registered`);
}

/** The bot's own message with this embed title is edited, else sent. */
async function upsert(channel: TextChannel, title: string, body: Parameters<TextChannel['send']>[0] & object) {
  const own = await findOwnMessage(channel, client.user!.id, (m) => m.embeds.some((e) => e.title === title));
  if (own) await own.edit(body as Parameters<typeof own.edit>[0]);
  else await channel.send(body);
}
