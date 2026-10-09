import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { ASSETS, BRAND, assetPath } from './brand.js';
import { ADMIN_PERMISSIONS, CAT, commandRedirect, CATEGORIES, CH, PICKERS, ROLE, ROLES, SUPERLIGA, TEAM_COLORS, WORLD_CLUBS, overwritesFor, type RoleIds } from './layout.js';

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
  assert.equal(allChannels.find((c) => c.name === CH.rules)?.access, 'rulesEn');
  assert.equal(allChannels.find((c) => c.name === CH.rulesRo)?.access, 'rulesRo');
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
  const o = overwritesFor('everyone', 'text', true, ids);
  const everyone = o.find((x) => x.id === 'E')!;
  const bot = o.find((x) => x.id === 'B')!;
  assert.deepEqual(everyone.allow, ['ViewChannel', 'ReadMessageHistory']);
  assert.ok(everyone.deny.includes('SendMessages') && everyone.deny.includes('AddReactions'));
  assert.ok(['SendMessages', 'AddReactions', 'AttachFiles'].every((p) => bot.allow.includes(p as never)));
});

test('onboarding channels: Member, Moderator and Admin are denied View, no verified role is allowed', () => {
  for (const access of ['everyone', 'rulesEn', 'rulesRo'] as const) {
    const o = overwritesFor(access, 'text', true, ids);
    for (const r of [ROLE.member, ROLE.mod, ROLE.admin]) assert.deepEqual(o.find((x) => x.id === idOf(r)), { id: idOf(r), allow: [], deny: ['ViewChannel'] }, `${access} ${r}`);
    for (const r of [ROLE.en, ROLE.ro]) assert.equal(o.find((x) => x.id === idOf(r)), undefined, `${access} ${r}`);
    assert.ok(o.find((x) => x.id === 'B')!.allow.includes('ViewChannel'));
  }
});

test('rules channels: hidden from everyone, each read only by its Pending role, no reactions or writing', () => {
  for (const [access, seen, unseen] of [
    ['rulesEn', ROLE.pendingEn, [ROLE.pendingRo, ROLE.ro, ROLE.en]],
    ['rulesRo', ROLE.pendingRo, [ROLE.pendingEn, ROLE.en, ROLE.ro]],
  ] as const) {
    const o = overwritesFor(access, 'text', true, ids);
    assert.ok(o.find((x) => x.id === 'E')?.deny.includes('ViewChannel'));
    const x = o.find((y) => y.id === idOf(seen))!;
    assert.ok(x.allow.includes('ViewChannel'));
    assert.ok(x.deny.includes('SendMessages') && x.deny.includes('AddReactions'));
    for (const r of unseen) assert.equal(o.find((y) => y.id === idOf(r)), undefined, r);
  }
});

test('Admin has an explicit permission set, never Administrator; staff roles are hoisted', () => {
  const admin = ROLES.find((r) => r.name === ROLE.admin)!;
  assert.ok(!(admin.permissions as string[]).includes('Administrator'));
  assert.deepEqual(admin.permissions, ADMIN_PERMISSIONS);
  for (const p of ['ManageGuild', 'ManageRoles', 'ManageChannels', 'BanMembers', 'KickMembers', 'ViewAuditLog', 'MentionEveryone']) assert.ok(admin.permissions.includes(p as never), p);
  for (const r of [ROLE.admin, ROLE.mod, ROLE.member]) assert.equal(ROLES.find((x) => x.name === r)!.hoist, true, r);
  assert.ok(ROLES.filter((x) => ![ROLE.admin, ROLE.mod, ROLE.member].includes(x.name as never)).every((x) => !x.hoist));
});

test('language areas: only the real EN / RO role opens them; Pending roles open nothing else', () => {
  for (const [access, role] of [['en', ROLE.en], ['ro', ROLE.ro]] as const) {
    const o = overwritesFor(access, 'category', false, ids);
    assert.deepEqual(o.filter((x) => x.allow.includes('ViewChannel') && x.id !== 'B' && x.id !== idOf(ROLE.mod) && x.id !== idOf(ROLE.admin)).map((x) => x.id), [idOf(role)]);
  }
  for (const access of ['member', 'en', 'ro', 'staff'] as const)
    for (const p of [ROLE.pendingEn, ROLE.pendingRo]) assert.equal(overwritesFor(access, 'text', false, ids).find((x) => x.id === idOf(p)), undefined);
});

test('member area: hidden from everyone, visible to Member, Moderator and Admin', () => {
  const o = overwritesFor('member', 'category', false, ids);
  assert.ok(o.find((x) => x.id === 'E')?.deny.includes('ViewChannel'));
  assert.ok(o.find((x) => x.id === idOf(ROLE.member))?.allow.includes('ViewChannel'));
  assert.ok(o.find((x) => x.id === idOf(ROLE.mod))?.allow.includes('ManageMessages'));
});

test('read-only text and announcement channels deny writing; voice allows Connect', () => {
  for (const kind of ['text', 'announcement'] as const) assert.ok(overwritesFor('ro', kind, true, ids).find((x) => x.id === idOf(ROLE.ro))!.deny.includes('SendMessages'));
  const voice = overwritesFor('en', 'voice', false, ids).find((x) => x.id === idOf(ROLE.en))!;
  assert.ok(voice.allow.includes('Connect') && voice.deny.length === 0);
});

test('staff area: Moderator and Admin (Admin no longer bypasses with Administrator)', () => {
  assert.deepEqual(overwritesFor('staff', 'text', false, ids).map((x) => x.id), ['E', idOf(ROLE.mod), idOf(ROLE.admin), 'B']);
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

test('commands channels: @everyone may use application commands only there, denied everywhere else', () => {
  const spec = allChannels.filter((c) => c.commands);
  assert.deepEqual(spec.map((c) => c.name), [CH.commandsEn, CH.commandsRo]);
  assert.deepEqual(CATEGORIES.filter((c) => c.channels.some((x) => x.commands)).map((c) => c.name), [CAT.en, CAT.ro]);
  for (const cat of CATEGORIES)
    for (const c of cat.channels) {
      const o = overwritesFor(c.access ?? cat.access, c.kind, !!c.readOnly, ids, !!c.polls, !!c.commands).find((x) => x.id === 'E')!;
      assert.equal(o.allow.includes('UseApplicationCommands'), !!c.commands, c.name);
      assert.equal(o.deny.includes('UseApplicationCommands'), !c.commands, c.name);
    }
});

test('command redirect: allowed in the commands channels, else the one of the user language (RO-only -> comenzi)', () => {
  assert.equal(commandRedirect(CH.commandsEn, []), null);
  assert.equal(commandRedirect(CH.commandsRo, [ROLE.en]), null);
  assert.equal(commandRedirect(CH.sbcEn, [ROLE.member, ROLE.en]), CH.commandsEn);
  assert.equal(commandRedirect(CH.sbcRo, [ROLE.member, ROLE.ro]), CH.commandsRo);
  assert.equal(commandRedirect(null, [ROLE.ro, ROLE.en]), CH.commandsEn);
  assert.equal(commandRedirect('x', []), CH.commandsEn);
});

test('polls channel: only Admin (besides the bot) may use application commands', () => {
  const o = overwritesFor('member', 'text', true, ids, true);
  assert.deepEqual(o.filter((x) => x.allow.includes('UseApplicationCommands')).map((x) => x.id), [idOf(ROLE.admin)]);
  assert.ok(o.find((x) => x.id === 'E')!.deny.includes('UseApplicationCommands'));
});
