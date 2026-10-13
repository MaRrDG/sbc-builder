// Points / invite abuse audit (docs/audit/points-abuse-2026-10.md). `todo` tests prove an open issue;
// plain tests pin a defense that holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { overLinkLimit } from './auth-rules.js';
import { createLimiter } from './limits.js';
import { checkRedeem, GIFT_LIMIT, invitePointAllowed, sharePersona, type CodeRow } from './referrals.js';

const code = (p: Partial<CodeRow> = {}): CodeRow => ({
  code: 'ABCDEF', kind: 'invite', ownerId: 'owner', days: null, maxUses: null, uses: 0, expiresAt: null, disabled: false, ...p,
});
type Ctx = Parameters<typeof checkRedeem>[1];
const ctx = (p: Partial<Ctx> = {}): Ctx => ({ userId: 'alt', usedInvite: false, usedThis: false, now: 0, ...p });

test('holds: own code, a second invite, a used gift and a full code are refused', () => {
  assert.equal(checkRedeem(code(), ctx({ userId: 'owner' })), 'codeOwn');
  assert.equal(checkRedeem(code(), ctx({ usedInvite: true })), 'inviteUsed');
  assert.equal(checkRedeem(code({ kind: 'gift', days: 30, maxUses: 1, uses: 1 }), ctx()), 'codeInvalid');
  assert.equal(checkRedeem(code({ kind: 'gift', days: 30, maxUses: 1 }), ctx({ usedThis: true })), 'codeUsed');
});

test('fixed P1: a gift between two FC Solver accounts on the same EA account is refused', () => {
  // farm-1 and main were both linked to persona 7 (personas or persona_links, either side)
  const gift = code({ kind: 'gift', ownerId: 'farm-1', days: 30, maxUses: 1 });
  const sharesEa = sharePersona([7], [7, 9]);
  assert.equal(checkRedeem(gift, ctx({ userId: 'main', gift: { giftsRecent: 0, sharesEa } })), 'giftSameEa');
  // a real friend on another EA account still can
  assert.equal(checkRedeem(gift, ctx({ userId: 'friend', gift: { giftsRecent: 0, sharesEa: sharePersona([7], [8]) } })), null);
});

test('fixed P1: a receiver redeems at most 2 gifts per 30 days', () => {
  const gift = code({ kind: 'gift', ownerId: 'farm-3', days: 30, maxUses: 1 });
  assert.equal(GIFT_LIMIT, 2);
  assert.equal(checkRedeem(gift, ctx({ userId: 'main', gift: { giftsRecent: 1, sharesEa: false } })), null);
  assert.equal(checkRedeem(gift, ctx({ userId: 'main', gift: { giftsRecent: 2, sharesEa: false } })), 'giftLimit');
});

test('fixed P2: the inviter earns no point when they are or were linked to the invitee\'s persona', () => {
  // users of the persona: current owner, previous owner (takeover) and every persona_links row
  assert.equal(invitePointAllowed('A', ['B', 'A']), false);
  assert.equal(invitePointAllowed('A', ['B']), true);
});

test('fixed R2: unknown, disabled, expired and used-up codes answer the same', () => {
  const answers = [
    checkRedeem(null, ctx()),
    checkRedeem(code({ kind: 'promo', ownerId: null, disabled: true }), ctx()),
    checkRedeem(code({ kind: 'promo', ownerId: null, expiresAt: new Date(-1) }), ctx()),
    checkRedeem(code({ kind: 'promo', ownerId: null, maxUses: 1, uses: 1 }), ctx()),
  ];
  assert.deepEqual(new Set(answers), new Set(['codeInvalid']));
});

test('holds: one EA persona links to at most 3 FC Solver accounts, ever', () => {
  assert.equal(overLinkLimit(['a', 'b'], 'c'), false);
  assert.equal(overLinkLimit(['a', 'b', 'c'], 'd'), true);
  assert.equal(overLinkLimit(['a', 'b', 'c'], 'a'), false); // the owner taking it back is not a new account
});

test('fixed R2: IPv6 addresses of one /64 share a rate-limit bucket', () => {
  const hit = createLimiter({ windowMs: 60_000, max: 1, now: () => 0 });
  assert.equal(hit('2001:db8:1:2::1'), true);
  assert.equal(hit('2001:db8:1:2::2'), false); // same /64, same quota
  assert.equal(hit('::ffff:203.0.113.7'), true);
  assert.equal(hit('203.0.113.7'), false); // a mapped IPv4 is that IPv4
});
