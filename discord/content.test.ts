import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BRAND } from './brand.js';
import { PICKERS } from './layout.js';
import { RULES_TITLE, WELCOME_TITLE, groupOf, pickerMenu, pickerMessage, pickerTitle, rulesMessage, welcomeMessage } from './content.js';

test('rules: banner on top, then Romanian and English embeds with 8 rules each, brand author', () => {
  const m = rulesMessage('https://cdn/icon.png');
  assert.equal(m.files.length, 1);
  const [banner, ro, en] = m.embeds.map((e) => e.toJSON());
  assert.equal(banner.image?.url, 'attachment://banner.png');
  assert.equal(ro.title, RULES_TITLE);
  assert.equal(ro.author?.icon_url, 'https://cdn/icon.png');
  assert.equal(ro.color, BRAND.green);
  for (const e of [ro, en]) assert.equal((e.description ?? '').split('\n').filter((l) => /^\*\*\d\.\*\* /.test(l)).length, 8);
  assert.match(en.description ?? '', /React ✅/);
});

test('welcome: bilingual, links the rules and roles channels and the site', () => {
  const m = welcomeMessage('https://fcsolver.gg', { rules: '111', roles: '222' });
  const e = m.embeds[0].toJSON();
  assert.equal(e.title, WELCOME_TITLE);
  assert.match(e.description ?? '', /<#111>/);
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
