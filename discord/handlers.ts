// /sbc and /stats: answers are posted publicly in the channel, errors stay ephemeral. Autocomplete for /sbc.
// Read-only: the API solves from FC Solver's cache; nothing here reaches EA.
import { MessageFlags, type AutocompleteInteraction, type ChatInputCommandInteraction } from 'discord.js';
import type { BotSolution, BotStats } from '../server/discord/solution.js';
import { BotApiError, botApi } from './api.js';
import type { BotConfig } from './config.js';
import { createCooldown } from './cooldown.js';
import { errorText, solutionMessage, statsMessage } from './embeds.js';
import { categoryOf } from './guild.js';
import { langFor, tr } from './i18n.js';

const sbcCooldown = createCooldown(30_000);

export async function onCommand(i: ChatInputCommandInteraction, cfg: BotConfig): Promise<void> {
  const category = categoryOf(i.channel);
  let lang = langFor({ category, locale: i.locale });
  const icon = i.client.user.displayAvatarURL({ extension: 'png', size: 256 });
  if (i.commandName === 'sbc') {
    const wait = sbcCooldown(i.user.id);
    if (wait) {
      await i.reply({ content: tr(lang, 'cooldown', { s: Math.ceil(wait / 1000) }), flags: MessageFlags.Ephemeral });
      return;
    }
  }
  // ephemeral placeholder: errors stay private, the answer goes to the channel with channel.send
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  try {
    const ch = i.channel;
    // checked before solving, so a channel the bot can't write in never costs a solve
    if (!ch?.isSendable() || !i.appPermissions?.has(['SendMessages', 'EmbedLinks'])) throw new BotApiError('cannot post here', 403, 'cannotPost');
    if (i.commandName === 'sbc') {
      const body = { discordId: i.user.id, setId: i.options.getInteger('set', true), challengeId: i.options.getInteger('challenge') ?? undefined };
      const s = await botApi<BotSolution>(cfg, '/api/bot/solve', { method: 'POST', body, timeoutMs: 60_000 });
      lang = langFor({ category, siteLang: s.lang, locale: i.locale });
      await ch.send(solutionMessage(s, lang, i.user.id, cfg.siteUrl, icon));
    } else {
      const s = await botApi<BotStats>(cfg, `/api/bot/stats?discordId=${i.user.id}`, { timeoutMs: 10_000 });
      lang = langFor({ category, siteLang: s.lang, locale: i.locale });
      await ch.send(statsMessage(s, lang, i.user.id, icon));
    }
    await i.deleteReply();
  } catch (e) {
    if (!(e instanceof BotApiError)) console.warn(`[bot] /${i.commandName}: ${(e as Error).message}`);
    await i.editReply({ content: errorText(e, lang, cfg.siteUrl) }).catch(() => {});
  }
}

/** Discord waits 3 s for choices: short timeout, and an empty list on any error (unlinked users too). */
export async function onAutocomplete(i: AutocompleteInteraction, cfg: BotConfig): Promise<void> {
  const f = i.options.getFocused(true);
  try {
    if (f.name === 'set') {
      const r = await botApi<{ sets: { setId: number; name: string }[] }>(cfg, `/api/bot/sets?discordId=${i.user.id}&q=${encodeURIComponent(String(f.value))}`, { timeoutMs: 2_500 });
      await i.respond(r.sets.map((s) => ({ name: s.name, value: s.setId })));
      return;
    }
    const setId = i.options.getInteger('set');
    if (!setId) {
      await i.respond([]);
      return;
    }
    const r = await botApi<{ challenges: { challengeId: number; name: string }[] }>(cfg, `/api/bot/challenges?discordId=${i.user.id}&setId=${setId}`, { timeoutMs: 2_500 });
    await i.respond(r.challenges.map((c) => ({ name: c.name, value: c.challengeId })));
  } catch {
    await i.respond([]).catch(() => {});
  }
}
