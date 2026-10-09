// The ⚽・daily post. Discord itself is the state: the bot looks for its own post of that day before posting.
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { ASSETS, BRAND } from './brand.js';
import { bannerFile, brandEmbed, linkRow } from './content.js';

export const dailyUrl = (siteUrl: string) => `${siteUrl.replace(/\/+$/, '')}/daily`;

export function dailyMessage(day: number, siteUrl: string): string {
  const url = dailyUrl(siteUrl);
  return `**Daily #${day} is live**: guess today's player → ${url}`;
}

/** Content line (what alreadyAnnounced reads) + brand embed with the banner art + a button. No answer, no pings. */
export function dailyPost(day: number, siteUrl: string, icon?: string) {
  const url = dailyUrl(siteUrl);
  const e = brandEmbed(icon, BRAND.lime)
    .setTitle(`Daily #${day}`)
    .setURL(url)
    .setDescription("Guess today's player in 5 tries.")
    .setImage(`attachment://${ASSETS.banner}`);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setURL(url).setLabel('Play'));
  return { content: dailyMessage(day, siteUrl), embeds: [e], components: [row], files: [bannerFile()], allowedMentions: { parse: [] as [] } };
}

/** /daily and /wordle: short ephemeral card with the day number when known, and a button to the game. */
export function dailyInfoMessage(siteUrl: string, day?: number, icon?: string) {
  const url = dailyUrl(siteUrl);
  const e = brandEmbed(icon, BRAND.lime).setTitle("FC Solver Daily — guess today's EA FC player").setURL(url);
  e.setDescription(day ? `Daily #${day} is live. Guess today's player in 5 tries.` : "Guess today's player in 5 tries.");
  return { embeds: [e], components: [linkRow('Play the Daily', url)] };
}

export function alreadyAnnounced(messages: { authorId: string; content: string }[], day: number, botId: string): boolean {
  const re = new RegExp(`Daily #${day}(?!\\d)`);
  return messages.some((m) => m.authorId === botId && re.test(m.content));
}
