import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from './config.js';

const base = { DISCORD_TOKEN: 'secret-token-value', DISCORD_APP_ID: '1', DISCORD_GUILD_ID: '2' };

test('defaults and trailing slashes', () => {
  const c = loadConfig({ ...base, SITE_URL: 'https://fcsolver.gg/' });
  assert.equal(c.apiUrl, 'http://127.0.0.1:5178');
  assert.equal(c.siteUrl, 'https://fcsolver.gg');
  assert.equal(c.apiToken, '');
});

test('a missing variable names the variable, never a value', () => {
  assert.throws(() => loadConfig({ ...base, DISCORD_GUILD_ID: '' }), (e: Error) => /DISCORD_GUILD_ID is not set/.test(e.message) && !e.message.includes('secret-token-value'));
});
