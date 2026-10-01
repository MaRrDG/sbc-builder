// Outgoing email through Resend's HTTP API. Without RESEND_API_KEY (local dev) the mail is logged instead.
let warnedNoFrom = false;
export async function sendMail(m: { to: string; subject: string; text: string; html: string; headers?: Record<string, string> }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    if (key && !from && !warnedNoFrom) {
      warnedNoFrom = true;
      console.warn('[mail] RESEND_API_KEY is set but EMAIL_FROM is empty: mail is not sent');
    }
    const [user = '', domain = ''] = m.to.split('@');
    console.log(`[mail] (not sent, no RESEND_API_KEY/EMAIL_FROM) to=${user.slice(0, 1)}***@${domain} subject=${m.subject}`);
    return true;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html, headers: m.headers }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) console.warn(`[mail] resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.ok;
  } catch (e) {
    console.warn(`[mail] resend failed: ${(e as Error).message}`);
    return false;
  }
}
