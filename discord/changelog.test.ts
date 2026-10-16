import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alreadyPosted, changelogMessage, changelogPost, toPost, type BotEntry } from './changelog.js';

const entry = (id: string, items = ['a']): BotEntry => ({ id, date: id.slice(0, 10), items });
const bot = 'B';
const posted = (...ids: string[]) => ids.map((id) => ({ authorId: bot, content: changelogMessage(id) }));

test('post: content line, title with v1 and the date, bullets, button to /changelog, no pings', () => {
  const p = changelogPost(entry('2026-10-12', ['First', 'Second']), 'https://fcsolver.gg/', 'https://cdn/icon.png');
  assert.equal(p.content, 'Changelog 2026-10-12');
  const e = p.embeds[0].toJSON();
  assert.equal(e.title, 'FC Solver v1 · 12 Oct 2026');
  const v = changelogPost({ ...entry('2026-10-16'), version: '1.2.0' }, 'https://fcsolver.gg/').embeds[0].toJSON();
  assert.equal(v.title, 'FC Solver v1.2.0 · 16 Oct 2026');
  assert.equal(e.url, 'https://fcsolver.gg/changelog');
  assert.equal(e.description, '• First\n• Second');
  assert.equal((p.components[0].toJSON().components[0] as { url?: string }).url, 'https://fcsolver.gg/changelog');
  assert.deepEqual(p.allowedMentions, { parse: [] });
});

test('post: a very long entry stays under the embed limit', () => {
  const p = changelogPost(entry('2026-10-12', Array.from({ length: 80 }, () => 'x'.repeat(100))), 'https://x');
  assert.ok((p.embeds[0].toJSON().description ?? '').length <= 4000);
});

test('already posted: only the bot itself, exactly that id', () => {
  assert.equal(alreadyPosted(posted('2026-10-12'), '2026-10-12', bot), true);
  assert.equal(alreadyPosted([{ authorId: 'U', content: 'Changelog 2026-10-12' }], '2026-10-12', bot), false);
  assert.equal(alreadyPosted(posted('2026-10-12-2'), '2026-10-12', bot), false);
  assert.equal(alreadyPosted(posted('2026-10-12'), '2026-10-12-2', bot), false);
  assert.equal(alreadyPosted([], '2026-10-12', bot), false);
});

test('toPost: first run posts only the newest entry', () => {
  const list = [entry('2026-10-14'), entry('2026-10-13'), entry('2026-10-12')];
  assert.deepEqual(toPost(list, [], bot).map((e) => e.id), ['2026-10-14']);
  assert.deepEqual(toPost(list, [{ authorId: 'U', content: 'hi' }], bot).map((e) => e.id), ['2026-10-14']);
});

test('toPost: later runs post what is missing, oldest first; nothing twice', () => {
  const list = [entry('2026-10-14'), entry('2026-10-13-2'), entry('2026-10-13'), entry('2026-10-12')];
  assert.deepEqual(toPost(list, posted('2026-10-12'), bot).map((e) => e.id), ['2026-10-13', '2026-10-13-2', '2026-10-14']);
  assert.deepEqual(toPost(list, posted('2026-10-13', '2026-10-12'), bot).map((e) => e.id), ['2026-10-13-2', '2026-10-14']);
  assert.deepEqual(toPost(list, posted('2026-10-14'), bot), []);
  assert.deepEqual(toPost([], [], bot), []);
});
