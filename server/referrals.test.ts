import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_ALPHABET, PRICES, checkRedeem, checkSpend, extendPremium, generateCode, isLifetime,
  normalizeCode, parsePromo, parseSpend, rewardDays, type CodeRow,
} from './referrals.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 2);
const code = (o: Partial<CodeRow> = {}): CodeRow => ({
  code: 'K7M2QX', kind: 'invite', ownerId: 'u_owner', days: null, maxUses: null, uses: 0, expiresAt: null, disabled: false, ...o,
});
const ctx = { userId: 'u_me', usedInvite: false, usedThis: false, now: NOW };

test('generateCode uses the alphabet only', () => {
  let i = 0;
  const c = generateCode(6, (n) => i++ % n);
  assert.equal(c.length, 6);
  for (const ch of c) assert.ok(CODE_ALPHABET.includes(ch));
  assert.ok(!/[01OI]/.test(CODE_ALPHABET));
});

test('normalizeCode', () => {
  assert.equal(normalizeCode(' k7m2qx '), 'K7M2QX');
  assert.equal(normalizeCode('K7M2-QX'), 'K7M2QX');
  assert.equal(normalizeCode('k7m2 qx'), 'K7M2QX');
  assert.equal(normalizeCode('SUMMER2026'), 'SUMMER2026');
  assert.equal(normalizeCode('abc'), null); // too short
  assert.equal(normalizeCode('A'.repeat(21)), null); // too long
  assert.equal(normalizeCode('K7M2Q!'), null);
  assert.equal(normalizeCode(42), null);
  assert.equal(normalizeCode(undefined), null);
});

test('checkRedeem: refusals', () => {
  assert.equal(checkRedeem(null, ctx), 'codeUnknown');
  assert.equal(checkRedeem(code({ disabled: true }), ctx), 'codeDisabled');
  assert.equal(checkRedeem(code({ kind: 'promo', ownerId: null, expiresAt: new Date(NOW - 1) }), ctx), 'codeExpired');
  assert.equal(checkRedeem(code({ kind: 'promo', ownerId: null, maxUses: 3, uses: 3 }), ctx), 'codeFull');
  assert.equal(checkRedeem(code({ ownerId: 'u_me' }), ctx), 'codeOwn');
  assert.equal(checkRedeem(code({ kind: 'gift', ownerId: 'u_me', days: 7, maxUses: 1 }), ctx), 'codeOwn');
  assert.equal(checkRedeem(code(), { ...ctx, usedInvite: true }), 'inviteUsed');
  assert.equal(checkRedeem(code({ kind: 'promo', ownerId: null }), { ...ctx, usedThis: true }), 'codeUsed');
  assert.equal(checkRedeem(code({ kind: 'gift', days: 7, maxUses: 1, uses: 1 }), ctx), 'codeFull');
});

test('checkRedeem: accepted', () => {
  assert.equal(checkRedeem(code(), ctx), null);
  assert.equal(checkRedeem(code({ kind: 'promo', ownerId: null, maxUses: 3, uses: 2, expiresAt: new Date(NOW + DAY) }), ctx), null);
  // a used invite does not block a promo
  assert.equal(checkRedeem(code({ kind: 'promo', ownerId: null }), { ...ctx, usedInvite: true }), null);
});

test('rewardDays', () => {
  assert.equal(rewardDays(code()), 7);
  assert.equal(rewardDays(code({ kind: 'gift', days: 30 })), 30);
  assert.equal(rewardDays(code({ kind: 'promo', days: null })), null); // lifetime promo
  assert.equal(rewardDays(code({ kind: 'promo', days: 14 })), 14);
});

test('isLifetime + extendPremium', () => {
  assert.equal(isLifetime({ plan: 'premium', premiumUntil: null }), true);
  assert.equal(isLifetime({ plan: 'premium', premiumUntil: new Date(NOW + DAY) }), false);
  assert.equal(isLifetime({ plan: 'free', premiumUntil: null }), false);
  // free → 7 days from now
  assert.deepEqual(extendPremium({ plan: 'free', premiumUntil: null }, 7, NOW), { plan: 'premium', premiumUntil: new Date(NOW + 7 * DAY) });
  // expired premium → counted from now, not from the old end
  assert.deepEqual(extendPremium({ plan: 'premium', premiumUntil: new Date(NOW - 3 * DAY) }, 7, NOW), { plan: 'premium', premiumUntil: new Date(NOW + 7 * DAY) });
  // running premium → stacked on its end
  assert.deepEqual(extendPremium({ plan: 'premium', premiumUntil: new Date(NOW + 2 * DAY) }, 14, NOW), { plan: 'premium', premiumUntil: new Date(NOW + 16 * DAY) });
  // lifetime (founder or admin-set) → no change
  assert.equal(extendPremium({ plan: 'premium', premiumUntil: null }, 7, NOW), null);
  // a lifetime promo turns anyone lifetime
  assert.deepEqual(extendPremium({ plan: 'free', premiumUntil: null }, null, NOW), { plan: 'premium', premiumUntil: null });
});

test('prices + parseSpend + checkSpend', () => {
  assert.deepEqual(PRICES, { 7: 2, 14: 3, 30: 5 });
  assert.deepEqual(parseSpend({ days: 14, gift: true }), { days: 14, gift: true });
  assert.deepEqual(parseSpend({ days: 7 }), { days: 7, gift: false });
  assert.equal(parseSpend({ days: 10 }), null);
  assert.equal(parseSpend(null), null);
  assert.equal(checkSpend(5, 30, false, false), null);
  assert.equal(checkSpend(4, 30, true, false), 'pointsLow');
  assert.equal(checkSpend(9, 7, false, true), 'pointsLifetime'); // nothing to extend
  assert.equal(checkSpend(9, 7, true, true), null); // gifts are always allowed
});

test('parsePromo', () => {
  assert.deepEqual(parsePromo({ days: 30, maxUses: 100, expiresAt: '2026-12-31T00:00:00Z', note: 'tiktok' }), {
    code: null, days: 30, maxUses: 100, expiresAt: new Date('2026-12-31T00:00:00Z'), note: 'tiktok',
  });
  assert.deepEqual(parsePromo({ code: ' summer26 ', days: null }), { code: 'SUMMER26', days: null, maxUses: null, expiresAt: null, note: '' });
  assert.equal(parsePromo({ days: 0 }), null);
  assert.equal(parsePromo({ days: 7, maxUses: -1 }), null);
  assert.equal(parsePromo({ days: 7, expiresAt: 'nope' }), null);
  assert.equal(parsePromo({ code: 'x!', days: 7 }), null);
  // days must be explicit (even if missing)
  assert.equal(parsePromo({}), null);
  assert.equal(parsePromo({ code: 'X1Y2' }), null);
});
