import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.js';

const TOKEN = 'a'.repeat(40);
const base = { DISCORD_TOKEN: 'secret-token-value', DISCORD_APP_ID: '1', DISCORD_GUILD_ID: '2', BOT_API_TOKEN: TOKEN };

test('defaults and trailing slashes', () => {
  const c = loadConfig({ ...base, SITE_URL: 'https://fcsolver.gg/' });
  assert.equal(c.apiUrl, 'http://127.0.0.1:5178');
  assert.equal(c.siteUrl, 'https://fcsolver.gg');
  assert.equal(c.apiToken, TOKEN);
});

test('a missing variable names the variable, never a value', () => {
  assert.throws(() => loadConfig({ ...base, SITE_URL: 'https://x.gg', DISCORD_GUILD_ID: '' }), (e: Error) => /DISCORD_GUILD_ID is not set/.test(e.message) && !e.message.includes('secret-token-value'));
});

test('SITE_URL is required', () => {
  assert.throws(() => loadConfig({ ...base }), /SITE_URL is not set/);
});

test('BOT_API_TOKEN is required and at least 32 chars, never echoed', () => {
  assert.throws(() => loadConfig({ ...base, SITE_URL: 'https://x.gg', BOT_API_TOKEN: '' }), /BOT_API_TOKEN/);
  assert.throws(() => loadConfig({ ...base, SITE_URL: 'https://x.gg', BOT_API_TOKEN: 'short-secret' }), (e: Error) => /BOT_API_TOKEN/.test(e.message) && !e.message.includes('short-secret'));
});
