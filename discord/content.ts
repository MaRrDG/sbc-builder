// The bot's fixed messages, in the FC Solver brand: rules (banner + one language per channel), welcome, role pickers.
// Built with discord.js builders (no client needed). `icon` = the bot's avatar URL (the FC Solver logo).
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { ASSETS, BRAND, assetPath } from './brand.js';
import { CH, PICKERS, ROLE, type PickerGroup } from './layout.js';

export const RULES_TITLE = '📜 Rules';
export const RULES_TITLE_RO = '📜 Regulament';
export const WELCOME_TITLE = '👋 Welcome';
export const WELCOME_TITLES_OLD = ['👋 Welcome · Bine ai venit', '👋 Bine ai venit · Welcome']; // INFO is English only now: older bilingual messages are edited, not duplicated
export const LANGUAGE_TITLE = '🌐 Language';
export const LANGUAGE_TITLE_OLD = '🌐 Language · Limbă';
export const PICKER_TITLES_OLD: Record<string, string> = { world: '⚽ Favourite clubs · Echipe favorite' };
/** The language picker that used to sit in 🎭・roles (setup deletes its own old message). */
export const LANG_PICKER_TITLES_OLD = ['🌍 Language · Limbă', '🌍 Language'];

/** Every bot embed: "FC Solver" author with the logo, brand colour. */
export function brandEmbed(icon?: string, color: number = BRAND.green): EmbedBuilder {
  const e = new EmbedBuilder().setColor(color);
  if (icon) e.setAuthor({ name: 'FC Solver', iconURL: icon });
  return e;
}

/** The bot's avatar (the FC Solver logo) as an embed icon URL. */
export const avatarUrl = (user: { displayAvatarURL(o: { extension: 'png'; size: number }): string }) => user.displayAvatarURL({ extension: 'png', size: 256 });

export const bannerFile = () => new AttachmentBuilder(assetPath(ASSETS.banner), { name: ASSETS.banner });

const numbered = (lines: string[]) => lines.map((l, i) => `**${i + 1}.** ${l}`).join('\n');

const RULES_RO = [
  numbered([
    'Fii respectuos cu toată lumea.',
    'Fără ură, hărțuire, discriminare sau conținut NSFW.',
    'Fără spam, reclame sau autopromovare.',
    'Fără vânzare, cumpărare sau schimb de conturi, monede sau carduri.',
    'Fără cheaturi, exploit-uri sau discuții despre automatizare: EA dă ban pentru ele, iar FC Solver nu automatizează niciodată jocul.',
    'Scrie în canalul potrivit.',
    'Română în zona RO, engleză în zona EN.',
    'Deciziile staff-ului sunt finale; contestațiile prin mesaj privat unui Admin.',
  ]),
  '',
  '✅ **Reacționează cu ✅ ca să accepți și să deblochezi serverul.**',
].join('\n');

const RULES_EN = [
  numbered([
    'Be respectful to everyone.',
    'No hate, harassment, discrimination or NSFW content.',
    'No spam, ads or self-promotion.',
    'No selling, buying or trading accounts, coins or cards.',
    'No cheats, exploits or automation talk: EA bans for them, and FC Solver never automates the game.',
    'Post in the right channel.',
    'English in the EN area, Romanian in the RO area.',
    'Staff decisions are final; appeals by direct message to an Admin.',
  ]),
  '',
  '✅ **React ✅ to accept and unlock the server.**',
].join('\n');

const bannerEmbed = () => new EmbedBuilder().setColor(BRAND.lime).setImage(`attachment://${ASSETS.banner}`);

/** Banner + the rules in one language: English in `📜・rules`, Romanian in `📜・regulament`. */
export function rulesMessage(lang: 'en' | 'ro', icon?: string) {
  const en = lang === 'en';
  return {
    files: [bannerFile()],
    embeds: [bannerEmbed(), brandEmbed(icon).setTitle(en ? RULES_TITLE : RULES_TITLE_RO).setDescription(en ? RULES_EN : RULES_RO)],
  };
}

/** One row with one link button. */
export const linkRow = (label: string, url: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url));

/** `ch`: channel ids to mention (<#id> renders as a clickable channel name). */
export function welcomeMessage(siteUrl: string, ch: { language: string; rules: string; rulesRo: string; roles: string }, icon?: string) {
  const text = [
    "**FC Solver** finds the cheapest squad from your own club for any SBC. Read-only: it never buys, sells or submits anything to EA.",
    `**1.** Pick your language in <#${ch.language}>`,
    `**2.** Read the rules (<#${ch.rules}> in English, <#${ch.rulesRo}> in Romanian) and react ✅`,
    `**3.** Pick your teams in <#${ch.roles}> and change your language with /language`,
    '**4.** Connect Discord in Linked accounts on the site for /sbc and /stats (use them in 🤖・commands)',
  ].join('\n');
  const e = brandEmbed(icon, BRAND.lime).setTitle(WELCOME_TITLE).setDescription(text);
  if (icon) e.setThumbnail(icon);
  return { embeds: [e], components: [linkRow('FC Solver', siteUrl)] };
}

/** Posted in the welcome channel when someone joins: one English line with the member count; only that user can be mentioned. */
export function memberWelcomeMessage(userId: string, count: number, icon?: string) {
  const text = `👋 Welcome <@${userId}>! You are member **#${count}**.`;
  return { embeds: [brandEmbed(icon, BRAND.lime).setDescription(text)], allowedMentions: { parse: [] as [], users: [userId] } };
}

export const LANGUAGE_BUTTONS = [
  { id: `lang:${ROLE.en}`, label: 'English' },
  { id: `lang:${ROLE.ro}`, label: 'Română' },
];

/** The first thing a new joiner sees: English text, one button per language. */
export function languageMessage(rules: { en: string; ro: string }, icon?: string) {
  const text = [
    `Choose your language (you can pick both), then read the rules (${rules.en} in English, ${rules.ro} in Romanian) and react ✅ to unlock the server.`,
  ].join('\n');
  return {
    embeds: [brandEmbed(icon).setTitle(LANGUAGE_TITLE).setDescription(text)],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(LANGUAGE_BUTTONS.map((b) => new ButtonBuilder().setCustomId(b.id).setLabel(b.label).setStyle(ButtonStyle.Primary)))],
  };
}

/** Groups with a picker message in 🎭・roles / the SuperLiga channel; languages are changed with /language. */
export type MessageGroup = Exclude<PickerGroup, 'lang'>;

const PICKER_TEXT: Record<MessageGroup, { title: string; text: string; button: string; placeholder: string }> = {
  world: {
    title: '⚽ Favourite clubs',
    text: 'Pick as many as you like.',
    button: 'Choose', placeholder: 'Clubs',
  },
  superliga: {
    title: '🏟️ Echipe SuperLiga',
    text: 'Alege oricâte echipe din SuperLiga 2026-2027.',
    button: 'Alege', placeholder: 'SuperLiga',
  },
};

export const pickerTitle = (g: MessageGroup) => PICKER_TEXT[g].title;

export function pickerMessage(g: MessageGroup, icon?: string) {
  const p = PICKER_TEXT[g];
  return {
    embeds: [brandEmbed(icon).setTitle(p.title).setDescription(p.text)],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`pick:${g}`).setLabel(p.button).setStyle(ButtonStyle.Primary))],
  };
}

/** Ephemeral multi-select, pre-ticked with the member's current roles of the group. */
export function pickerMenu(g: MessageGroup, has: ReadonlySet<string>) {
  const names = PICKERS[g];
  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`set:${g}`)
      .setPlaceholder(PICKER_TEXT[g].placeholder)
      .setMinValues(0)
      .setMaxValues(names.length)
      .addOptions(names.map((name) => ({ label: name, value: name, default: has.has(name) }))),
  );
}

export function groupOf(customId: string, prefix: 'pick' | 'set'): MessageGroup | null {
  const [p, g] = customId.split(':');
  return p === prefix && (g === 'world' || g === 'superliga') ? g : null;
}

export const BOOST_TITLE = '💎 Boost = FC Solver Premium';

export function boostPerksMessage(siteUrl: string, icon?: string) {
  const accounts = `${siteUrl}/dashboard/accounts`;
  const text = [
    '**Boost the server = FC Solver Premium while you boost**, plus 12 h after the boost ends.',
    `Connect Discord in Linked accounts on the site (${accounts}); Premium starts within minutes. Paid or code Premium days are not used up.`,
  ].join('\n');
  return { embeds: [brandEmbed(icon, BRAND.boost).setTitle(BOOST_TITLE).setDescription(text)], components: [linkRow('Linked accounts', accounts)] };
}

/** Public thank-you in the welcome channel (English); pings only the booster. */
export function boostThanks(userId: string, linked: boolean, siteUrl: string, icon?: string) {
  const accounts = `${siteUrl}/dashboard/accounts`;
  const text = linked
    ? `Thanks <@${userId}>! FC Solver Premium is active while you boost.`
    : `Thanks <@${userId}>! Connect Discord in Linked accounts to get Premium: ${accounts}`;
  return { content: `<@${userId}>`, embeds: [brandEmbed(icon, BRAND.boost).setTitle('💎 Boost').setDescription(text)], allowedMentions: { users: [userId] } };
}
