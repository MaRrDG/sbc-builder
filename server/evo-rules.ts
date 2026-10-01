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

const TEXT: Record<MailLang, { subject: string; body: string; open: string; see: string; unsub: string }> = {
  en: {
    subject: "{player}'s evolution is ready to claim",
    body: "{player}'s training in the {evo} evolution is over (level {level} of {count}). Open the EA web app to claim it.",
    open: 'Open the EA web app',
    see: 'See your evolutions in FC Solver',
    unsub: 'Stop these emails',
  },
  ro: {
    subject: 'Evoluția lui {player} e gata de claim',
    body: 'Antrenamentul lui {player} în evoluția {evo} s-a terminat (nivelul {level} din {count}). Intră în EA web app ca să dai claim.',
    open: 'Deschide EA web app',
    see: 'Vezi evoluțiile în FC Solver',
    unsub: 'Nu mai trimite aceste emailuri',
  },
  it: {
    subject: "L'evoluzione di {player} è pronta da riscattare",
    body: "L'allenamento di {player} nell'evoluzione {evo} è finito (livello {level} di {count}). Apri la web app EA per riscattarla.",
    open: 'Apri la web app EA',
    see: 'Vedi le tue evoluzioni su FC Solver',
    unsub: 'Non inviarmi più queste email',
  },
};

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENT[c]);
const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ''));

export function evoMail(lang: MailLang, d: { player: string; evo: string; level: number; levelCount: number; evosUrl: string; unsubUrl: string }) {
  const t = TEXT[lang];
  const p = { player: d.player, evo: d.evo, level: d.level, count: d.levelCount };
  const pHtml = { ...p, player: esc(d.player), evo: esc(d.evo) };
  const subject = fill(t.subject, p);
  const text = `${fill(t.body, p)}\n\n${t.open}: ${EA_WEB_APP}\n${t.see}: ${d.evosUrl}\n\n${t.unsub}: ${d.unsubUrl}\n`;
  const html =
    `<p>${fill(t.body, pHtml)}</p>` +
    `<p><a href="${EA_WEB_APP}">${esc(t.open)}</a> · <a href="${esc(d.evosUrl)}">${esc(t.see)}</a></p>` +
    `<p style="color:#888;font-size:12px"><a href="${esc(d.unsubUrl)}">${esc(t.unsub)}</a></p>`;
  return { subject, text, html };
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

const DIGEST: Record<MailLang, { subject: string; intro: string; item: string }> = {
  en: { subject: '{count} evolutions are ready to claim', intro: 'These trainings are over. Open the EA web app to claim them:', item: '{player}: {evo} (level {level} of {levels})' },
  ro: { subject: '{count} {de}evoluții sunt gata de claim', intro: 'Aceste antrenamente s-au terminat. Intră în EA web app ca să dai claim:', item: '{player}: {evo} (nivelul {level} din {levels})' },
  it: { subject: '{count} evoluzioni sono pronte da riscattare', intro: 'Questi allenamenti sono finiti. Apri la web app EA per riscattarle:', item: '{player}: {evo} (livello {level} di {levels})' },
};

/** One email for everything that ended for a user in the same tick; a single training reads like evoMail(). */
export function evoDigest(
  lang: MailLang,
  items: { player: string; evo: string; level: number; levelCount: number }[],
  d: { evosUrl: string; unsubUrl: string },
) {
  if (items.length === 1) return evoMail(lang, { ...items[0], ...d });
  const t = TEXT[lang];
  const g = DIGEST[lang];
  const n = items.length;
  const subject = fill(g.subject, { count: n, de: n % 100 === 0 || n % 100 >= 20 ? 'de ' : '' }); // ro: "20 de evoluții"
  const line = (i: (typeof items)[number], e: (s: string) => string) => fill(g.item, { player: e(i.player), evo: e(i.evo), level: i.level, levels: i.levelCount });
  const text = `${g.intro}\n\n${items.map((i) => `- ${line(i, String)}`).join('\n')}\n\n${t.open}: ${EA_WEB_APP}\n${t.see}: ${d.evosUrl}\n\n${t.unsub}: ${d.unsubUrl}\n`;
  const html =
    `<p>${esc(g.intro)}</p><ul>${items.map((i) => `<li>${line(i, esc)}</li>`).join('')}</ul>` +
    `<p><a href="${EA_WEB_APP}">${esc(t.open)}</a> · <a href="${esc(d.evosUrl)}">${esc(t.see)}</a></p>` +
    `<p style="color:#888;font-size:12px"><a href="${esc(d.unsubUrl)}">${esc(t.unsub)}</a></p>`;
  return { subject, text, html };
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
