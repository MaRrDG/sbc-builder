// FC Solver Discord bot: ✅ on the rules → Member, role pickers; Daily posts (Task 10) and slash commands (Task 18).
// Never calls EA. Talks to the FC Solver API only through /api/bot/* (discord/api.ts).
import { Client, Events, GatewayIntentBits, MessageFlags, Partials, type Guild, type GuildMember } from 'discord.js';
import { loadConfig, loadEnvFile } from './config.js';
import { CAT, CH, PICKERS, ROLE } from './layout.js';
import { RULES_TITLE, groupOf, pickerMenu } from './content.js';
import { roleDiff } from './roles.js';
import { langFor, tr } from './i18n.js';
import { categoryOf, findOwnMessage, findText } from './guild.js';

loadEnvFile();
const cfg = loadConfig();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});
let rulesId: string | null = null;

const roleIds = (guild: Guild, names: string[]) =>
  names.flatMap((n) => {
    const r = guild.roles.cache.find((x) => x.name.toLowerCase() === n.toLowerCase());
    return r ? [r.id] : [];
  });

async function memberOf(guildId: string | null, userId: string): Promise<GuildMember | null> {
  if (guildId !== cfg.guildId) return null;
  const guild = await client.guilds.fetch(cfg.guildId);
  return guild.members.fetch(userId).catch(() => null);
}

client.once(Events.ClientReady, async (c) => {
  try {
    const guild = await c.guilds.fetch(cfg.guildId);
    await guild.roles.fetch();
    const rules = await findText(guild, CAT.info, CH.rules);
    rulesId = (await findOwnMessage(rules, c.user.id, (m) => m.embeds.some((e) => e.title === RULES_TITLE)))?.id ?? null;
  } catch (e) {
    console.warn(`[bot] startup lookup failed: ${(e as Error).message}`);
  }
  if (!rulesId) console.warn('[bot] no rules message: run npm run discord:setup');
  console.log(`[bot] ready as ${c.user.tag}`);
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot || reaction.message.id !== rulesId || reaction.emoji.name !== '✅') return;
  try {
    const m = await memberOf(reaction.message.guildId, user.id);
    if (m) await m.roles.add(roleIds(m.guild, [ROLE.member]), 'accepted the rules');
  } catch (e) {
    console.warn(`[bot] rules accept: ${(e as Error).message}`);
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot || reaction.message.id !== rulesId || reaction.emoji.name !== '✅') return;
  try {
    const m = await memberOf(reaction.message.guildId, user.id);
    // RO / EN go too: Discord ORs roles, so the language areas must not outlive Member
    if (m) await m.roles.remove(roleIds(m.guild, [ROLE.member, ...PICKERS.lang]), 'withdrew the rules');
  } catch (e) {
    console.warn(`[bot] rules withdraw: ${(e as Error).message}`);
  }
});

client.on(Events.InteractionCreate, async (i) => {
  if (i.guildId !== cfg.guildId) return;
  const lang = langFor({ category: categoryOf(i.channel), locale: i.locale });
  try {
    if (i.isButton()) {
      const g = groupOf(i.customId, 'pick');
      const m = g && (await memberOf(i.guildId, i.user.id));
      if (!g || !m) return;
      await i.reply({ content: tr(lang, 'roles.pick'), components: [pickerMenu(g, new Set(m.roles.cache.map((r) => r.name)))], flags: MessageFlags.Ephemeral });
      return;
    }
    if (i.isStringSelectMenu()) {
      const g = groupOf(i.customId, 'set');
      const m = g && (await memberOf(i.guildId, i.user.id));
      if (!g || !m) return;
      const d = roleDiff(PICKERS[g], m.roles.cache.map((r) => r.name), i.values);
      if (d.add.length) await m.roles.add(roleIds(m.guild, d.add), 'role picker');
      if (d.remove.length) await m.roles.remove(roleIds(m.guild, d.remove), 'role picker');
      const now = PICKERS[g].filter((n) => i.values.includes(n));
      await i.update({ content: now.length ? tr(lang, 'roles.saved', { list: now.join(', ') }) : tr(lang, 'roles.none'), components: [] });
      return;
    }
  } catch (e) {
    console.warn(`[bot] interaction ${i.id}: ${(e as Error).message}`);
    if (i.isRepliable() && !i.replied && !i.deferred) await i.reply({ content: tr(lang, 'roles.failed'), flags: MessageFlags.Ephemeral }).catch(() => {});
  }
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    void client.destroy().then(() => process.exit(0));
  });
}

await client.login(cfg.token);
