import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asLang, checkUnsub, decide, evoMail, isDue, unsubToken } from './evo-rules.js';

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
