// Invites, points and codes: pure rules. Rows and transactions live in server/db/referrals.ts.
import { randomInt } from 'node:crypto';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0 O 1 I
export const INVITE_DAYS = 7;
export type SpendDays = 7 | 14 | 30;
export const PRICES: Record<SpendDays, number> = { 7: 2, 14: 3, 30: 5 };
export type CodeKind = 'invite' | 'promo' | 'gift';

export interface CodeRow {
  code: string;
  kind: CodeKind;
  ownerId: string | null;
  days: number | null; // invite: unused (INVITE_DAYS); promo: null = lifetime
  maxUses: number | null;
  uses: number;
  expiresAt: Date | null;
  disabled: boolean;
}

export type RedeemError = 'codeUnknown' | 'codeDisabled' | 'codeExpired' | 'codeFull' | 'codeOwn' | 'inviteUsed' | 'codeUsed';

/** An email for the inviter's friends table: 2 chars of the local part (1 when it has 2 or fewer), then ••• and the domain. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf('@');
  const local = at < 0 ? email : email.slice(0, at);
  const domain = at < 0 ? '' : email.slice(at);
  return `${[...local].slice(0, local.length <= 2 ? 1 : 2).join('')}•••${domain}`;
}

export function generateCode(len = 6, rand: (n: number) => number = randomInt): string {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[rand(CODE_ALPHABET.length)];
  return s;
}

/** What the user typed, as stored: upper case, spaces and dashes dropped; null when it cannot be a code. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{4,20}$/.test(c) ? c : null;
}

/** Why this user cannot use this code now, or null when they can. */
export function checkRedeem(code: CodeRow | null, ctx: { userId: string; usedInvite: boolean; usedThis: boolean; now: number }): RedeemError | null {
  if (!code) return 'codeUnknown';
  if (code.disabled) return 'codeDisabled';
  if (code.expiresAt && code.expiresAt.getTime() <= ctx.now) return 'codeExpired';
  if (code.ownerId === ctx.userId) return 'codeOwn';
  if (code.kind === 'invite' && ctx.usedInvite) return 'inviteUsed';
  if (ctx.usedThis) return 'codeUsed';
  if (code.maxUses !== null && code.uses >= code.maxUses) return 'codeFull';
  return null;
}

/** Days of Premium the code gives; null = for life. */
export const rewardDays = (code: CodeRow): number | null => (code.kind === 'invite' ? INVITE_DAYS : code.days);

export const isLifetime = (row: { plan: string; premiumUntil: Date | null }) => row.plan === 'premium' && row.premiumUntil === null;

/** The plan after adding `days` (null = for life); null when nothing changes (already for life). */
export function extendPremium(row: { plan: string; premiumUntil: Date | null }, days: number | null, now: number): { plan: 'premium'; premiumUntil: Date | null } | null {
  if (isLifetime(row)) return null;
  if (days === null) return { plan: 'premium', premiumUntil: null };
  const from = row.plan === 'premium' && row.premiumUntil ? Math.max(now, row.premiumUntil.getTime()) : now;
  return { plan: 'premium', premiumUntil: new Date(from + days * 86_400_000) };
}

export function parseSpend(body: unknown): { days: SpendDays; gift: boolean } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.days !== 7 && b.days !== 14 && b.days !== 30) return null;
  return { days: b.days, gift: b.gift === true };
}

export function checkSpend(balance: number, days: SpendDays, gift: boolean, lifetime: boolean): 'pointsLow' | 'pointsLifetime' | null {
  if (!gift && lifetime) return 'pointsLifetime';
  return balance < PRICES[days] ? 'pointsLow' : null;
}

/** An admin's new promo code; null when any field is malformed. */
export function parsePromo(body: unknown): { code: string | null; days: number | null; maxUses: number | null; expiresAt: Date | null; note: string } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (!('days' in b)) return null; // days must be explicitly provided
  const code = b.code === undefined || b.code === '' ? null : normalizeCode(b.code);
  if (b.code !== undefined && b.code !== '' && !code) return null;
  const days = b.days === null ? null : b.days;
  if (days !== null && !(Number.isInteger(days) && (days as number) > 0 && (days as number) <= 3650)) return null;
  const maxUses = b.maxUses === null || b.maxUses === undefined || b.maxUses === '' ? null : b.maxUses;
  if (maxUses !== null && !(Number.isInteger(maxUses) && (maxUses as number) > 0)) return null;
  const expiresAt = b.expiresAt ? new Date(String(b.expiresAt)) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return null;
  return { code, days: days as number | null, maxUses: maxUses as number | null, expiresAt, note: typeof b.note === 'string' ? b.note.slice(0, 200) : '' };
}
