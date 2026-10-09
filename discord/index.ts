// FC Solver Discord bot: language buttons → Pending role, ✅ on the rules → Member + language, join welcome, role pickers; Daily posts (Task 10) and slash commands (Task 18).
// Never calls EA. Talks to the FC Solver API only through /api/bot/* (discord/api.ts).
import { Client, Events, GatewayIntentBits, MessageFlags, Partials, type ButtonInteraction, type Guild, type GuildMember } from 'discord.js';
import { loadConfig, loadEnvFile } from './config.js';
import { CAT, CH, PICKERS, ROLE } from './layout.js';
import { RULES_TITLE, RULES_TITLE_RO, avatarUrl, boostThanks, groupOf, memberWelcomeMessage, pickerMenu } from './content.js';
import { acceptRules, isMember, langOf, languageClick, roleDiff, withdrawRules } from './roles.js';
import { langFor, tr, type Lang } from './i18n.js';
import { categoryOf, findOwnMessage, findText } from './guild.js';
import { BotApiError, botApi } from './api.js';
import { alreadyAnnounced, dailyPost } from './daily.js';
import { onAutocomplete, onCommand } from './handlers.js';
import { onPoll, postFinishedPolls } from './polls.js';

loadEnvFile();
const cfg = loadConfig();
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMembers],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.User],
});
const rulesIds = new Set<string>(); // the English and the Romanian rules message

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

let announced = 0; // last day posted (or found posted) by this process

async function announceDaily(guild: Guild): Promise<void> {
  try {
    const d = await botApi<{ day: number; live: boolean }>(cfg, '/api/bot/daily', { timeoutMs: 10_000 });
    if (!d.live || d.day <= announced) return;
    const ch = await findText(guild, CAT.info, CH.daily);
    const recent = await ch.messages.fetch({ limit: 20 });
    const seen = [...recent.values()].map((m) => ({ authorId: m.author.id, content: m.content }));
    if (!alreadyAnnounced(seen, d.day, client.user!.id)) await ch.send(dailyPost(d.day, cfg.siteUrl, avatarUrl(client.user!)));
    announced = d.day;
  } catch (e) {
    console.warn(`[bot] daily: ${(e as Error).message}`);
  }
}

type BoostAnswer = { changed: boolean; linked: boolean; active: boolean };

/** Full booster list to the app (heals missed events and links made after boosting). Only after a complete member fetch, else it could look like mass un-boosting. */
async function reconcileBoosts(guild: Guild): Promise<void> {
  try {
    const members = await guild.members.fetch(); // needs the Server Members intent
    if (members.size < guild.memberCount) return void console.warn(`[bot] boost reconcile skipped: partial member list (${members.size}/${guild.memberCount})`);
    const boosters = [...members.values()].flatMap((m) => (m.premiumSinceTimestamp ? [{ discordId: m.id, since: m.premiumSinceTimestamp }] : []));
    const r = await botApi<{ started: number; stopped: number }>(cfg, '/api/bot/boosts', { method: 'POST', body: { boosters, complete: true } });
    if (r.started || r.stopped) console.log(`[bot] boosts: ${r.started} started, ${r.stopped} stopped`);
  } catch (e) {
    if (e instanceof BotApiError && e.code === 'tooManyStops') console.warn('[bot] boost reconcile refused: too many boosts would stop (not forced; check the member list)');
    else console.warn(`[bot] boost reconcile: ${(e as Error).message}`);
  }
}

client.once(Events.ClientReady, async (c) => {
  let guild: Guild | null = null;
  try {
    guild = await c.guilds.fetch(cfg.guildId);
    await guild.roles.fetch();
    for (const [name, title] of [[CH.rules, RULES_TITLE], [CH.rulesRo, RULES_TITLE_RO]] as const) {
      const msg = await findOwnMessage(await findText(guild, CAT.info, name), c.user.id, (m) => m.embeds.some((e) => e.title === title));
      if (msg) rulesIds.add(msg.id);
    }
  } catch (e) {
    console.warn(`[bot] startup lookup failed: ${(e as Error).message}`);
  }
  if (rulesIds.size < 2) console.warn('[bot] rules message missing: run npm run discord:setup');
  console.log(`[bot] ready as ${c.user.tag}`);
  if (guild) {
    const g = guild;
    void announceDaily(g);
    setInterval(() => void announceDaily(g), 60_000);
    void postFinishedPolls(g, c.user.id, avatarUrl(c.user));
    setInterval(() => void postFinishedPolls(g, c.user.id, avatarUrl(c.user)), 60_000);
    void reconcileBoosts(g);
    setInterval(() => void reconcileBoosts(g), 15 * 60_000);
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot || !rulesIds.has(reaction.message.id) || reaction.emoji.name !== '✅') return;
  try {
    const m = await memberOf(reaction.message.guildId, user.id);
    // no language picked (or none held) = nothing happens; the rules channel is only visible with a Pending / real language role
    const a = m && acceptRules(m.roles.cache.map((r) => r.name));
    if (!m || !a) return;
    if (a.add.length) await m.roles.add(roleIds(m.guild, a.add), 'accepted the rules');
    if (a.remove.length) await m.roles.remove(roleIds(m.guild, a.remove), 'accepted the rules');
  } catch (e) {
    console.warn(`[bot] rules accept: ${(e as Error).message}`);
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (user.bot || !rulesIds.has(reaction.message.id) || reaction.emoji.name !== '✅') return;
  try {
    const m = await memberOf(reaction.message.guildId, user.id);
    // RO / EN go too: Discord ORs roles, so the language areas must not outlive Member
    if (m) await m.roles.remove(roleIds(m.guild, withdrawRules()), 'withdrew the rules');
  } catch (e) {
    console.warn(`[bot] rules withdraw: ${(e as Error).message}`);
  }
});

client.on(Events.InteractionCreate, async (i) => {
  if (i.guildId !== cfg.guildId) return;
  const lang = langFor({ category: categoryOf(i.channel), locale: i.locale });
  try {
    if (i.isAutocomplete()) return void (await onAutocomplete(i, cfg));
    if (i.isChatInputCommand()) return void (await (i.commandName === 'poll' ? onPoll(i) : onCommand(i, cfg)));
    if (i.isButton()) {
      const lg = langOf(i.customId);
      if (lg) return void (await onLanguage(i, lg));
      if (i.customId === 'pick:lang') return void (await i.reply({ content: tr(lang, 'roles.langMoved', { language: CH.language }), flags: MessageFlags.Ephemeral }));
      const g = groupOf(i.customId, 'pick');
      const m = g && (await memberOf(i.guildId, i.user.id));
      if (!g || !m) return;
      if (!isMember(m.roles.cache.map((r) => r.name))) return void (await i.reply({ content: tr(lang, 'roles.needMember', { rules: lang === 'ro' ? CH.rulesRo : CH.rules }), flags: MessageFlags.Ephemeral }));
      await i.reply({ content: tr(lang, 'roles.pick'), components: [pickerMenu(g, new Set(m.roles.cache.map((r) => r.name)))], flags: MessageFlags.Ephemeral });
      return;
    }
    if (i.isStringSelectMenu()) {
      const g = groupOf(i.customId, 'set');
      const m = g && (await memberOf(i.guildId, i.user.id));
      if (!g || !m) return;
      // real language roles only ever go with Member (Discord ORs roles: EN / RO alone would open the area without the rules)
      if (!isMember(m.roles.cache.map((r) => r.name))) return void (await i.reply({ content: tr(lang, 'roles.needMember', { rules: lang === 'ro' ? CH.rulesRo : CH.rules }), flags: MessageFlags.Ephemeral }));
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

/** Language button in the language channel: Pending role for a new joiner, the real role for a Member. Answers in the language pressed. */
async function onLanguage(i: ButtonInteraction, picked: string) {
  const lang: Lang = picked === ROLE.ro ? 'ro' : 'en';
  const m = await memberOf(i.guildId, i.user.id);
  if (!m) return;
  const d = languageClick(m.roles.cache.map((r) => r.name), picked);
  if (d.add.length) await m.roles.add(roleIds(m.guild, d.add), 'language picked');
  if (d.remove.length) await m.roles.remove(roleIds(m.guild, d.remove), 'language picked');
  const list = d.now.join(', ');
  const content = !d.now.length ? tr(lang, 'lang.none') : d.member ? tr(lang, 'lang.saved', { list }) : tr(lang, 'lang.pending', { list, rules: `<#${(await findText(m.guild, CAT.info, lang === 'ro' ? CH.rulesRo : CH.rules)).id}>` });
  await i.reply({ content, flags: MessageFlags.Ephemeral });
}

// A boost started or stopped: tell the app; thank only a boost we saw start (an uncached "before" is left to the reconcile, so no repeats)
client.on(Events.GuildMemberUpdate, async (before, after) => {
  if (after.guild.id !== cfg.guildId) return;
  const was = before.partial ? undefined : before.premiumSinceTimestamp; // undefined: not cached, unknown
  const now = after.premiumSinceTimestamp;
  if (was !== undefined && was === now) return; // a nickname / role change, not a boost change
  try {
    const r = await botApi<BoostAnswer>(cfg, '/api/bot/boost', { method: 'POST', body: { discordId: after.id, since: now ?? null } });
    if (!now || was !== null) return;
    const msg = boostThanks(after.id, r.linked && r.active, cfg.siteUrl, avatarUrl(client.user!));
    await (await findText(after.guild, CAT.info, CH.welcome)).send(msg);
    if (!r.linked) await after.send({ embeds: msg.embeds }).catch(() => {}); // DMs may be closed
  } catch (e) {
    console.warn(`[bot] boost update: ${(e as Error).message}`);
  }
});

// Welcome post for every new member (English); a failure is logged and never stops the bot
client.on(Events.GuildMemberAdd, async (member) => {
  if (member.guild.id !== cfg.guildId || member.user.bot) return;
  try {
    const ch = await findText(member.guild, CAT.info, CH.welcome);
    await ch.send(memberWelcomeMessage(member.id, member.guild.memberCount, avatarUrl(client.user!)));
  } catch (e) {
    console.warn(`[bot] member welcome: ${(e as Error).message}`);
  }
});

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, () => {
    void client.destroy().then(() => process.exit(0));
  });
}

await client.login(cfg.token);
