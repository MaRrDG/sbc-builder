// Outgoing email through Resend's HTTP API. Without RESEND_API_KEY (local dev) the mail is logged instead.
import { classifySend } from './evo-rules.js';

export interface Mail { to: string; subject: string; text: string; html: string; headers?: Record<string, string> }
export type SendResult = ReturnType<typeof classifySend>;

export const BATCH_MAX = 100; // Resend's /emails/batch limit

let warnedNoFrom = false;

/**
 * One request: a single mail (/emails) or up to BATCH_MAX (/emails/batch, all or nothing).
 * `idempotencyKey` makes a retry of the same request a no-op on Resend's side for 24 h.
 */
export async function sendMails(mails: Mail[], idempotencyKey: string): Promise<SendResult> {
  if (!mails.length) return { kind: 'ok', pauseMs: 0 };
  if (mails.length > BATCH_MAX) throw new Error(`sendMails: ${mails.length} mails, max ${BATCH_MAX}`);
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    if (key && !from && !warnedNoFrom) {
      warnedNoFrom = true;
      console.warn('[mail] RESEND_API_KEY is set but EMAIL_FROM is empty: mail is not sent');
    }
    for (const m of mails) {
      const [user = '', domain = ''] = m.to.split('@');
      console.log(`[mail] (not sent, no RESEND_API_KEY/EMAIL_FROM) to=${user.slice(0, 1)}***@${domain} subject=${m.subject}`);
    }
    return { kind: 'ok', pauseMs: 0 };
  }
  const one = (m: Mail) => ({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html, headers: m.headers });
  try {
    const r = await fetch(mails.length === 1 ? 'https://api.resend.com/emails' : 'https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify(mails.length === 1 ? one(mails[0]) : mails.map(one)),
      signal: AbortSignal.timeout(20_000),
    });
    const body = r.ok ? '' : (await r.text()).slice(0, 300);
    if (!r.ok) console.warn(`[mail] resend ${r.status} (${mails.length} mail${mails.length > 1 ? 's' : ''}): ${body}`);
    return classifySend(r.status, body, r.headers.get('retry-after'));
  } catch (e) {
    console.warn(`[mail] resend failed: ${(e as Error).message}`);
    return classifySend(null, '');
  }
}
