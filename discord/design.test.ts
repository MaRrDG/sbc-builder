import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { assetPath } from './brand.js';
import { CATEGORIES } from './layout.js';
import { COMMUNITY_DESCRIPTION, atLeast, EMOJIS, WELCOME, emojiTag, missingEmojis } from './design.js';

test('emojis: valid Discord names, files present, only missing ones uploaded', () => {
  for (const e of EMOJIS) {
    assert.match(e.name, /^[a-z0-9_]{2,32}$/);
    assert.ok(existsSync(assetPath(e.file)), e.file);
  }
  assert.deepEqual(missingEmojis(['fcs_check', 'other']).map((e) => e.name), ['fcs_fc', 'fcs_lime']);
  assert.deepEqual(missingEmojis(EMOJIS.map((e) => e.name)), []);
});

test('emojiTag: custom emoji when uploaded, unicode fallback otherwise', () => {
  assert.equal(emojiTag(new Map([['fcs_check', '99']]), 'fcs_check', '✅'), '<:fcs_check:99>');
  assert.equal(emojiTag(new Map(), 'fcs_check', '✅'), '✅');
});

test('welcome screen: at most 5 layout channels, short descriptions, unicode emoji', () => {
  assert.ok(WELCOME.channels.length <= 5);
  assert.ok(WELCOME.description.length <= 140);
  assert.ok(COMMUNITY_DESCRIPTION.length <= 120);
  for (const c of WELCOME.channels) {
    assert.ok(CATEGORIES.find((x) => x.name === c.category)?.channels.some((ch) => ch.name === c.channel), c.channel);
    assert.ok(c.description.length <= 42, c.description);
    assert.match(c.emoji, /^\p{Extended_Pictographic}️?$/u);
  }
});

test('atLeast raises to the minimum and never lowers', () => {
  assert.equal(atLeast(0, 1), 1);
  assert.equal(atLeast(1, 1), 1);
  assert.equal(atLeast(3, 1), 3);
  assert.equal(atLeast(undefined, 2), 2);
});
