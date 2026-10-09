import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCooldown } from './cooldown.js';

test('first call goes, the next ones wait until the window passed, per key', () => {
  let t = 1000;
  const cd = createCooldown(30_000, () => t);
  assert.equal(cd('a'), 0);
  t += 10_000;
  assert.equal(cd('a'), 20_000);
  assert.equal(cd('b'), 0);
  t += 20_000;
  assert.equal(cd('a'), 0);
});
