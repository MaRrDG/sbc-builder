// Points / invite abuse audit (docs/audit/points-abuse-2026-10.md). `todo` tests prove an open issue;
// plain tests pin a defense that holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overLinkLimit } from './auth-rules.js';
import { createLimiter } from './limits.js';
import { checkRedeem, checkSpend, extendPremium, PRICES, type CodeRow } from './referrals.js';

const code = (p: Partial<CodeRow> = {}): CodeRow => ({
  code: 'ABCDEF', kind: 'invite', ownerId: 'owner', days: null, maxUses: null, uses: 0, expiresAt: null, disabled: false, ...p,
});
const ctx = (p: Partial<{ userId: string; usedInvite: boolean; usedThis: boolean; now: number }> = {}) =>
  ({ userId: 'alt', usedInvite: false, usedThis: false, now: 0, ...p });

test('holds: own code, a second invite, a used gift and a full code are refused', () => {
  assert.equal(checkRedeem(code(), ctx({ userId: 'owner' })), 'codeOwn');
  assert.equal(checkRedeem(code(), ctx({ usedInvite: true })), 'inviteUsed');
  assert.equal(checkRedeem(code({ kind: 'gift', days: 30, maxUses: 1, uses: 1 }), ctx()), 'codeFull');
  assert.equal(checkRedeem(code({ kind: 'gift', days: 30, maxUses: 1 }), ctx({ usedThis: true })), 'codeUsed');
});

test('audit P1: a gift code bought with points is redeemable by any other account (points are transferable)', { todo: 'audit: P1' }, () => {
  // nothing in the rule asks for an EA persona, an account age or a link between gifter and receiver
  assert.equal(checkRedeem(code({ kind: 'gift', ownerId: 'farm-1', days: 30, maxUses: 1 }), ctx({ userId: 'main' })), null);
  assert.equal(checkSpend(PRICES[30], 30, true, false), null); // 5 farmed points -> a 30-day gift
});

test('audit P1: gifts stack on Premium without limit', { todo: 'audit: P1' }, () => {
  let row: { plan: string; premiumUntil: Date | null } = { plan: 'free', premiumUntil: null };
  for (let i = 0; i < 12; i++) row = extendPremium(row, 30, 0)!;
  assert.equal(row.premiumUntil!.getTime(), 360 * 86_400_000);
});

test('holds: one EA persona links to at most 3 FC Solver accounts, ever', () => {
  assert.equal(overLinkLimit(['a', 'b'], 'c'), false);
  assert.equal(overLinkLimit(['a', 'b', 'c'], 'd'), true);
  assert.equal(overLinkLimit(['a', 'b', 'c'], 'a'), false); // the owner taking it back is not a new account
});

test('audit R2: IPv6 addresses of one /64 get separate rate-limit buckets', { todo: 'audit: R2' }, () => {
  const hit = createLimiter({ windowMs: 60_000, max: 1, now: () => 0 });
  assert.equal(hit('2001:db8:1:2::1'), true);
  assert.equal(hit('2001:db8:1:2::2'), true); // same /64, fresh quota
});
