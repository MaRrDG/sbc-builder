import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRAND } from './brand.js';
import { PICKERS } from './layout.js';
import { BOOST_TITLE, LANGUAGE_TITLE, RULES_TITLE, RULES_TITLE_RO, WELCOME_TITLE, boostPerksMessage, boostThanks, groupOf, languageMessage, memberWelcomeMessage, pickerMenu, pickerMessage, pickerTitle, rulesMessage, welcomeMessage } from './content.js';

test('rules: banner on top, then English and Romanian embeds with 8 rules each, brand author', () => {
  const m = rulesMessage('https://cdn/icon.png');
  assert.equal(m.files.length, 1);
  const [banner, en, ro] = m.embeds.map((e) => e.toJSON());
  assert.equal(banner.image?.url, 'attachment://banner.png');
  assert.equal(en.title, RULES_TITLE);
  assert.equal(ro.title, RULES_TITLE_RO);
  assert.equal(ro.author?.icon_url, 'https://cdn/icon.png');
  assert.equal(ro.color, BRAND.green);
  for (const e of [ro, en]) assert.equal((e.description ?? '').split('\n').filter((l) => /^\*\*\d\.\*\* /.test(l)).length, 8);
  assert.match(en.description ?? '', /React ✅/);
});

test('welcome: English first, then Romanian, links language, rules and roles channels and the site', () => {
  const m = welcomeMessage('https://fcsolver.gg', { language: '000', rules: '111', roles: '222' });
  const e = m.embeds[0].toJSON();
  assert.equal(e.title, WELCOME_TITLE);
  assert.match(e.description ?? '', /<#000>/);
  assert.match(e.description ?? '', /<#111>/);
  assert.ok((e.description ?? '').indexOf('finds the cheapest') < (e.description ?? '').indexOf('găsește'));
  assert.match(e.description ?? '', /<#222>/);
  assert.match(e.description ?? '', /Bine ai venit|găsește/);
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
  assert.equal(groupOf('pick:lang', 'pick'), 'lang');
  assert.equal(groupOf('set:world', 'set'), 'world');
  assert.equal(groupOf('set:world', 'pick'), null);
  assert.equal(groupOf('pick:admin', 'pick'), null);
});

test('language message: English first then Romanian, buttons English and Română with lang:EN / lang:RO', () => {
  const m = languageMessage('<#111>');
  const e = m.embeds[0].toJSON();
  assert.equal(e.title, LANGUAGE_TITLE);
  assert.match(e.description ?? '', /<#111>/);
  assert.ok((e.description ?? '').indexOf('Choose your language') < (e.description ?? '').indexOf('Alege limba'));
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

test('boost perks: English first, then Romanian; Premium while boosting, 12 h grace, link to Linked accounts', () => {
  const m = boostPerksMessage('https://fcsolver.gg');
  const e = m.embeds[0].toJSON();
  assert.equal(e.title, BOOST_TITLE);
  const d = e.description ?? '';
  assert.match(d, /Premium/);
  assert.match(d, /12 h/);
  assert.ok(d.indexOf('while you boost') >= 0 && d.indexOf('while you boost') < d.indexOf('cât timp'));
  assert.match(d, /https:\/\/fcsolver\.gg\/dashboard\/accounts/);
  assert.equal(m.components.length, 1);
});

test('thank-you: pings only the booster; active vs how to activate; English first', () => {
  const on = boostThanks('42', true, 'https://fcsolver.gg');
  assert.deepEqual(on.allowedMentions, { users: ['42'] });
  assert.equal(on.content, '<@42>');
  const d = on.embeds[0].toJSON().description ?? '';
  assert.match(d, /Premium is active/);
  assert.ok(d.indexOf('Thanks') < d.indexOf('Mulțumim'));
  const off = boostThanks('42', false, 'https://fcsolver.gg').embeds[0].toJSON().description ?? '';
  assert.match(off, /https:\/\/fcsolver\.gg\/dashboard\/accounts/);
  assert.doesNotMatch(off, /Premium is active/);
});
