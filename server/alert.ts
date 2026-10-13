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

export function alertText({ env, kind, route, err }: { env: string; kind: AlertKind; route?: string; err: { name?: string; message?: string; stack?: string } }) {
  const where = route ? ` · ${route.split('?')[0]}` : '';
  const msg = `${err.name ?? 'Error'}: ${(err.message ?? '').slice(0, 200)}`;
  const stack = (err.stack ?? '').split('\n').slice(1, 6).join('\n');
  return `**[${env}] ${kind}**${where}\n${msg}${stack ? `\n\`\`\`\n${stack}\n\`\`\`` : ''}`;
}

const gate = createAlertGate();
const env = () => {
  try {
    return process.env.SITE_URL ? new URL(process.env.SITE_URL).host : 'dev';
  } catch {
    return 'dev';
  }
};

export async function alert(kind: AlertKind, e: unknown, route?: string): Promise<void> {
  const err = e instanceof Error ? e : new Error(String(e));
  const first = (err.stack ?? '').split('\n')[1]?.trim() ?? '';
  const { send, skipped } = gate.take(`${kind}|${route?.split('?')[0] ?? ''}|${first}`);
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!send || !url) return;
  const content = alertText({ env: env(), kind, route, err }) + (skipped ? `\n(+${skipped} more since the last one)` : '');
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 1900) }), signal: AbortSignal.timeout(5000) });
  } catch (x) {
    console.error(`[alert] webhook failed: ${(x as Error).message}`);
  }
}
