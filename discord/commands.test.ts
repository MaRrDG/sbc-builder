import { test } from 'node:test';
import assert from 'node:assert/strict';
import { COMMANDS } from './commands.js';

test('/sbc with autocompleted set (required) and challenge, /stats; Romanian descriptions', () => {
  assert.deepEqual(COMMANDS.map((c) => c.name), ['sbc', 'stats']);
  const sbc = COMMANDS[0];
  const opts = (sbc.options ?? []) as { name: string; required?: boolean; autocomplete?: boolean }[];
  assert.deepEqual(opts.map((o) => [o.name, !!o.required, !!o.autocomplete]), [['set', true, true], ['challenge', false, true]]);
  for (const c of COMMANDS) {
    assert.ok(c.description_localizations?.ro, c.name);
    assert.ok(c.description.length <= 100);
  }
});
