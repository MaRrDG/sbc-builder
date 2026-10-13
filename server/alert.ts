// Owner alerts on a private Discord channel (ALERT_WEBHOOK_URL; unset = log only): 500s, crashes,
// failed backups. Never request data: route, error type, message and the top of the stack only.
export type AlertKind = '500' | 'uncaught' | 'unhandled' | 'backup';

const WINDOW_MS = 10 * 60 * 1000;
const HOUR_CAP = 20;

/** Pure: same fingerprint once per window (the next send says how many were skipped), and a cap per hour. */
export function createAlertGate({ windowMs = WINDOW_MS, hourCap = HOUR_CAP, now = Date.now } = {}) {
  const last = new Map<string, { at: number; skipped: number }>();
  let sent: number[] = [];
  return {
    take(fingerprint: string) {
      const t = now();
      sent = sent.filter((x) => t - x < 3_600_000);
      const prev = last.get(fingerprint);
      for (const [k, v] of last) if (k !== fingerprint && t - v.at >= windowMs) last.delete(k);
      if (prev && t - prev.at < windowMs) {
        prev.skipped++;
        return { send: false, skipped: 0 };
      }
      if (sent.length >= hourCap) return { send: false, skipped: 0 };
      sent.push(t);
      last.set(fingerprint, { at: t, skipped: 0 });
      return { send: true, skipped: prev?.skipped ?? 0 };
    },
  };
}

/** Pure: first line of the message only, no params, emails / ids / token-like runs redacted, max 200 chars. */
function safeMessage(raw: string) {
  let m = (raw.split('\n')[0] ?? '').replace(/params:.*$/i, '').replace(/\s+/g, ' ').trim();
  m = m
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '[id]')
    .replace(/[A-Za-z0-9_\-.=+/]{24,}/g, '[token]');
  return m.slice(0, 200);
}

export function alertText({ env, kind, route, err, maxLen = 1800 }: { env: string; kind: AlertKind; route?: string; err: { name?: string; message?: string; stack?: string }; maxLen?: number }) {
  const where = route ? ` · ${route.split('?')[0]}` : '';
  const head = `**[${env}] ${kind}**${where}\n${err.name ?? 'Error'}: ${safeMessage(err.message ?? '')}`;
  const lines = (err.stack ?? '').split('\n').filter((l) => /^\s+at /.test(l)).slice(0, 5);
  const build = () => (lines.length ? `${head}\n\`\`\`\n${lines.join('\n')}\n\`\`\`` : head);
  while (lines.length && build().length > maxLen) lines.pop();
  return build().slice(0, maxLen + 100);
}

/** Pure: kind + route + top stack line; a non-Error value adds its redacted message (40 chars) so different rejections stay apart. */
export function alertFingerprint(kind: AlertKind, e: unknown, route?: string) {
  const err = e instanceof Error ? e : new Error(String(e));
  const first = (err.stack ?? '').split('\n').find((l) => /^\s+at /.test(l))?.trim() ?? '';
  const extra = e instanceof Error ? '' : `|${safeMessage(err.message).slice(0, 40)}`;
  return `${kind}|${route?.split('?')[0] ?? ''}|${first}${extra}`;
}

const gate = createAlertGate();
const env = () => {
  try {
    return process.env.SITE_URL ? new URL(process.env.SITE_URL).host : 'dev';
  } catch {
    return 'dev';
  }
};

/** `route` must be "METHOD /route/pattern" (Fastify routeOptions.url), never a raw request URL. Never throws. */
export async function alert(kind: AlertKind, e: unknown, route?: string): Promise<void> {
  try {
    const err = e instanceof Error ? e : new Error(String(e));
    const { send, skipped } = gate.take(alertFingerprint(kind, e, route));
    const url = process.env.ALERT_WEBHOOK_URL;
    if (!send || !url) return;
    const content = alertText({ env: env(), kind, route, err }) + (skipped ? `\n(+${skipped} more since the last one)` : '');
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 1990), allowed_mentions: { parse: [] } }), signal: AbortSignal.timeout(5000) });
  } catch (x) {
    try {
      console.error(`[alert] failed: ${(x as Error).message}`);
    } catch {
      /* never throw */
    }
  }
}
