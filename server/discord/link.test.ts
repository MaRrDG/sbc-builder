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

import { unlinkedDiscordEmailIds } from './link.js';
const em = (id: string, strategy: string, types: string[]) => ({
  id,
  verification: { strategy },
  linkedTo: types.map((t) => ({ id: 'idn_' + t, type: t })),
});

test('leftover unlinked discord email is deleted', () => {
  assert.deepEqual(unlinkedDiscordEmailIds([em('e1', 'from_oauth_google', ['oauth_google']), em('e2', 'from_oauth_discord', [])], 'e1'), ['e2']);
});
test('currently linked discord email is kept (Clerk forbids deleting it)', () => {
  assert.deepEqual(unlinkedDiscordEmailIds([em('e2', 'from_oauth_discord', ['oauth_discord'])], 'e1'), []);
});
test('primary email is never deleted', () => {
  assert.deepEqual(unlinkedDiscordEmailIds([em('e2', 'from_oauth_discord', [])], 'e2'), []);
});
test('google-linked and non-discord emails are kept', () => {
  assert.deepEqual(unlinkedDiscordEmailIds([em('e3', 'from_oauth_discord', ['oauth_google']), em('e4', 'email_code', [])], 'e1'), []);
});
