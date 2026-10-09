import test from 'node:test';
import assert from 'node:assert/strict';
import { publicInvite } from './invite.js';

test('publicInvite', () => {
  assert.equal(publicInvite(' https://discord.gg/abc123 '), 'https://discord.gg/abc123');
  assert.equal(publicInvite('https://discord.com/invite/Ab-c_1'), 'https://discord.com/invite/Ab-c_1');
  assert.equal(publicInvite(undefined), null);
  assert.equal(publicInvite(''), null);
  assert.equal(publicInvite('http://discord.gg/abc'), null);
  assert.equal(publicInvite('https://evil.example/https://discord.gg/abc'), null);
  assert.equal(publicInvite('https://discord.gg/abc?x=1'), null);
  assert.equal(publicInvite('https://discord.gg/'), null);
});
