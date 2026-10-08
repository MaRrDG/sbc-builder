import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareTiles } from './compare.js';
import type { Hidden } from './types.js';

const a: Hidden = { nation: 18, league: 13, club: 1, position: 'ST', rating: 86, cardType: 'normal' };

test('all hits', () => {
  const t = compareTiles(a, a);
  for (const k of Object.keys(t) as (keyof typeof t)[]) assert.equal(t[k].state, 'hit', k);
  assert.equal(t.rating.dir, undefined);
});

test('nation: same confederation is near, else miss, unknown never near', () => {
  assert.equal(compareTiles({ ...a, nation: 14 }, a).nation.state, 'near'); // England vs France
  assert.equal(compareTiles({ ...a, nation: 54 }, a).nation.state, 'miss'); // Brazil
  assert.equal(compareTiles({ ...a, nation: 75 }, { ...a, nation: 211 }).nation.state, 'miss');
});

test('league: same country is near', () => {
  assert.equal(compareTiles({ ...a, league: 14 }, a).league.state, 'near');
  assert.equal(compareTiles({ ...a, league: 53 }, a).league.state, 'miss');
});

test('club and card type: hit or miss only', () => {
  assert.equal(compareTiles({ ...a, club: 2 }, a).club.state, 'miss');
  assert.equal(compareTiles({ ...a, cardType: 'hero' }, a).cardType.state, 'miss');
});

test('position: same line is near, GK alone', () => {
  assert.equal(compareTiles({ ...a, position: 'LW' }, a).position.state, 'near');
  assert.equal(compareTiles({ ...a, position: 'CM' }, a).position.state, 'miss');
  assert.equal(compareTiles({ ...a, position: 'GK' }, { ...a, position: 'CB' }).position.state, 'miss');
});

test('rating: within 2 is near, arrows point to the answer', () => {
  assert.deepEqual(compareTiles({ ...a, rating: 84 }, a).rating, { state: 'near', dir: 'up' });
  assert.deepEqual(compareTiles({ ...a, rating: 88 }, a).rating, { state: 'near', dir: 'down' });
  assert.deepEqual(compareTiles({ ...a, rating: 83 }, a).rating, { state: 'miss', dir: 'up' });
  assert.deepEqual(compareTiles({ ...a, rating: 91 }, a).rating, { state: 'miss', dir: 'down' });
});
