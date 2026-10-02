// Pure rules for evolution training emails: when a row is due, who gets it, what it says,
// and the unsubscribe token. Server code (server/evo-alerts.ts) does the I/O.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export type MailLang = 'en' | 'ro' | 'it';
export const STALE_MS = 24 * 3600 * 1000; // after downtime, don't mail trainings that ended long ago
export const MAX_TRIES = 3;

export interface DueRow { endsAt: Date | null; notifiedAt: Date | null; tries: number; ready: boolean }

export function isDue(row: DueRow, nowMs: number): boolean {
  if (!row.endsAt || row.notifiedAt || row.tries >= MAX_TRIES) return false;
  const end = row.endsAt.getTime();
  return end <= nowMs && end > nowMs - STALE_MS;
}

export type Decision = 'send' | 'skip';
export function decide(owner: { tier: 'free' | 'premium'; evoEmails: boolean; email: string } | null): Decision {
  return owner && owner.tier === 'premium' && owner.evoEmails && owner.email.includes('@') ? 'send' : 'skip';
}

export const asLang = (v: unknown): MailLang => (v === 'ro' || v === 'it' ? v : 'en');

const EA_WEB_APP = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/';
const COMPANION = 'https://www.ea.com/games/ea-sports-fc/ultimate-team/web-app'; // EA's page for both apps, with the store links

interface MailText {
  subjectDone: string; subjectLevel: string; subjectMany: string;
  headDone: string; headLevel: string;
  badgeDone: string; badgeLevel: string;
  bodyDone: string; bodyLevel: string; bodyMany: string;
  note: string; noteMany: string;
  open: string; companion: string; see: string; why: string; unsub: string;
}

const TEXT: Record<MailLang, MailText> = {
  en: {
    subjectDone: '{player} has finished {evo}',
    subjectLevel: '{player}: level {level} of {count} is ready',
    subjectMany: '{count} evolutions are ready to claim',
    headDone: '{player} has finished the evolution',
    headLevel: '{player} has finished a level',
    badgeDone: 'Evolution complete',
    badgeLevel: 'Level {level} of {count} ready',
    bodyDone: 'The last training in {evo} is over. Claim it in the EA web app or the Companion app to get the evolved card.',
    bodyLevel: 'The training for level {level} of {count} in {evo} is over. Claim it in the EA web app or the Companion app to get its upgrades and unlock the next level.',
    bodyMany: 'These trainings are over. Claim them in the EA web app or the Companion app.',
    note: "The card shows the player as they are now. This level's upgrades are added when you claim it.",
    noteMany: "Cards show the players as they are now. Each level's upgrades are added when you claim it.",
    open: 'Open the EA web app',
    companion: 'Companion app',
    see: 'Open FC Solver',
    why: 'You get this email because evolution emails are on in FC Solver.',
    unsub: 'Stop these emails',
  },
  ro: {
    subjectDone: '{player} a terminat evoluția {evo}',
    subjectLevel: '{player}: nivelul {level} din {count} e gata',
    subjectMany: '{count} {de}evoluții sunt gata de claim',
    headDone: '{player} a terminat evoluția',
    headLevel: '{player} a terminat un nivel',
    badgeDone: 'Evoluție terminată',
    badgeLevel: 'Nivelul {level} din {count} e gata',
    bodyDone: 'Ultimul antrenament din {evo} s-a terminat. Dă claim în EA web app sau în aplicația Companion ca să primești cardul evoluat.',
    bodyLevel: 'Antrenamentul pentru nivelul {level} din {count} în {evo} s-a terminat. Dă claim în EA web app sau în aplicația Companion ca să primești upgrade-urile și să deblochezi nivelul următor.',
    bodyMany: 'Aceste antrenamente s-au terminat. Dă claim în EA web app sau în aplicația Companion.',
    note: 'Cardul arată jucătorul așa cum e acum. Upgrade-urile nivelului se adaugă când dai claim.',
    noteMany: 'Cardurile arată jucătorii așa cum sunt acum. Upgrade-urile fiecărui nivel se adaugă când dai claim.',
    open: 'Deschide EA web app',
    companion: 'Aplicația Companion',
    see: 'Deschide FC Solver',
    why: 'Primești acest email pentru că ai activat emailurile pentru evoluții în FC Solver.',
    unsub: 'Nu mai trimite aceste emailuri',
  },
  it: {
    subjectDone: '{player} ha completato {evo}',
    subjectLevel: '{player}: il livello {level} di {count} è pronto',
    subjectMany: '{count} evoluzioni sono pronte da riscattare',
    headDone: "{player} ha completato l'evoluzione",
    headLevel: '{player} ha completato un livello',
    badgeDone: 'Evoluzione completata',
    badgeLevel: 'Livello {level} di {count} pronto',
    bodyDone: "L'ultimo allenamento di {evo} è finito. Riscattalo nella web app EA o nell'app Companion per ottenere la carta evoluta.",
    bodyLevel: "L'allenamento del livello {level} di {count} in {evo} è finito. Riscattalo nella web app EA o nell'app Companion per ottenere i potenziamenti e sbloccare il livello successivo.",
    bodyMany: "Questi allenamenti sono finiti. Riscattali nella web app EA o nell'app Companion.",
    note: "La carta mostra il giocatore com'è adesso. I potenziamenti del livello si aggiungono quando lo riscatti.",
    noteMany: 'Le carte mostrano i giocatori come sono adesso. I potenziamenti di ogni livello si aggiungono quando li riscatti.',
    open: 'Apri la web app EA',
    companion: 'App Companion',
    see: 'Apri FC Solver',
    why: 'Ricevi questa email perché le email sulle evoluzioni sono attive su FC Solver.',
    unsub: 'Non inviarmi più queste email',
  },
};

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENT[c]);
const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ''));

export interface EvoItem { player: string; evo: string; level: number; levelCount: number; cardUrl?: string | null }
export interface MailLinks { evosUrl: string; unsubUrl: string; logoUrl?: string }

/** The last level of a slot: claiming it finishes the evolution. */
export const isFinal = (i: { level: number; levelCount: number }) => i.levelCount > 0 && i.level >= i.levelCount;

// Email palette: the site's OKLCH tokens (styles.css) as hex; mail clients don't know oklch().
const C = { bg: '#061a20', panel: '#0d262c', line: '#24403f', ink: '#eef5f5', ink2: '#b3c4c7', go: '#35ecaa', goInk: '#002215' };
const FONT = "font-family:'Barlow Condensed','Arial Narrow',Arial,Helvetica,sans-serif";
const BODY_FONT = 'font-family:Arial,Helvetica,sans-serif';

const button = (href: string, label: string, primary: boolean) =>
  `<a href="${esc(href)}" style="display:inline-block;${BODY_FONT};font-size:15px;font-weight:700;line-height:20px;text-decoration:none;border-radius:8px;padding:12px 20px;${
    primary ? `background:${C.go};color:${C.goInk};border:1px solid ${C.go}` : `background:transparent;color:${C.ink};border:1px solid ${C.line}`
  }">${esc(label)}</a>`;

/** State pill: says it in words (never by colour alone), the check mark only marks a finished evolution. */
const badge = (label: string, done: boolean, small = false) =>
  `<span style="display:inline-block;${BODY_FONT};font-size:${small ? 12 : 13}px;font-weight:700;line-height:16px;border-radius:999px;padding:${small ? '3px 9px' : '5px 12px'};${
    done ? `background:${C.go};color:${C.goInk}` : `background:transparent;color:${C.go};border:1px solid ${C.go}`
  }">${done ? '&#10003; ' : ''}${esc(label)}</span>`;

const cardImg = (url: string, alt: string, w: number) =>
  `<img src="${esc(url)}" width="${w}" height="${Math.round((w * 800) / 576)}" alt="${esc(alt)}" style="display:block;margin:0 auto;border:0;outline:none;width:${w}px;max-width:100%;height:auto">`;

function page(lang: MailLang, subject: string, preheader: string, inner: string, t: MailText, d: MailLinks) {
  const logo = d.logoUrl
    ? `<img src="${esc(d.logoUrl)}" width="28" height="28" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:6px">&nbsp;&nbsp;`
    : '';
  return (
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.bg}">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">` +
    `<tr><td style="padding:0 4px 16px;${FONT};font-size:20px;font-weight:700;color:${C.ink}">${logo}<span style="vertical-align:middle">FC Solver</span></td></tr>` +
    `<tr><td align="center" style="background:${C.panel};border:1px solid ${C.line};border-radius:14px;padding:28px 20px">${inner}` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 0"><tr><td align="center">${button(EA_WEB_APP, t.open, true)}</td></tr></table>` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:10px auto 0"><tr>` +
    `<td align="center" style="padding:4px">${button(COMPANION, t.companion, false)}</td><td align="center" style="padding:4px">${button(d.evosUrl, t.see, false)}</td></tr></table>` +
    `</td></tr>` +
    `<tr><td align="center" style="padding:18px 8px 0;${BODY_FONT};font-size:12px;line-height:18px;color:${C.ink2}">${esc(t.why)}<br>` +
    `<a href="${esc(d.unsubUrl)}" style="color:${C.ink2};text-decoration:underline">${esc(t.unsub)}</a></td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

const h1 = (s: string) => `<h1 style="margin:0 0 18px;${FONT};font-size:28px;line-height:32px;font-weight:700;color:${C.ink}">${s}</h1>`;
const para = (s: string, size = 15, color = C.ink) => `<p style="margin:16px 0 0;${BODY_FONT};font-size:${size}px;line-height:${Math.round(size * 1.5)}px;color:${color}">${s}</p>`;

/** One training: the card big, what ended and how to claim it. */
export function evoMail(lang: MailLang, d: EvoItem & MailLinks) {
  const t = TEXT[lang];
  const done = isFinal(d);
  const p = { player: d.player, evo: d.evo, level: d.level, count: d.levelCount };
  const pHtml = { ...p, player: esc(d.player), evo: esc(d.evo) };
  const subject = fill(done ? t.subjectDone : t.subjectLevel, p);
  const body = done ? t.bodyDone : t.bodyLevel;
  const label = fill(done ? t.badgeDone : t.badgeLevel, p);
  const text = `${fill(done ? t.headDone : t.headLevel, p)}\n${label}\n\n${fill(body, p)}\n\n${t.open}: ${EA_WEB_APP}\n${t.companion}: ${COMPANION}\n${t.see}: ${d.evosUrl}\n\n${t.why}\n${t.unsub}: ${d.unsubUrl}\n`;
  const inner =
    h1(fill(done ? t.headDone : t.headLevel, pHtml)) +
    (d.cardUrl ? `<div style="margin:0 0 14px">${cardImg(d.cardUrl, d.player, 180)}</div>` : '') +
    `<div style="${FONT};font-size:20px;line-height:24px;font-weight:700;color:${C.ink};margin:0 0 8px">${esc(d.evo)}</div>` +
    badge(label, done) +
    para(fill(body, pHtml)) +
    (d.cardUrl ? para(esc(t.note), 12, C.ink2) : '');
  return { subject, text, html: page(lang, subject, fill(body, p), inner, t, d) };
}

/** Everything that ended for a user in the same tick: one email, a card per training; a single one reads like evoMail(). */
export function evoDigest(lang: MailLang, items: EvoItem[], d: MailLinks) {
  if (items.length === 1) return evoMail(lang, { ...items[0], ...d });
  const t = TEXT[lang];
  const n = items.length;
  const subject = fill(t.subjectMany, { count: n, de: n % 100 === 0 || n % 100 >= 20 ? 'de ' : '' }); // ro: "20 de evoluții"
  const label = (i: EvoItem) => fill(isFinal(i) ? t.badgeDone : t.badgeLevel, { level: i.level, count: i.levelCount });
  const text = `${subject}\n\n${t.bodyMany}\n\n${items.map((i) => `- ${i.player}: ${i.evo} (${label(i)})`).join('\n')}\n\n${t.open}: ${EA_WEB_APP}\n${t.companion}: ${COMPANION}\n${t.see}: ${d.evosUrl}\n\n${t.why}\n${t.unsub}: ${d.unsubUrl}\n`;
  const cell = (i: EvoItem) =>
    `<td align="center" valign="top" width="33%" style="padding:10px 6px">` +
    (i.cardUrl ? cardImg(i.cardUrl, i.player, 120) : '') +
    `<div style="${FONT};font-size:17px;line-height:20px;font-weight:700;color:${C.ink};margin:8px 0 2px">${esc(i.player)}</div>` +
    `<div style="${BODY_FONT};font-size:12px;line-height:16px;color:${C.ink2};margin:0 0 6px">${esc(i.evo)}</div>` +
    badge(label(i), isFinal(i), true) +
    `</td>`;
  const rows = chunk(items, 3).map((r) => `<tr>${r.map(cell).join('')}</tr>`).join('');
  const inner =
    h1(esc(subject)) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto">${rows}</table>` +
    para(esc(t.bodyMany)) +
    (items.some((i) => i.cardUrl) ? para(esc(t.noteMany), 12, C.ink2) : '');
  return { subject, text, html: page(lang, subject, t.bodyMany, inner, t, d) };
}

/** A training row's identity: one email per (persona, slot, level). */
export interface AlertKey { personaId: number; slotId: number; level: number }
export interface AlertOwner { userId: string; email: string; lang: MailLang; evoEmails: boolean; tier: 'free' | 'premium' | null }

/**
 * Due rows -> one mail per owner (all their personas together) and the rows to close without a mail
 * (no owner, not Premium, emails off). `tier: null` means the plan lookup failed: the row waits for the next tick.
 */
export function planAlerts<R extends { personaId: number }>(rows: R[], ownerOf: (personaId: number) => AlertOwner | null) {
  const skip: R[] = [];
  const byUser = new Map<string, { userId: string; email: string; lang: MailLang; rows: R[] }>();
  for (const r of rows) {
    const o = ownerOf(r.personaId);
    if (o && o.tier === null) continue;
    if (!o || decide({ tier: o.tier as 'free' | 'premium', evoEmails: o.evoEmails, email: o.email }) === 'skip') {
      skip.push(r);
      continue;
    }
    const m = byUser.get(o.userId) ?? { userId: o.userId, email: o.email, lang: o.lang, rows: [] };
    m.rows.push(r);
    byUser.set(o.userId, m);
  }
  return { mails: [...byUser.values()], skip };
}

/**
 * What a Resend answer means for the rows: ok (close them), retry (keep them, pause sending; doesn't count
 * as a try) or fail (counts as a try). `status: null` = network error / timeout.
 */
export function classifySend(status: number | null, body: string, retryAfter?: string | null): { kind: 'ok' | 'retry' | 'fail'; pauseMs: number } {
  if (status !== null && status >= 200 && status < 300) return { kind: 'ok', pauseMs: 0 };
  if (status === 429) {
    if (/quota/i.test(body)) return { kind: 'retry', pauseMs: 3600_000 };
    const s = Number(retryAfter);
    return { kind: 'retry', pauseMs: s > 0 ? Math.min(s, 3600) * 1000 : 60_000 };
  }
  if (status === null || status >= 500) return { kind: 'retry', pauseMs: 60_000 };
  return { kind: 'fail', pauseMs: 0 };
}

/** Idempotency key for one send (Resend keeps it 24 h): a retry after a timeout can't mail the same rows twice. */
export function alertKey(userId: string, rows: AlertKey[]): string {
  const ids = rows.map((r) => `${r.personaId}:${r.slotId}:${r.level}`).sort().join(',');
  return `evo-alert/${createHash('sha256').update(`${userId}|${ids}`).digest('hex').slice(0, 40)}`;
}

export const chunk = <T>(a: T[], n: number): T[][] => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

const sign = (userId: string, secret: string) => createHmac('sha256', secret).update(`evo-unsub:${userId}`).digest('base64url');
export const unsubToken = sign;
export function checkUnsub(userId: string, token: string, secret: string): boolean {
  const want = Buffer.from(sign(userId, secret));
  const got = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}
