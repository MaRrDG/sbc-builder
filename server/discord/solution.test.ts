import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toBotSolution, type SolveLike } from './solution.js';

const ctx = { set: 'Bronze Upgrade', challenge: 'Bronze', setId: 1, challengeId: 9, lang: 'ro' as const };
const p = (name: string, rating: number, extra = {}) => ({ name, rating, points: 0, ...extra });

test('squad: slots with position, player, chem, storage and locked bricks', () => {
  const a: SolveLike = {
    found: true, eval: { rating: 64, chemistry: 21 },
    slots: [
      { position: { name: 'GK' }, player: p('Ana', 64), chem: 3, brick: null },
      { position: { name: 'ST' }, player: p('Ion', 65, { inStorage: true }), chem: 2, brick: null },
      { position: { name: 'CB' }, player: null, chem: 0, brick: { custom: false } },
    ],
    quota: { used: 4, limit: 20, resetsAt: 1790605200000 },
  };
  const s = toBotSolution(a, ctx);
  assert.deepEqual(s.slots, [
    { pos: 'GK', name: 'Ana', rating: 64, chem: 3, storage: false, brick: false },
    { pos: 'ST', name: 'Ion', rating: 65, chem: 2, storage: true, brick: false },
    { pos: 'CB', name: '', rating: 0, chem: 0, storage: false, brick: true },
  ]);
  assert.equal(s.rating, 64);
  assert.equal(s.points, null);
  assert.equal(s.lang, 'ro');
  assert.deepEqual(s.quota, { used: 4, limit: 20, resetsAt: 1790605200000 });
});

test('points: cards with their points, target and total', () => {
  const s = toBotSolution({ found: true, eval: { rating: 0, chemistry: 0 }, slots: [], points: { target: 120, total: 124, cards: [p('Ana', 70, { points: 60 }), p('Ion', 72, { points: 64 })] }, quota: null }, ctx);
  assert.deepEqual(s.points, { target: 120, total: 124, cards: [{ name: 'Ana', rating: 70, points: 60 }, { name: 'Ion', rating: 72, points: 64 }] });
});

test('not found: at most 3 reasons, structured; strings become text reasons', () => {
  const s = toBotSolution({
    found: false, eval: { rating: 0, chemistry: 0 }, slots: [], quota: null,
    reasons: [{ code: 'count', req: 'France: Min. 2', have: 0 }, 'old text', { code: 'combo' }, { code: 'pool', have: 3, need: 11 }],
  }, ctx);
  assert.deepEqual(s.reasons, [{ code: 'count', req: 'France: Min. 2', have: 0 }, { code: 'text', req: 'old text' }, { code: 'combo' }]);
});
