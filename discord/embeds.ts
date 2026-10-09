// What the bot posts for /sbc and /stats, and how it words errors. Pure (builders only, no client).
// Discord limits kept: title 256, description 4096, field value 1024, footer 2048, whole embed 6000.
import type { BotReason, BotSolution, BotStats } from '../server/discord/solution.js';
import { BotApiError } from './api.js';
import { BRAND } from './brand.js';
import { brandEmbed, linkRow } from './content.js';
import { tr, type Lang } from './i18n.js';
import { clip } from './text.js';

const NO_PINGS = { parse: [] as [] };
const NAME_MAX = 30; // longest player name shown (code-block lines stay short)
const CARDS_MAX = 20;

const safe = (s: string) => clip(s.replaceAll('`', "'"), NAME_MAX); // inside a code block
const pips = (n: number) => {
  const c = Math.max(0, Math.min(3, n));
  return '●'.repeat(c) + '○'.repeat(3 - c);
};

export function reasonText(r: BotReason, lang: Lang): string {
  const p = { req: r.req ?? '', have: r.have ?? 0, need: r.need ?? 0 };
  switch (r.code) {
    case 'text': return r.req ?? '';
    case 'pool': return tr(lang, 'reason.pool', { ...p, need: r.need ?? 11 });
    case 'count': return tr(lang, 'reason.count', p);
    case 'sameGroup': return tr(lang, 'reason.sameGroup', p);
    case 'distinct': return tr(lang, 'reason.distinct', p);
    case 'rating': return tr(lang, 'reason.rating', { ...p, need: r.need ?? 11 });
    case 'points': return tr(lang, 'reason.points', p);
    default: return tr(lang, 'reason.combo');
  }
}

export function solutionMessage(s: BotSolution, lang: Lang, userId: string, siteUrl: string, icon?: string) {
  const link = `${siteUrl}/dashboard/sbc/${s.setId}/${s.challengeId}`;
  const user = `<@${userId}>`;
  const e = brandEmbed(icon, s.found ? BRAND.lime : BRAND.red).setTitle(clip(`${s.set} — ${s.challenge}`, 256)).setURL(link);
  if (!s.found) {
    e.setDescription([tr(lang, 'sbc.notFound', { user }), ...s.reasons.map((r) => `• ${clip(reasonText(r, lang), 300)}`)].join('\n'));
  } else if (s.points) {
    const shown = s.points.cards.slice(0, CARDS_MAX).map((c) => `${String(c.rating).padStart(2)}  ${safe(c.name)} · ${c.points} ${tr(lang, 'sbc.pts')}`);
    const more = s.points.cards.length > CARDS_MAX ? `\n${tr(lang, 'sbc.more', { n: s.points.cards.length - CARDS_MAX })}` : '';
    e.setDescription(`${tr(lang, 'sbc.intro', { user })}\n\`\`\`\n${shown.join('\n')}\n\`\`\`${more}`)
      .addFields({ name: tr(lang, 'sbc.points'), value: `${s.points.total}/${s.points.target}`, inline: true });
  } else {
    const lines = s.slots.map((x) =>
      x.brick ? `${x.pos.padEnd(4)} ${tr(lang, 'sbc.locked')}` : `${x.pos.padEnd(4)} ${String(x.rating).padStart(2)}  ${pips(x.chem)}  ${safe(x.name)}${x.storage ? ' (S)' : ''}`,
    );
    const legend = s.slots.some((x) => x.storage) ? `\n${tr(lang, 'sbc.storage')}` : '';
    e.setDescription(`${tr(lang, 'sbc.intro', { user })}\n\`\`\`\n${lines.join('\n')}\n\`\`\`${legend}`)
      .addFields({ name: tr(lang, 'sbc.rating'), value: String(s.rating), inline: true }, { name: tr(lang, 'sbc.chem'), value: String(s.chemistry), inline: true });
  }
  const footer = [s.quota ? tr(lang, 'sbc.quota', { used: s.quota.used, limit: s.quota.limit }) : null, tr(lang, 'sbc.defaults')].filter(Boolean).join(' · ');
  e.setFooter({ text: footer });
  return { content: `${user} · /sbc`, embeds: [e], components: [linkRow(tr(lang, 'sbc.open'), link)], allowedMentions: NO_PINGS };
}

export function statsMessage(s: BotStats, lang: Lang, userId: string, icon?: string) {
  const user = `<@${userId}>`;
  const e = brandEmbed(icon)
    .setDescription(tr(lang, 'stats.title', { user }))
    .addFields(
      { name: tr(lang, 'stats.sbcs'), value: String(s.sbcs), inline: true },
      { name: tr(lang, 'stats.challenges'), value: String(s.challenges), inline: true },
      { name: tr(lang, 'stats.objectives'), value: String(s.objectives), inline: true },
      { name: tr(lang, 'stats.club'), value: String(s.club), inline: true },
      { name: tr(lang, 'stats.streak'), value: String(s.streak), inline: true },
    )
    .setFooter({ text: s.since ? tr(lang, 'stats.since', { date: new Date(s.since).toISOString().slice(0, 10) }) : tr(lang, 'stats.noHistory') });
  return { content: `${user} · /stats`, embeds: [e], allowedMentions: NO_PINGS };
}

export function errorText(e: unknown, lang: Lang, siteUrl: string): string {
  const settings = `${siteUrl}/dashboard/settings`;
  if (!(e instanceof BotApiError)) return tr(lang, 'err.generic');
  switch (e.code) {
    case 'discordNotLinked': return tr(lang, 'err.link', { url: settings });
    case 'noPersona': return tr(lang, 'err.noPersona', { url: settings });
    case 'quotaExhausted': {
      const at = Number(e.params.resetsAt) || 0;
      return tr(lang, 'err.quota', { limit: e.params.limit ?? '', when: at ? `<t:${Math.floor(at / 1000)}:R>` : '—', url: settings });
    }
    case 'botRateLimited': return tr(lang, 'err.slow');
    case 'setNotAvailable': return tr(lang, 'err.notAvailable');
    case 'badRequest': return tr(lang, 'err.badRequest');
    case 'challengeNotFound': return tr(lang, 'err.challenge');
    case 'clubEmpty': return tr(lang, 'err.clubEmpty');
    case 'needsLayout': return tr(lang, 'err.needsLayout');
    case 'pointsDone': return tr(lang, 'err.pointsDone');
    case 'cannotPost': return tr(lang, 'err.cannotPost');
    default: return tr(lang, 'err.generic');
  }
}
