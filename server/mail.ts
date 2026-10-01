// Outgoing email through Resend's HTTP API. Without RESEND_API_KEY (local dev) the mail is logged instead.
export async function sendMail(m: { to: string; subject: string; text: string; html: string; headers?: Record<string, string> }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.log(`[mail] (not sent, no RESEND_API_KEY/EMAIL_FROM) to=${m.to} subject=${m.subject}\n${m.text}`);
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
