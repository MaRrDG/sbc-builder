// The 📝・changelog posts (English): one per entry of shared/changelog.ts, served by /api/bot/changelog.
// Discord itself is the state: the bot looks for its own post of an entry before posting it.
import { brandEmbed, linkRow } from './content.js';

export interface BotEntry { id: string; date: string; items: string[] }
type Seen = { authorId: string; content: string }[];

const changelogUrl = (siteUrl: string) => `${siteUrl.replace(/\/+$/, '')}/changelog`;

/** The content line every post starts with: what alreadyPosted reads. */
export const changelogMessage = (id: string) => `Changelog ${id}`;

const dateLabel = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Content line + brand embed (v1, the date, the items as bullets) + a button to the page. No pings. */
export function changelogPost(e: BotEntry, siteUrl: string, icon?: string) {
  const url = changelogUrl(siteUrl);
  let text = e.items.map((s) => `• ${s}`).join('\n');
  if (text.length > 4000) text = `${text.slice(0, 3999)}…`; // embed descriptions stop at 4096
  const embed = brandEmbed(icon).setTitle(`FC Solver v1 · ${dateLabel(e.date)}`).setURL(url).setDescription(text);
  return { content: changelogMessage(e.id), embeds: [embed], components: [linkRow('Read the changelog', url)], allowedMentions: { parse: [] as [] } };
}

export const alreadyPosted = (messages: Seen, id: string, botId: string) =>
  messages.some((m) => m.authorId === botId && m.content.split('\n')[0] === changelogMessage(id));

/** Entries (newest first) missing from the channel, oldest first. A channel the bot never posted in gets only the newest. */
export function toPost(entries: BotEntry[], messages: Seen, botId: string): BotEntry[] {
  if (!messages.some((m) => m.authorId === botId && m.content.startsWith('Changelog '))) return entries.slice(0, 1);
  const out: BotEntry[] = [];
  for (const e of entries) {
    if (alreadyPosted(messages, e.id, botId)) break; // everything older was posted before it
    out.push(e);
  }
  return out.reverse();
}
