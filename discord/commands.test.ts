import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PermissionFlagsBits } from 'discord.js';
import { COMMANDS } from './commands.js';

test('/sbc with autocompleted set (required) and challenge, /stats; Romanian descriptions', () => {
  assert.deepEqual(COMMANDS.map((c) => c.name), ['sbc', 'stats', 'poll']);
  const sbc = COMMANDS[0];
  const opts = (sbc.options ?? []) as { name: string; required?: boolean; autocomplete?: boolean }[];
  assert.deepEqual(opts.map((o) => [o.name, !!o.required, !!o.autocomplete]), [['set', true, true], ['challenge', false, true]]);
  for (const c of COMMANDS) {
    assert.ok(c.description_localizations?.ro, c.name);
    assert.ok(c.description.length <= 100);
  }
});

test('/poll: staff-only default, required question / two answers / hours before the optional ones, answers 3 to 10, multi', () => {
  const poll = COMMANDS[2];
  assert.equal(poll.default_member_permissions, String(PermissionFlagsBits.ManageMessages));
  const o = (poll.options ?? []) as { name: string; required?: boolean; max_length?: number }[];
  assert.deepEqual(o.map((x) => x.name), ['question', 'answer1', 'answer2', 'hours', ...Array.from({ length: 8 }, (_, n) => `answer${n + 3}`), 'multi']);
  assert.deepEqual(o.filter((x) => x.required).map((x) => x.name), ['question', 'answer1', 'answer2', 'hours']);
  assert.equal(o[0].max_length, 300);
  assert.ok(o.filter((x) => x.name.startsWith('answer')).every((x) => x.max_length === 55));
});
