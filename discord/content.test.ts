import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRAND } from './brand.js';
import { PICKERS } from './layout.js';
import { BOOST_TITLE, LANGUAGE_TITLE, RULES_TITLE, RULES_TITLE_RO, WELCOME_TITLE, boostPerksMessage, boostThanks, groupOf, languageMessage, memberWelcomeMessage, pickerMenu, pickerMessage, pickerTitle, rulesMessage, welcomeMessage } from './content.js';

test('rules: per language, banner on top then one embed with 8 rules and only the accept line, brand author', () => {
  for (const [lang, title, accept, other] of [['en', RULES_TITLE, /React ✅/, /Reacționează/], ['ro', RULES_TITLE_RO, /Reacționează cu ✅/, /React ✅ to/]] as const) {
    const m = rulesMessage(lang, 'https://cdn/icon.png');
    assert.equal(m.files.length, 1);
    assert.equal(m.embeds.length, 2);
    const [banner, e] = m.embeds.map((x) => x.toJSON());
    assert.equal(banner.image?.url, 'attachment://banner.png');
    assert.equal(e.title, title);
    assert.equal(e.author?.icon_url, 'https://cdn/icon.png');
    assert.equal(e.color, BRAND.green);
    const d = e.description ?? '';
    assert.equal(d.split('\n').filter((l) => /^\*\*\d\.\*\* /.test(l)).length, 8);
    assert.match(d, accept);
    assert.doesNotMatch(d, other);
    assert.doesNotMatch(d, /language|limba/i);
    assert.ok(d.trim().endsWith('**'));
  }
});

test('welcome: English only, links language, rules and roles channels and the site', () => {
  const m = welcomeMessage('https://fcsolver.gg', { language: '000', rules: '111', rulesRo: '333', roles: '222' });
  const e = m.embeds[0].toJSON();
  assert.equal(e.title, WELCOME_TITLE);
  assert.match(e.description ?? '', /<#000>/);
  assert.match(e.description ?? '', /<#111>/);
  assert.match(e.description ?? '', /<#333>/);
  assert.match(e.description ?? '', /finds the cheapest/);
  assert.doesNotMatch(e.description ?? '', /găsește|Citește/);
  assert.match(e.description ?? '', /<#222>/);
  assert.equal((m.components[0].toJSON().components[0] as { url?: string }).url, 'https://fcsolver.gg');
});

test('picker message: titled per group, one button pick:<group>', () => {
  const m = pickerMessage('world');
  assert.equal(m.embeds[0].toJSON().title, pickerTitle('world'));
  const button = m.components[0].toJSON().components[0] as { custom_id?: string };
  assert.equal(button.custom_id, 'pick:world');
});

test('picker menu: every role of the group, pre-ticked with what the member has, 0..all', () => {
  const menu = pickerMenu('superliga', new Set(['FCSB'])).toJSON().components[0] as {
    custom_id: string; min_values: number; max_values: number; options: { value: string; default?: boolean }[];
  };
  assert.equal(menu.custom_id, 'set:superliga');
  assert.equal(menu.min_values, 0);
  assert.equal(menu.max_values, PICKERS.superliga.length);
  assert.deepEqual(menu.options.filter((o) => o.default).map((o) => o.value), ['FCSB']);
});

test('groupOf accepts only known groups with the right prefix', () => {
  assert.equal(groupOf('pick:lang', 'pick'), null); // the language picker is gone
  assert.equal(groupOf('set:world', 'set'), 'world');
  assert.equal(groupOf('set:world', 'pick'), null);
  assert.equal(groupOf('pick:admin', 'pick'), null);
});

test('language message: English only, buttons English and Română with lang:EN / lang:RO', () => {
  const m = languageMessage({ en: '<#111>', ro: '<#333>' });
  const e = m.embeds[0].toJSON();
  assert.equal(e.title, LANGUAGE_TITLE);
  assert.match(e.description ?? '', /<#111>/);
  assert.match(e.description ?? '', /Choose your language/);
  assert.match(e.description ?? '', /<#333>/);
  assert.doesNotMatch(e.description ?? '', /Alege limba/);
  const buttons = m.components[0].toJSON().components as { custom_id?: string; label?: string }[];
  assert.deepEqual(buttons.map((b) => [b.label, b.custom_id]), [['English', 'lang:EN'], ['Română', 'lang:RO']]);
});

test('member welcome: mentions the member, English only, count, only that user may be mentioned', () => {
  const m = memberWelcomeMessage('42', 1234, 'https://cdn/icon.png');
  const e = m.embeds[0].toJSON();
  const text = e.description ?? '';
  assert.match(text, /<@42>/);
  assert.match(text, /#1234/);
  assert.match(text, /^👋 Welcome/);
  assert.doesNotMatch(text, /Bine ai venit|<#/);
  assert.equal(e.author?.icon_url, 'https://cdn/icon.png');
  assert.deepEqual(m.allowedMentions, { parse: [], users: ['42'] });
});

test('boost perks: English only; Premium while boosting, 12 h grace, link to Linked accounts', () => {
  const m = boostPerksMessage('https://fcsolver.gg');
  const e = m.embeds[0].toJSON();
  assert.equal(e.title, BOOST_TITLE);
  const d = e.description ?? '';
  assert.match(d, /Premium/);
  assert.match(d, /12 h/);
  assert.match(d, /while you boost/);
  assert.doesNotMatch(d, /cât timp/);
  assert.match(d, /https:\/\/fcsolver\.gg\/dashboard\/accounts/);
  assert.equal(m.components.length, 1);
});

test('thank-you: pings only the booster; active vs how to activate; English only', () => {
  const on = boostThanks('42', true, 'https://fcsolver.gg');
  assert.deepEqual(on.allowedMentions, { users: ['42'] });
  assert.equal(on.content, '<@42>');
  const d = on.embeds[0].toJSON().description ?? '';
  assert.match(d, /Premium is active/);
  assert.match(d, /Thanks/);
  assert.doesNotMatch(d, /Mulțumim/);
  const off = boostThanks('42', false, 'https://fcsolver.gg').embeds[0].toJSON().description ?? '';
  assert.match(off, /https:\/\/fcsolver\.gg\/dashboard\/accounts/);
  assert.doesNotMatch(off, /Premium is active/);
});
