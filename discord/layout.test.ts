import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { ASSETS, BRAND, assetPath } from './brand.js';
import { CAT, CATEGORIES, CH, PICKERS, ROLE, ROLES, overwritesFor, type RoleIds } from './layout.js';

const ids: RoleIds = { everyone: 'E', bot: 'B', byName: new Map(ROLES.map((r, i) => [r.name.toLowerCase(), `R${i}`])) };
const idOf = (name: string) => ids.byName.get(name.toLowerCase())!;
const allChannels = CATEGORIES.flatMap((c) => c.channels);

test('roles: Admin > Moderator > Member, then languages and clubs; unique names', () => {
  assert.equal(ROLES.length, 36);
  assert.equal(new Set(ROLES.map((r) => r.name.toLowerCase())).size, 36);
  assert.deepEqual(ROLES.slice(0, 3).map((r) => r.name), [ROLE.admin, ROLE.mod, ROLE.member]);
  assert.equal(PICKERS.world.length, 15);
  assert.equal(PICKERS.superliga.length, 16);
  for (const names of Object.values(PICKERS)) assert.ok(names.length <= 25, 'a select menu holds 25 options');
});

test('role colours: brand for staff and Member, none for languages and clubs (names stay readable)', () => {
  const color = (n: string) => ROLES.find((r) => r.name === n)!.color;
  assert.equal(color(ROLE.admin), BRAND.lime);
  assert.equal(color(ROLE.mod), BRAND.mod);
  assert.equal(color(ROLE.member), BRAND.cream);
  for (const r of ROLES.filter((x) => x.group)) assert.equal(r.color, 0, r.name);
});

test('one naming style: "<emoji>・name" text, "🔊 Name" voice, "━━ NAME ━━" categories', () => {
  for (const cat of CATEGORIES) {
    assert.match(cat.name, /^━━ [A-ZĂÂÎȘȚ]+ ━━$/u, cat.name);
    const keys = cat.channels.map((c) => `${c.kind}:${c.name.toLowerCase()}`);
    assert.equal(new Set(keys).size, keys.length, cat.name);
  }
  for (const c of allChannels) {
    if (c.kind === 'voice') assert.match(c.name, /^🔊 \S/u, c.name);
    else assert.match(c.name, /^\p{Extended_Pictographic}️?・[a-z0-9-]+$/u, c.name);
  }
});

test('info channels are read-only; help channels have slowmode; announcements is an Announcement channel', () => {
  for (const c of CATEGORIES.find((x) => x.name === CAT.info)!.channels) assert.equal(c.readOnly, true, c.name);
  assert.equal(allChannels.find((c) => c.name === CH.announcements)?.kind, 'announcement');
  assert.ok(allChannels.filter((c) => (c.slowmode ?? 0) > 0).length >= 6);
  assert.equal(allChannels.find((c) => c.name === CH.rules)?.access, 'everyone');
});

test('brand assets are in the repo', () => {
  for (const f of Object.values(ASSETS)) assert.ok(existsSync(assetPath(f)), f);
});

test('#rules: everyone reads, nobody writes or adds new reactions, the bot writes and attaches', () => {
  const [everyone, bot] = overwritesFor('everyone', 'text', true, ids);
  assert.deepEqual(everyone.allow, ['ViewChannel', 'ReadMessageHistory']);
  assert.ok(everyone.deny.includes('SendMessages') && everyone.deny.includes('AddReactions'));
  assert.equal(bot.id, 'B');
  assert.ok(['SendMessages', 'AddReactions', 'AttachFiles'].every((p) => bot.allow.includes(p as never)));
});

test('member area: hidden from everyone, visible to Member and Moderator', () => {
  const o = overwritesFor('member', 'category', false, ids);
  assert.deepEqual(o.find((x) => x.id === 'E')?.deny, ['ViewChannel']);
  assert.ok(o.find((x) => x.id === idOf(ROLE.member))?.allow.includes('ViewChannel'));
  assert.ok(o.find((x) => x.id === idOf(ROLE.mod))?.allow.includes('ManageMessages'));
});

test('read-only text and announcement channels deny writing; voice allows Connect', () => {
  for (const kind of ['text', 'announcement'] as const) assert.ok(overwritesFor('ro', kind, true, ids).find((x) => x.id === idOf(ROLE.ro))!.deny.includes('SendMessages'));
  const voice = overwritesFor('en', 'voice', false, ids).find((x) => x.id === idOf(ROLE.en))!;
  assert.ok(voice.allow.includes('Connect') && voice.deny.length === 0);
});

test('staff area: only Moderator (Admins see all by Administrator)', () => {
  assert.deepEqual(overwritesFor('staff', 'text', false, ids).map((x) => x.id), ['E', idOf(ROLE.mod), 'B']);
});

test('a missing role is a clear error', () => {
  assert.throws(() => overwritesFor('ro', 'text', false, { ...ids, byName: new Map() }), /role "RO" is missing/);
});
