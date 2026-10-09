// The bot's fixed messages, in the FC Solver brand: rules (banner + RO + EN), welcome, role pickers.
// Built with discord.js builders (no client needed). `icon` = the bot's avatar URL (the FC Solver logo).
import { ActionRowBuilder, AttachmentBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, StringSelectMenuBuilder } from 'discord.js';
import { ASSETS, BRAND, assetPath } from './brand.js';
import { PICKERS, type PickerGroup } from './layout.js';

export const RULES_TITLE = '📜 Regulament';
export const WELCOME_TITLE = '👋 Bine ai venit · Welcome';

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

export function rulesMessage(icon?: string) {
  return {
    files: [bannerFile()],
    embeds: [
      new EmbedBuilder().setColor(BRAND.lime).setImage(`attachment://${ASSETS.banner}`),
      brandEmbed(icon).setTitle(RULES_TITLE).setDescription(RULES_RO),
      brandEmbed(icon).setTitle('📜 Rules').setDescription(RULES_EN),
    ],
  };
}

/** One row with one link button. */
export const linkRow = (label: string, url: string) =>
  new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel(label).setURL(url));

/** `ch`: channel ids to mention (<#id> renders as a clickable channel name). */
export function welcomeMessage(siteUrl: string, ch: { rules: string; roles: string }, icon?: string) {
  const text = [
    '**FC Solver** găsește cel mai ieftin lot din clubul tău pentru orice SBC. Doar citește: nu cumpără, nu vinde și nu trimite nimic la EA.',
    `**1.** Citește <#${ch.rules}> și reacționează cu ✅`,
    `**2.** Alege limba și echipele în <#${ch.roles}>`,
    '**3.** Conectează Discord în Setări pe site pentru /sbc și /stats',
    '',
    "**FC Solver** finds the cheapest squad from your own club for any SBC. Read-only: it never buys, sells or submits anything to EA.",
    `**1.** Read <#${ch.rules}> and react ✅`,
    `**2.** Pick your language and teams in <#${ch.roles}>`,
    '**3.** Connect Discord in the site Settings for /sbc and /stats',
  ].join('\n');
  const e = brandEmbed(icon, BRAND.lime).setTitle(WELCOME_TITLE).setDescription(text);
  if (icon) e.setThumbnail(icon);
  return { embeds: [e], components: [linkRow('FC Solver', siteUrl)] };
}

const PICKER_TEXT: Record<PickerGroup, { title: string; text: string; button: string; placeholder: string }> = {
  lang: {
    title: '🌍 Language · Limbă',
    text: 'Pick **RO**, **EN** or both to see that area.\nAlege **RO**, **EN** sau ambele ca să vezi zona respectivă.',
    button: 'Choose · Alege', placeholder: 'RO / EN',
  },
  world: {
    title: '⚽ Favourite clubs · Echipe favorite',
    text: 'Pick as many as you like.\nAlege oricâte vrei.',
    button: 'Choose · Alege', placeholder: 'Clubs · Echipe',
  },
  superliga: {
    title: '🏟️ Echipe SuperLiga',
    text: 'Alege oricâte echipe din SuperLiga 2026-2027.',
    button: 'Alege', placeholder: 'SuperLiga',
  },
};

export const pickerTitle = (g: PickerGroup) => PICKER_TEXT[g].title;

export function pickerMessage(g: PickerGroup, icon?: string) {
  const p = PICKER_TEXT[g];
  return {
    embeds: [brandEmbed(icon).setTitle(p.title).setDescription(p.text)],
    components: [new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId(`pick:${g}`).setLabel(p.button).setStyle(ButtonStyle.Primary))],
  };
}

/** Ephemeral multi-select, pre-ticked with the member's current roles of the group. */
export function pickerMenu(g: PickerGroup, has: ReadonlySet<string>) {
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

export function groupOf(customId: string, prefix: 'pick' | 'set'): PickerGroup | null {
  const [p, g] = customId.split(':');
  return p === prefix && (g === 'lang' || g === 'world' || g === 'superliga') ? g : null;
}
