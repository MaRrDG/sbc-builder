import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alreadyAnnounced, dailyMessage, dailyPost } from './daily.js';

test('post: content line, brand embed with the banner, button to /daily, no pings', () => {
  const p = dailyPost(42, 'https://fcsolver.gg', 'https://cdn/icon.png');
  assert.equal(p.content, dailyMessage(42, 'https://fcsolver.gg'));
  const e = p.embeds[0].toJSON();
  assert.equal(e.title, 'Daily #42');
  assert.equal(e.image?.url, 'attachment://banner.png');
  assert.equal(p.files.length, 1);
  assert.equal((p.components[0].toJSON().components[0] as { url?: string }).url, 'https://fcsolver.gg/daily');
  assert.deepEqual(p.allowedMentions, { parse: [] });
});

test('message: both languages, link to /daily, no answer', () => {
  const m = dailyMessage(42, 'https://fcsolver.gg');
  assert.match(m, /Daily #42 is live/);
  assert.match(m, /Daily #42 a început/);
  assert.equal(m.match(/https:\/\/fcsolver\.gg\/daily/g)?.length, 2);
});

test('already announced only by the bot itself, for exactly that day', () => {
  const bot = 'B';
  assert.equal(alreadyAnnounced([{ authorId: bot, content: dailyMessage(42, 'x') }], 42, bot), true);
  assert.equal(alreadyAnnounced([{ authorId: 'U', content: 'Daily #42 is live' }], 42, bot), false);
  assert.equal(alreadyAnnounced([{ authorId: bot, content: dailyMessage(420, 'x') }], 42, bot), false);
  assert.equal(alreadyAnnounced([{ authorId: bot, content: dailyMessage(4, 'x') }], 42, bot), false);
  assert.equal(alreadyAnnounced([], 42, bot), false);
});
