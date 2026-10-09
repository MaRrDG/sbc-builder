// Pure rules for the Daily reminder email (Premium, opt-in): when it is due, who gets it, what it says,
// and its unsubscribe token. server/daily/reminder.ts does the I/O.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { BODY_FONT, badge, button, C, esc, fill, FONT, h1, para, type MailLang } from '../evo-rules.js';
import { streakOf, type Play } from './streak.js';

/** Due 3 h 01 min before the drop that ends the day (17:00 for the 20:01 drop). */
export const LEAD_MS = (3 * 60 + 1) * 60_000;
/** Catch-up after downtime ends 1 min before the drop (20:00): never a reminder for a game that is over. */
export const CUTOFF_MS = 60_000;
export const MAX_TRIES = 3;

export function reminderWindow(nextDrop: number): { from: number; until: number } {
  return { from: nextDrop - LEAD_MS, until: nextDrop - CUTOFF_MS };
}

/** `nextDrop` is the drop that ends the current day. */
export function inWindow(now: number, nextDrop: number): boolean {
  const w = reminderWindow(nextDrop);
  return now >= w.from && now < w.until;
}

export interface ReminderUser {
  dailyReminder: boolean;
  /** null: the plan lookup failed, the user waits for the next tick */
  tier: 'free' | 'premium' | null;
  email: string;
  plays: Play[]; // finished games
}

export type Eligibility = { send: true; streak: number } | { send: false; reason: 'off' | 'noEmail' | 'plan' | 'free' | 'played' | 'noStreak' };

/** Opted in, Premium now, an active win streak (won yesterday) and today's game not played yet. */
export function eligibility(u: ReminderUser, today: number): Eligibility {
  if (!u.dailyReminder) return { send: false, reason: 'off' };
  if (!u.email.includes('@')) return { send: false, reason: 'noEmail' };
  if (u.tier === null) return { send: false, reason: 'plan' };
  if (u.tier !== 'premium') return { send: false, reason: 'free' };
  if (u.plays.some((p) => p.day === today)) return { send: false, reason: 'played' };
  const streak = streakOf(u.plays, today).current; // counts back from yesterday while today is unplayed
  return streak > 0 ? { send: true, streak } : { send: false, reason: 'noStreak' };
}

interface Text { subject: string; head: string; badge: string; body: string; play: string; why: string; unsub: string }

const TEXT: Record<MailLang, Text> = {
  en: {
    subject: "Don't lose your {n}-day Daily streak",
    head: 'Your {n}-day streak is on the line',
    badge: '{n}-day win streak',
    body: "You haven't played today's FC Solver Daily yet. Guess the player before the next SBC drop to keep your streak going.",
    play: "Play today's Daily",
    why: 'You get this email because the Daily reminder is on in FC Solver.',
    unsub: 'Stop Daily reminders',
  },
  ro: {
    subject: 'Nu-ți pierde seria de {n} {unit} la Daily',
    head: 'Seria ta de {n} {unit} e în joc',
    badge: 'Serie de {n} {unit} cu victorii',
    body: 'Încă nu ai jucat FC Solver Daily de azi. Ghicește jucătorul înainte de următorul drop de SBC-uri ca să-ți păstrezi seria.',
    play: 'Joacă Daily de azi',
    why: 'Primești acest email pentru că ai activat memento-ul pentru Daily în FC Solver.',
    unsub: 'Nu mai trimite memento-uri pentru Daily',
  },
  it: {
    subject: 'Non perdere la tua serie di {n} {unit} al Daily',
    head: 'La tua serie di {n} {unit} è in gioco',
    badge: 'Serie di {n} {unit} di vittorie',
    body: 'Non hai ancora giocato a FC Solver Daily di oggi. Indovina il giocatore prima del prossimo drop delle SBC per mantenere la serie.',
    play: 'Gioca al Daily di oggi',
    why: 'Ricevi questa email perché il promemoria del Daily è attivo su FC Solver.',
    unsub: 'Non inviarmi più promemoria del Daily',
  },
};

/** "day(s)" after a count: ro 1 zi / 2–19 zile / 20 de zile, it 1 giorno / 2 giorni. */
export function dayUnit(lang: MailLang, n: number): string {
  if (lang === 'ro') return n === 1 ? 'zi' : n % 100 === 0 || n % 100 >= 20 ? 'de zile' : 'zile';
  if (lang === 'it') return n === 1 ? 'giorno' : 'giorni';
  return n === 1 ? 'day' : 'days';
}

export interface ReminderLinks { dailyUrl: string; unsubUrl: string; logoUrl?: string }

export function reminderMail(lang: MailLang, streak: number, d: ReminderLinks) {
  const t = TEXT[lang];
  const p = { n: streak, unit: dayUnit(lang, streak) };
  const subject = fill(t.subject, p);
  const head = fill(t.head, p);
  const label = fill(t.badge, p);
  const text = `${head}\n${label}\n\n${t.body}\n\n${t.play}: ${d.dailyUrl}\n\n${t.why}\n${t.unsub}: ${d.unsubUrl}\n`;
  const logo = d.logoUrl
    ? `<img src="${esc(d.logoUrl)}" width="28" height="28" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:6px">&nbsp;&nbsp;`
    : '';
  const html =
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.bg}">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(t.body)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">` +
    `<tr><td style="padding:0 4px 16px;${FONT};font-size:20px;font-weight:700;color:${C.ink}">${logo}<span style="vertical-align:middle">FC Solver</span></td></tr>` +
    `<tr><td align="center" style="background:${C.panel};border:1px solid ${C.line};border-radius:14px;padding:28px 20px">` +
    h1(esc(head)) +
    badge(label, false) +
    para(esc(t.body)) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 0"><tr><td align="center">${button(d.dailyUrl, t.play, true)}</td></tr></table>` +
    `</td></tr>` +
    `<tr><td align="center" style="padding:18px 8px 0;${BODY_FONT};font-size:12px;line-height:18px;color:${C.ink2}">${esc(t.why)}<br>` +
    `<a href="${esc(d.unsubUrl)}" style="color:${C.ink2};text-decoration:underline">${esc(t.unsub)}</a></td></tr>` +
    `</table></td></tr></table></body></html>`;
  return { subject, text, html };
}

/** Idempotency key for one send (Resend keeps it 24 h): one day's reminder can't go out twice on a retry. */
export function reminderKey(day: number, userIds: string[]): string {
  return `daily-reminder/${createHash('sha256').update(`${day}|${[...userIds].sort().join(',')}`).digest('hex').slice(0, 40)}`;
}

// a different message from the evolution token: one link can't turn off the other email
const sign = (userId: string, secret: string) => createHmac('sha256', secret).update(`daily-unsub:${userId}`).digest('base64url');
export const reminderUnsubToken = sign;
export function checkReminderUnsub(userId: string, token: string, secret: string): boolean {
  const want = Buffer.from(sign(userId, secret));
  const got = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}
