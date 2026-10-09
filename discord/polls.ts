// /poll (create a native Discord poll in 📊・polls) and the "poll ended" post. Needs the client; the rules are in poll.ts.
import { MessageFlags, type ChatInputCommandInteraction, type Guild, type Message, type TextChannel } from 'discord.js';
import { categoryOf, findText } from './guild.js';
import { langFor, tr } from './i18n.js';
import { CAT, CH } from './layout.js';
import { canPoll, isOurResult, pollResultMessage, validatePoll } from './poll.js';

export async function onPoll(i: ChatInputCommandInteraction): Promise<void> {
  const lang = langFor({ category: categoryOf(i.channel), locale: i.locale });
  await i.deferReply({ flags: MessageFlags.Ephemeral });
  // roles are read from the guild, not trusted from the command's default permissions
  const member = i.guild ? await i.guild.members.fetch(i.user.id).catch(() => null) : null;
  if (!member || !canPoll(member.roles.cache.map((r) => r.name))) return void (await i.editReply({ content: tr(lang, 'poll.denied') }));
  const v = validatePoll({
    question: i.options.getString('question', true),
    answers: Array.from({ length: 10 }, (_, n) => i.options.getString(`answer${n + 1}`)),
    hours: i.options.getInteger('hours', true),
    multi: i.options.getBoolean('multi'),
  });
  if (!v.ok) return void (await i.editReply({ content: tr(lang, `poll.${v.code}`) }));
  try {
    const channel = await findText(i.guild!, CAT.info, CH.polls);
    const m = await channel.send({
      poll: { question: { text: v.poll.question }, answers: v.poll.answers.map((text) => ({ text })), duration: v.poll.hours, allowMultiselect: v.poll.multi },
      allowedMentions: { parse: [] },
    });
    await i.editReply({ content: tr(lang, 'poll.created', { url: m.url }) });
  } catch (e) {
    console.warn(`[bot] /poll: ${(e as Error).message}`);
    await i.editReply({ content: tr(lang, 'poll.cannotPost', { channel: CH.polls }) }).catch(() => {});
  }
}

const handled = new Set<string>(); // polls answered by this process (the channel itself is the record across restarts)

/** Our result post under the poll (not Discord's own "poll ended" message, which has the same author). */
const isResultOf = (m: Message, pollId: string, botId: string) =>
  isOurResult({ type: m.type, authorId: m.author.id, replyTo: m.reference?.messageId ?? null, embedAuthors: m.embeds.map((e) => e.author?.name ?? null) }, pollId, botId);

/**
 * Posts the result of every poll the bot created that has ended and has no result post yet.
 * Runs on a timer: polls finalise after their end time, and a restart finds the missed ones. Fails soft.
 */
let running = false;
export async function postFinishedPolls(guild: Guild, botId: string, avatar: string): Promise<void> {
  if (running) return;
  running = true;
  try {
    const ch: TextChannel = await findText(guild, CAT.info, CH.polls);
    const recent = [...(await ch.messages.fetch({ limit: 50 })).values()];
    for (const m of recent) {
      const p = m.poll;
      if (!p || m.author.id !== botId || !p.resultsFinalized || handled.has(m.id)) continue;
      if (!recent.some((r) => isResultOf(r, m.id, botId))) {
        handled.add(m.id); // before the send: a failed send is not retried every minute, a restart tries again
        const tallies = [...p.answers.values()].map((a) => ({ text: a.text ?? '', votes: a.voteCount }));
        await ch.send({ ...pollResultMessage(p.question.text ?? '', tallies, avatar), reply: { messageReference: m.id, failIfNotExists: false } });
      }
      handled.add(m.id);
    }
  } catch (e) {
    console.warn(`[bot] poll results: ${(e as Error).message}`);
  } finally {
    running = false;
  }
}
