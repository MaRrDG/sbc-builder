// Pure rules for evolution training emails: when a row is due, who gets it, what it says,
// and the unsubscribe token. Server code (server/evo-alerts.ts) does the I/O.
import { createHmac, timingSafeEqual } from 'node:crypto';

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

const sign = (userId: string, secret: string) => createHmac('sha256', secret).update(`evo-unsub:${userId}`).digest('base64url');
export const unsubToken = sign;
export function checkUnsub(userId: string, token: string, secret: string): boolean {
  const want = Buffer.from(sign(userId, secret));
  const got = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}
