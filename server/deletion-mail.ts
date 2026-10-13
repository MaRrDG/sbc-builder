// The "your account will be deleted" email (server/deletion.ts), en / ro / it. Pure.
import { BODY_FONT, button, C, esc, fill, FONT, h1, para, type MailLang } from './evo-rules.js';

interface DeletionText { subject: string; head: string; body: string; keep: string; button: string; billing: string }

const TEXT: Record<MailLang, DeletionText> = {
  en: {
    subject: 'Your FC Solver account will be deleted on {date}',
    head: 'Account deletion scheduled',
    body: 'You asked us to delete your FC Solver account. On {date} we delete your account and the data we hold about you.',
    keep: 'Changed your mind? Sign in to FC Solver and press Cancel deletion to keep your account.',
    button: 'Open FC Solver',
    billing: 'If you had a subscription, it will not renew. There is no automatic refund.',
  },
  ro: {
    subject: 'Contul tău FC Solver va fi șters pe {date}',
    head: 'Ștergerea contului este programată',
    body: 'Ne-ai cerut să ștergem contul tău FC Solver. Pe {date} ștergem contul și datele pe care le avem despre tine.',
    keep: 'Te-ai răzgândit? Intră în FC Solver și apasă Anulează ștergerea ca să-ți păstrezi contul.',
    button: 'Deschide FC Solver',
    billing: 'Dacă aveai un abonament, nu se mai reînnoiește. Nu există rambursare automată.',
  },
  it: {
    subject: 'Il tuo account FC Solver sarà eliminato il {date}',
    head: 'Eliminazione dell’account programmata',
    body: 'Ci hai chiesto di eliminare il tuo account FC Solver. Il {date} eliminiamo l’account e i dati che abbiamo su di te.',
    keep: 'Hai cambiato idea? Accedi a FC Solver e premi Annulla eliminazione per tenere il tuo account.',
    button: 'Apri FC Solver',
    billing: 'Se avevi un abbonamento, non si rinnoverà. Non è previsto alcun rimborso automatico.',
  },
};

const LOCALE: Record<MailLang, string> = { en: 'en-GB', ro: 'ro-RO', it: 'it-IT' };

/** The deletion date as people read it, with the time zone named (UTC: users are everywhere). */
export const deletionDateText = (lang: MailLang, at: Date) =>
  new Intl.DateTimeFormat(LOCALE[lang], { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(at) + ' UTC';

export function deletionMail(lang: MailLang, at: Date, d: { siteUrl: string; logoUrl?: string }) {
  const t = TEXT[lang];
  const p = { date: deletionDateText(lang, at) };
  const subject = fill(t.subject, p);
  const body = fill(t.body, p);
  const text = `${t.head}\n\n${body}\n\n${t.keep}\n${d.siteUrl}\n\n${t.billing}\n`;
  const logo = d.logoUrl
    ? `<img src="${esc(d.logoUrl)}" width="28" height="28" alt="" style="display:inline-block;vertical-align:middle;border:0;border-radius:6px">&nbsp;&nbsp;`
    : '';
  const html =
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
    `<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:${C.bg}">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px">` +
    `<tr><td style="padding:0 4px 16px;${FONT};font-size:20px;font-weight:700;color:${C.ink}">${logo}<span style="vertical-align:middle">FC Solver</span></td></tr>` +
    `<tr><td align="center" style="background:${C.panel};border:1px solid ${C.line};border-radius:14px;padding:28px 20px">` +
    h1(esc(t.head)) +
    para(esc(body)) +
    para(esc(t.keep)) +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:24px auto 0"><tr><td align="center">${button(d.siteUrl, t.button, true)}</td></tr></table>` +
    `</td></tr>` +
    `<tr><td align="center" style="padding:18px 8px 0;${BODY_FONT};font-size:12px;line-height:18px;color:${C.ink2}">${esc(t.billing)}</td></tr>` +
    `</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
