import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { COMMANDS, END_POLL, MENU_COMMANDS } from './commands.js';

test('/sbc with autocompleted set (required) and challenge, /stats; Romanian descriptions', () => {
  assert.deepEqual(COMMANDS.map((c) => c.name), ['sbc', 'stats', 'language', 'daily', 'wordle', 'poll']);
  const sbc = COMMANDS[0];
  const opts = (sbc.options ?? []) as { name: string; required?: boolean; autocomplete?: boolean }[];
  assert.deepEqual(opts.map((o) => [o.name, !!o.required, !!o.autocomplete]), [['set', true, true], ['challenge', false, true]]);
  for (const c of COMMANDS) {
    assert.ok(c.description_localizations?.ro, c.name);
    assert.ok(c.description.length <= 100);
  }
});

test('/poll: staff-only default, required question / two answers / hours before the optional ones, answers 3 to 10, multi', () => {
  const poll = COMMANDS[5];
  assert.equal(poll.default_member_permissions, String(PermissionFlagsBits.ManageMessages));
  const o = (poll.options ?? []) as { name: string; required?: boolean; max_length?: number }[];
  assert.deepEqual(o.map((x) => x.name), ['question', 'answer1', 'answer2', 'hours', ...Array.from({ length: 8 }, (_, n) => `answer${n + 3}`), 'multi']);
  assert.deepEqual(o.filter((x) => x.required).map((x) => x.name), ['question', 'answer1', 'answer2', 'hours']);
  assert.equal(o[0].max_length, 300);
  assert.ok(o.filter((x) => x.name.startsWith('answer')).every((x) => x.max_length === 55));
});

test('/language: one required EN / RO / both choice', () => {
  const o = (COMMANDS[2].options ?? []) as { name: string; required?: boolean; choices?: { value: string }[] }[];
  assert.deepEqual(o.map((x) => [x.name, !!x.required, x.choices?.map((c) => c.value)]), [['language', true, ['EN', 'RO', 'both']]]);
});

test('/daily and /wordle: identical, no options', () => {
  const [d, w] = [COMMANDS[3], COMMANDS[4]];
  assert.deepEqual([d.name, w.name], ['daily', 'wordle']);
  assert.deepEqual({ ...d, name: '' }, { ...w, name: '' });
  assert.equal((d.options ?? []).length, 0);
});

test('End poll: message context menu, hidden behind ManageGuild', () => {
  const c = MENU_COMMANDS[0];
  assert.equal(c.name, END_POLL);
  assert.equal(c.type, 3);
  assert.equal(c.default_member_permissions, String(PermissionFlagsBits.ManageGuild));
});
