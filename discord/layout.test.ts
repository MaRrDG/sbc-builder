import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { ASSETS, BRAND, assetPath } from './brand.js';
import { CAT, CATEGORIES, CH, PICKERS, ROLE, ROLES, SUPERLIGA, TEAM_COLORS, WORLD_CLUBS, overwritesFor, type RoleIds } from './layout.js';

const ids: RoleIds = { everyone: 'E', bot: 'B', byName: new Map(ROLES.map((r, i) => [r.name.toLowerCase(), `R${i}`])) };
const idOf = (name: string) => ids.byName.get(name.toLowerCase())!;
const allChannels = CATEGORIES.flatMap((c) => c.channels);

test('roles: Admin > Moderator > Member, then languages and clubs; unique names', () => {
  assert.equal(ROLES.length, 38);
  assert.equal(new Set(ROLES.map((r) => r.name.toLowerCase())).size, 38);
  assert.deepEqual(ROLES.slice(0, 3).map((r) => r.name), [ROLE.admin, ROLE.mod, ROLE.member]);
  assert.deepEqual(PICKERS.lang, [ROLE.en, ROLE.ro]);
  assert.deepEqual(ROLES.slice(-2).map((r) => r.name), [ROLE.pendingEn, ROLE.pendingRo]);
  assert.equal(PICKERS.world.length, 15);
  assert.equal(PICKERS.superliga.length, 16);
  for (const names of Object.values(PICKERS)) assert.ok(names.length <= 25, 'a select menu holds 25 options');
});

test('role colours: brand for staff and Member, none for languages and pending roles, club colours for clubs', () => {
  const color = (n: string) => ROLES.find((r) => r.name === n)!.color;
  assert.equal(color(ROLE.admin), BRAND.lime);
  assert.equal(color(ROLE.mod), BRAND.mod);
  assert.equal(color(ROLE.member), BRAND.cream);
  const teams = ROLES.filter((x) => x.group === 'world' || x.group === 'superliga');
  assert.equal(teams.length, WORLD_CLUBS.length + SUPERLIGA.length);
  for (const r of teams) assert.ok(r.color > 0 && r.color <= 0xffffff, r.name);
  assert.deepEqual(Object.keys(TEAM_COLORS).sort(), teams.map((r) => r.name).sort());
  assert.ok(new Set(teams.map((r) => r.color)).size >= teams.length - 1, 'team colours should be distinct');
  for (const r of ROLES.filter((x) => x.group === 'lang')) assert.equal(r.color, 0, r.name);
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
  assert.equal(allChannels.find((c) => c.name === CH.rules)?.access, 'rules');
  assert.equal(allChannels.find((c) => c.name === CH.language)?.access, 'everyone');
});

test('English first: INFO, ENGLISH, ROMÂNĂ, VOICE, STAFF; the language channel opens INFO', () => {
  assert.deepEqual(CATEGORIES.map((c) => c.name), [CAT.info, CAT.en, CAT.ro, CAT.voice, CAT.staff]);
  assert.equal(CATEGORIES[0].channels[0].name, CH.language);
  const everyone = allChannels.filter((c) => (c.access ?? CATEGORIES.find((x) => x.channels.includes(c))!.access) === 'everyone');
  assert.deepEqual(everyone.map((c) => c.name), [CH.language], 'new joiners see exactly one channel');
});

test('brand assets are in the repo', () => {
  for (const f of Object.values(ASSETS)) assert.ok(existsSync(assetPath(f)), f);
});

test('#language: everyone reads, nobody writes or adds new reactions, the bot writes and attaches', () => {
  const [everyone, bot] = overwritesFor('everyone', 'text', true, ids);
  assert.deepEqual(everyone.allow, ['ViewChannel', 'ReadMessageHistory']);
  assert.ok(everyone.deny.includes('SendMessages') && everyone.deny.includes('AddReactions'));
  assert.equal(bot.id, 'B');
  assert.ok(['SendMessages', 'AddReactions', 'AttachFiles'].every((p) => bot.allow.includes(p as never)));
});

test('#rules: hidden from everyone, read by Pending EN / RO and Member (no new reactions, no writing), staff manages', () => {
  const o = overwritesFor('rules', 'text', true, ids);
  assert.deepEqual(o.find((x) => x.id === 'E')?.deny, ['ViewChannel']);
  for (const r of [ROLE.pendingEn, ROLE.pendingRo, ROLE.member]) {
    const x = o.find((y) => y.id === idOf(r))!;
    assert.ok(x.allow.includes('ViewChannel'), r);
    assert.ok(x.deny.includes('SendMessages') && x.deny.includes('AddReactions'), r);
  }
  for (const r of [ROLE.en, ROLE.ro]) assert.equal(o.find((y) => y.id === idOf(r)), undefined, r);
  assert.ok(o.find((x) => x.id === idOf(ROLE.mod))?.allow.includes('ManageMessages'));
});

test('language areas: only the real EN / RO role opens them; Pending roles open nothing else', () => {
  for (const [access, role] of [['en', ROLE.en], ['ro', ROLE.ro]] as const) {
    const o = overwritesFor(access, 'category', false, ids);
    assert.deepEqual(o.filter((x) => x.allow.includes('ViewChannel') && x.id !== 'B' && x.id !== idOf(ROLE.mod)).map((x) => x.id), [idOf(role)]);
  }
  for (const access of ['member', 'en', 'ro', 'staff'] as const)
    for (const p of [ROLE.pendingEn, ROLE.pendingRo]) assert.equal(overwritesFor(access, 'text', false, ids).find((x) => x.id === idOf(p)), undefined);
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

test('team colours read on Discord dark: contrast against #313338 is at least 3:1 (WCAG)', () => {
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (h: number) => 0.2126 * lin((h >> 16) & 255) + 0.7152 * lin((h >> 8) & 255) + 0.0722 * lin(h & 255);
  const bg = lum(0x313338);
  for (const [name, h] of Object.entries(TEAM_COLORS)) {
    const l = lum(h);
    assert.ok((Math.max(l, bg) + 0.05) / (Math.min(l, bg) + 0.05) >= 3, `${name} ${h.toString(16)}`);
  }
});
