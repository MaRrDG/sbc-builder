import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertKey, asLang, checkUnsub, chunk, classifySend, decide, evoDigest, evoMail, isDue, isFinal, planAlerts, unsubToken } from './evo-rules.js';

const NOW = Date.UTC(2026, 9, 2, 8);
const row = (o: Partial<Parameters<typeof isDue>[0]> = {}) => ({ endsAt: new Date(NOW - 1000), notifiedAt: null, tries: 0, ready: false, ...o });

test('isDue', () => {
  assert.equal(isDue(row(), NOW), true);
  assert.equal(isDue(row({ endsAt: new Date(NOW + 1000) }), NOW), false); // still training
  assert.equal(isDue(row({ endsAt: new Date(NOW - 25 * 3600e3) }), NOW), false); // ended long ago (downtime)
  assert.equal(isDue(row({ endsAt: null, ready: true }), NOW), false); // only seen ready: no "just finished" moment
  assert.equal(isDue(row({ notifiedAt: new Date(NOW) }), NOW), false);
  assert.equal(isDue(row({ tries: 3 }), NOW), false);
});

test('decide: Premium, emails on, has an address', () => {
  assert.equal(decide({ tier: 'premium', evoEmails: true, email: 'a@b.c' }), 'send');
  assert.equal(decide({ tier: 'free', evoEmails: true, email: 'a@b.c' }), 'skip');
  assert.equal(decide({ tier: 'premium', evoEmails: false, email: 'a@b.c' }), 'skip');
  assert.equal(decide({ tier: 'premium', evoEmails: true, email: '' }), 'skip');
  assert.equal(decide(null), 'skip'); // persona has no owner
});

test('asLang', () => {
  assert.equal(asLang('ro'), 'ro');
  assert.equal(asLang('it'), 'it');
  assert.equal(asLang('de'), 'en');
  assert.equal(asLang(undefined), 'en');
});

test('evoMail per language, escapes EA text in html', () => {
  const d = { player: 'Maxim <b>', evo: 'Trust the Keeper', level: 2, levelCount: 2, evosUrl: 'https://x/dashboard/evolutions', unsubUrl: 'https://x/u' };
  const en = evoMail('en', d);
  assert.match(en.subject, /Maxim/);
  assert.match(en.text, /EA web app/);
  assert.ok(!en.html.includes('<b>') && en.html.includes('&lt;b&gt;'));
  assert.ok(en.html.includes('https://x/u'));
  assert.notEqual(evoMail('ro', d).subject, en.subject);
  assert.notEqual(evoMail('it', d).subject, en.subject);
});

test('unsubscribe token', () => {
  const tok = unsubToken('user_1', 's3cret');
  assert.equal(checkUnsub('user_1', tok, 's3cret'), true);
  assert.equal(checkUnsub('user_2', tok, 's3cret'), false);
  assert.equal(checkUnsub('user_1', tok, 'other'), false);
  assert.equal(checkUnsub('user_1', 'short', 's3cret'), false);
});

const owner = (o: Partial<{ userId: string; email: string; lang: 'en' | 'ro' | 'it'; evoEmails: boolean; tier: 'free' | 'premium' }> = {}) =>
  ({ userId: 'u1', email: 'a@b.c', lang: 'en' as const, evoEmails: true, tier: 'premium' as const, ...o });
const due = (personaId: number, slotId: number, level = 1) => ({ personaId, slotId, level });

test('planAlerts: one mail per owner, skipped rows closed', () => {
  const owners = new Map([[1, owner()], [2, owner()], [3, owner({ userId: 'u2', tier: 'free' })], [4, owner({ userId: 'u3', evoEmails: false })]]);
  const rows = [due(1, 10), due(2, 20), due(1, 11, 2), due(3, 30), due(4, 40), due(5, 50)];
  const { mails, skip } = planAlerts(rows, (p) => owners.get(p) ?? null);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].userId, 'u1');
  assert.deepEqual(mails[0].rows.map((r) => r.slotId), [10, 20, 11]); // both personas of u1, in order
  assert.deepEqual(skip.map((r) => r.slotId), [30, 40, 50]); // free, emails off, no owner
});

test('planAlerts: unknown tier (plan lookup failed) waits, neither sent nor closed', () => {
  const { mails, skip } = planAlerts([due(1, 10)], () => ({ ...owner(), tier: null }));
  assert.deepEqual([mails.length, skip.length], [0, 0]);
});

test('evoDigest: one training reads like evoMail, several are listed', () => {
  const urls = { evosUrl: 'https://x/dashboard/evolutions', unsubUrl: 'https://x/u' };
  const one = { player: 'Maxim', evo: 'Trust the Keeper', level: 2, levelCount: 2 };
  assert.deepEqual(evoDigest('en', [one], urls), evoMail('en', { ...one, ...urls }));
  const many = [one, { player: 'Hazard <i>', evo: 'Wing It', level: 1, levelCount: 3 }];
  for (const lang of ['en', 'ro', 'it'] as const) {
    const m = evoDigest(lang, many, urls);
    assert.match(m.subject, /2/);
    assert.ok(m.text.includes('Maxim') && m.text.includes('Wing It'));
    assert.ok(m.html.includes('&lt;i&gt;') && !m.html.includes('<i>'));
    assert.ok(m.html.includes('https://x/u') && m.text.includes('https://x/u'));
  }
  assert.notEqual(evoDigest('ro', many, urls).subject, evoDigest('en', many, urls).subject);
  const twenty = Array.from({ length: 20 }, () => one);
  assert.match(evoDigest('ro', twenty, urls).subject, /20 de evoluții/); // Romanian: "de" from 20 up
  assert.doesNotMatch(evoDigest('ro', many, urls).subject, / de evoluții/);
});

test('evoMail: last level reads as a finished evolution, an earlier one as a level', () => {
  const urls = { evosUrl: 'https://x/dashboard/evolutions', unsubUrl: 'https://x/u' };
  const done = evoMail('en', { player: 'Maxim', evo: 'Trust the Keeper', level: 2, levelCount: 2, ...urls });
  const step = evoMail('en', { player: 'Maxim', evo: 'Trust the Keeper', level: 1, levelCount: 2, ...urls });
  assert.match(done.subject, /finished Trust the Keeper/);
  assert.match(done.html, /Evolution complete/);
  assert.match(step.subject, /level 1 of 2/);
  assert.match(step.html, /Level 1 of 2 ready/);
  assert.equal(isFinal({ level: 2, levelCount: 2 }), true);
  assert.equal(isFinal({ level: 1, levelCount: 2 }), false);
  assert.equal(isFinal({ level: 1, levelCount: 0 }), false); // levels unknown: don't claim it's over
});

test('evoMail: card image only when rendered, with the "card as it is now" note', () => {
  const base = { player: 'Maxim', evo: 'Trust the Keeper', level: 2, levelCount: 2, evosUrl: 'https://x/e', unsubUrl: 'https://x/u', logoUrl: 'https://x/icon-192.png' };
  const withCard = evoMail('en', { ...base, cardUrl: 'https://x/api/evos/card/abc.png' });
  assert.ok(withCard.html.includes('src="https://x/api/evos/card/abc.png"') && withCard.html.includes('alt="Maxim"'));
  assert.match(withCard.html, /as they are now/);
  const without = evoMail('en', base);
  assert.ok(!without.html.includes('/api/evos/card/') && !without.html.includes('as they are now'));
  for (const m of [withCard, without]) {
    assert.ok(m.html.includes('https://www.ea.com/ea-sports-fc/ultimate-team/web-app/')); // primary: EA web app
    assert.ok(m.html.includes('https://x/e') && m.text.includes('Companion'));
  }
  const many = evoDigest('ro', [{ ...base, cardUrl: 'https://x/c1.png' }, { ...base, level: 1, cardUrl: null }], base);
  assert.ok(many.html.includes('https://x/c1.png') && many.html.includes('Nivelul 1 din 2') && many.html.includes('Evoluție terminată'));
});

test('classifySend', () => {
  assert.deepEqual(classifySend(200, ''), { kind: 'ok', pauseMs: 0 });
  assert.deepEqual(classifySend(429, '', '7'), { kind: 'retry', pauseMs: 7000 }); // rate limit: wait what Resend asks
  assert.equal(classifySend(429, '').pauseMs, 60_000);
  assert.equal(classifySend(429, '{"name":"daily_quota_exceeded"}').pauseMs, 3600_000); // quota: back off long
  assert.deepEqual(classifySend(503, ''), { kind: 'retry', pauseMs: 60_000 });
  assert.deepEqual(classifySend(null, ''), { kind: 'retry', pauseMs: 60_000 }); // network / timeout
  assert.deepEqual(classifySend(422, ''), { kind: 'fail', pauseMs: 0 }); // bad address etc.: counts as a try
});

test('alertKey is stable and order independent', () => {
  const a = alertKey('u1', [due(1, 10), due(2, 20, 2)]);
  assert.equal(a, alertKey('u1', [due(2, 20, 2), due(1, 10)]));
  assert.notEqual(a, alertKey('u2', [due(1, 10), due(2, 20, 2)]));
  assert.notEqual(a, alertKey('u1', [due(1, 10)]));
  assert.ok(a.length <= 256);
});

test('chunk', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 3), []);
});
