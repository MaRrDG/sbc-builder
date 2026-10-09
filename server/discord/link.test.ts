import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discordAccountIds, discordAccountOf, isDiscordId, pickPersona } from './link.js';

const discord = (over: object = {}) => ({
  id: 'eac_1', provider: 'oauth_discord', providerUserId: '123456789012345678', username: 'mario', verification: { status: 'verified' }, ...over,
});

test('a verified Discord account gives the Discord user id and name', () => {
  assert.deepEqual(discordAccountOf([{ id: 'g', provider: 'oauth_google', providerUserId: 'x' }, discord()]), {
    externalId: 'eac_1', discordId: '123456789012345678', username: 'mario',
  });
});

test('the provider may be named "discord" or "oauth_discord"', () => {
  assert.equal(discordAccountOf([discord({ provider: 'discord' })])?.discordId, '123456789012345678');
});

test('an unverified (abandoned) or malformed account never links', () => {
  assert.equal(discordAccountOf([discord({ verification: { status: 'unverified' } })]), null);
  assert.equal(discordAccountOf([discord({ verification: { status: 'failed' } })]), null);
  assert.equal(discordAccountOf([discord({ verification: null })]), null);
  assert.equal(discordAccountOf([discord({ providerUserId: 'abc' })]), null);
  assert.equal(discordAccountOf([]), null);
});

test('an unverified account before a verified one is skipped, not chosen', () => {
  assert.equal(discordAccountOf([discord({ id: 'eac_0', verification: { status: 'unverified' } }), discord()])?.externalId, 'eac_1');
});

test('all Discord accounts are removed on disconnect, verified or not', () => {
  assert.deepEqual(discordAccountIds([discord(), discord({ id: 'eac_2', verification: null }), { id: 'g', provider: 'oauth_google', providerUserId: 'x' }]), ['eac_1', 'eac_2']);
});

test('isDiscordId accepts 17-20 digit snowflakes only', () => {
  assert.equal(isDiscordId('12345678901234567'), true);
  assert.equal(isDiscordId('12345678901234567890'), true);
  assert.equal(isDiscordId('1234567890123456'), false);
  assert.equal(isDiscordId('123456789012345678901'), false);
  assert.equal(isDiscordId('12345678901234567a'), false);
});

test('persona: the most recently linked, else none', () => {
  assert.equal(pickPersona([]), null);
  assert.equal(pickPersona([{ personaId: 1, linkedAt: 10 }, { personaId: 2, linkedAt: 20 }]), 2);
  assert.equal(pickPersona([{ personaId: 2, linkedAt: 20 }, { personaId: 1, linkedAt: 10 }]), 2);
});

import { discordOnlyEmailIds } from './link.js';
const ext = [{ id: 'idn_d', provider: 'oauth_discord', providerUserId: '1' }];
const em = (id: string, types: string[]) => ({ id, linkedTo: types.map((t) => ({ id: t === 'oauth_discord' ? 'idn_d' : 'idn_g', type: t })) });

test('discord-only non-primary email is deleted', () => {
  assert.deepEqual(discordOnlyEmailIds([em('e1', []), em('e2', ['oauth_discord'])], ext, 'e1'), ['e2']);
});
test('primary email is never deleted', () => {
  assert.deepEqual(discordOnlyEmailIds([em('e2', ['oauth_discord'])], ext, 'e2'), []);
});
test('google-linked and shared discord+google emails are kept', () => {
  assert.deepEqual(discordOnlyEmailIds([em('e3', ['oauth_google']), em('e4', ['oauth_discord', 'oauth_google'])], ext, 'e1'), []);
});
