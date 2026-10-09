// The ⚽・daily post. Discord itself is the state: the bot looks for its own post of that day before posting.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ASSETS, BRAND } from './brand.js';
import { bannerFile, brandEmbed } from './content.js';

const dailyUrl = (siteUrl: string) => `${siteUrl.replace(/\/+$/, '')}/daily`;

export function dailyMessage(day: number, siteUrl: string): string {
  const url = dailyUrl(siteUrl);
  return `**Daily #${day} is live**: guess today's player → ${url}\n**Daily #${day} a început**: ghicește jucătorul zilei → ${url}`;
}

/** Content line (what alreadyAnnounced reads) + brand embed with the banner art + a button. No answer, no pings. */
export function dailyPost(day: number, siteUrl: string, icon?: string) {
  const url = dailyUrl(siteUrl);
  const e = brandEmbed(icon, BRAND.lime)
    .setTitle(`Daily #${day}`)
    .setURL(url)
    .setDescription("Guess today's player in 5 tries. · Ghicește jucătorul zilei din 5 încercări.")
    .setImage(`attachment://${ASSETS.banner}`);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel('Play · Joacă'));
  return { content: dailyMessage(day, siteUrl), embeds: [e], components: [row], files: [bannerFile()], allowedMentions: { parse: [] as [] } };
}

export function alreadyAnnounced(messages: { authorId: string; content: string }[], day: number, botId: string): boolean {
  const re = new RegExp(`Daily #${day}(?!\\d)`);
  return messages.some((m) => m.authorId === botId && re.test(m.content));
}
