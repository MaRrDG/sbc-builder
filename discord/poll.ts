// /poll rules and the "poll ended" post. Pure (no client): validation, who may create, winner calculation, the result embed.
import { MessageType } from 'discord.js';
import { brandEmbed } from './content.js';
import { tr, type Lang } from './i18n.js';
import { ROLE } from './layout.js';
import { clip } from './text.js';

export const POLL_QUESTION_MAX = 300;
export const POLL_ANSWER_MAX = 55;
export const POLL_ANSWERS_MAX = 10;
export const POLL_HOURS_MAX = 768;

export interface PollInput { question: string; answers: (string | null)[]; hours: number; multi: boolean | null }
export interface PollSpec { question: string; answers: string[]; hours: number; multi: boolean }
export type PollError = 'question' | 'answers' | 'duplicate' | 'answerLong' | 'hours';

/** Trim everything; blank optional answers are skipped (answer1 / answer2 blank → error); answers are compared case-insensitively. */
export function validatePoll(i: PollInput): { ok: true; poll: PollSpec } | { ok: false; code: PollError } {
  const question = i.question.trim();
  if (!question || [...question].length > POLL_QUESTION_MAX) return { ok: false, code: 'question' };
  if (!Number.isInteger(i.hours) || i.hours < 1 || i.hours > POLL_HOURS_MAX) return { ok: false, code: 'hours' };
  const trimmed = i.answers.map((a) => (a ?? '').trim());
  if (!trimmed[0] || !trimmed[1]) return { ok: false, code: 'answers' };
  const answers = trimmed.filter(Boolean);
  if (answers.length < 2 || answers.length > POLL_ANSWERS_MAX) return { ok: false, code: 'answers' };
  if (answers.some((a) => [...a].length > POLL_ANSWER_MAX)) return { ok: false, code: 'answerLong' };
  if (new Set(answers.map((a) => a.toLowerCase())).size !== answers.length) return { ok: false, code: 'duplicate' };
  return { ok: true, poll: { question, answers, hours: i.hours, multi: i.multi ?? false } };
}

/** Only Admin and Moderator create polls. */
export const canPoll = (roleNames: string[]): boolean => roleNames.some((n) => n === ROLE.admin || n === ROLE.mod);

export interface Tally { text: string; votes: number }

/** Highest vote count wins; equal highest counts are a tie; nobody voted = no winner. */
export function pollResult(answers: Tally[]): { winners: string[]; top: number; total: number; tie: boolean } {
  const top = Math.max(0, ...answers.map((a) => a.votes));
  const total = answers.reduce((n, a) => n + a.votes, 0);
  const winners = top > 0 ? answers.filter((a) => a.votes === top).map((a) => a.text) : [];
  return { winners, top, total, tie: winners.length > 1 };
}

function line(lang: Lang, r: ReturnType<typeof pollResult>): string {
  if (!r.winners.length) return tr(lang, 'poll.noVotes');
  const answers = r.winners.map((w) => `**${w.replaceAll('*', '')}**`).join(', ');
  return tr(lang, r.tie ? 'poll.tie' : 'poll.winner', { answers, n: r.top });
}

/** Posted in the polls channel when a poll ends: English, then every answer with its votes. */
export function pollResultMessage(question: string, answers: Tally[], icon?: string) {
  const r = pollResult(answers);
  const rows = answers.map((a) => `${String(a.votes).padStart(4)}  ${clip(a.text.replaceAll('`', "'"), POLL_ANSWER_MAX)}`).join('\n');
  const e = brandEmbed(icon)
    .setTitle(clip(question, 256))
    .setDescription(line('en', r))
    .addFields({ name: tr('en', 'poll.results'), value: `\`\`\`\n${rows}\n\`\`\`` });
  return { embeds: [e], allowedMentions: { parse: [] as [] } };
}

export interface MessageShape { type: number; authorId: string; replyTo: string | null; embedAuthors: (string | null)[] }

/** Our result post under a poll: a reply of ours carrying the FC Solver embed. Discord's own "poll ended" message (type PollResult, same author) is not it. */
export const isOurResult = (m: MessageShape, pollId: string, botId: string): boolean =>
  m.type !== MessageType.PollResult && m.authorId === botId && m.replyTo === pollId && m.embedAuthors.includes('FC Solver');

/** Only Admin ends a poll early. */
export const canEndPoll = (roleNames: string[]): boolean => roleNames.includes(ROLE.admin);

export interface EndTarget { channelName: string | null; authorId: string; botId: string; hasPoll: boolean; finalized: boolean }
/** "End poll" works only on one of our own polls in the polls channel that is still open. */
export function endPollCheck(t: EndTarget, pollsChannel: string): 'ok' | 'notPoll' | 'ended' {
  if (t.channelName !== pollsChannel || t.authorId !== t.botId || !t.hasPoll) return 'notPoll';
  return t.finalized ? 'ended' : 'ok';
}
