// Points / Daily abuse audit (docs/audit/points-abuse-2026-10.md). `todo` tests prove an open issue
// (they assert the weak behaviour as it is today); plain tests pin a defense that holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGuess, gameView, type Progress } from './game.js';
import { rankLeaderboard } from './leaderboard.js';
import { pointsFor, pointsForWin, streakOf, type Play } from './streak.js';
import { openPractice, sealPractice, signState, verifyState } from './tokens.js';
import { normalizeUsername } from './username.js';
import type { PlayerRow } from './types.js';

const S = 'audit-secret-0123456789abcdef0123';
const row = (assetId: number, p: Partial<PlayerRow> = {}): PlayerRow => ({
  assetId, name: `P${assetId}`, fullName: `Player ${assetId}`, nation: 18, league: 13, club: 1, position: 'ST', rating: 86, rareflag: 1,
  cardType: 'normal', gender: 0, baseClubs: [], firstSeen: 0, lastSeen: 0, ...p,
});
const ANSWER = row(100);
const rows = new Map([100, 1, 2, 3, 4, 5, 6].map((id) => [id, id === 100 ? ANSWER : row(id, { club: id + 10 })]));
const known = (id: number) => rows.has(id);
const lookup = (id: number) => rows.get(id);

/** Plays 5 misses the way guessToday's signed-out branch does (state token round trip each time). */
function anonLoss(day: number): Progress {
  let state: string | null = null;
  let p: Progress | null = null;
  for (const g of [1, 2, 3, 4, 5]) {
    const s = state === null ? { k: `d${day}`, g: [] as number[] } : verifyState(S, state, `d${day}`)!;
    const r = applyGuess(s.g, g, ANSWER.assetId, known);
    assert.ok(!('error' in r));
    p = r;
    state = signState(S, { k: `d${day}`, g: r.guesses });
  }
  return p!;
}

test('fixed D1: a signed-out loss no longer reveals today\'s answer (null until the next drop)', () => {
  const view = gameView(anonLoss(42), ANSWER, lookup, { hideAnswer: true });
  assert.equal(view.answer, null);
  assert.equal(JSON.stringify(view).includes(ANSWER.fullName), false);
  assert.equal(view.rows.length, 5); // the tiles stay
  // a signed-in finished game still shows it
  assert.equal(gameView(anonLoss(42), ANSWER, lookup).answer?.id, ANSWER.assetId);
});

test('fixed D1: a 1-guess win pays no streak points, even on a milestone day', () => {
  assert.equal(pointsForWin(7, 1), 0);
  assert.equal(pointsForWin(30, 1), 0);
  assert.equal(pointsForWin(7, 2), 1);
});

test('fixed D1: one-guess wins every day no longer top the leaderboard over honest players', () => {
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const cheat: Play[] = days.map((day) => ({ day, won: true, guesses: 1 }));
  const honest: Play[] = days.map((day) => ({ day, won: true, guesses: 3 }));
  const r = rankLeaderboard([{ userId: 'h', username: 'honest', plays: honest }, { userId: 'c', username: 'cheat', plays: cheat }], 30);
  assert.equal(r[0].userId, 'h');
  assert.equal(r[1].wins, 0);
  assert.equal(r[1].avgGuesses, null);
  assert.equal(r[1].oneGuessWins, 30);
});

test('audit P1: a 30-day win streak yields 4 points (2 x 7-day Premium), per Clerk account', () => {
  // documents the farm yield: every account that never loses earns this, no EA persona needed
  let total = 0;
  for (let s = 1; s <= 30; s++) total += pointsFor(s);
  assert.equal(total, 4);
  let next = 0;
  for (let s = 31; s <= 60; s++) next += pointsFor(s);
  assert.equal(next, 4); // and the same again every 30 days
});

test('holds: a streak only counts consecutive won days ending today or yesterday', () => {
  const plays: Play[] = [{ day: 1, won: true, guesses: 2 }, { day: 2, won: true, guesses: 2 }, { day: 4, won: true, guesses: 2 }];
  assert.equal(streakOf(plays, 4).current, 1); // the gap on day 3 resets it
  assert.equal(streakOf(plays, 6).current, 0); // nothing yesterday or today
});

test('holds: yesterday\'s state token, a practice state and a forged guess list are refused today', () => {
  const yesterday = signState(S, { k: 'd41', g: [1] });
  assert.equal(verifyState(S, yesterday, 'd42'), null);
  const practice = signState(S, { k: 'pabc', g: [1] });
  assert.equal(verifyState(S, practice, 'd42'), null);
  // two tokens cannot be merged into a longer game: the MAC covers the whole body
  const [a] = signState(S, { k: 'd42', g: [1, 2] }).split('.');
  const [, macB] = signState(S, { k: 'd42', g: [3, 4] }).split('.');
  assert.equal(verifyState(S, `${a}.${macB}`, 'd42'), null);
});

test('audit I1: a signed-out state token can be replayed to branch the same game', { todo: 'audit: I1' }, () => {
  const four = signState(S, { k: 'd42', g: [1, 2, 3, 4] });
  // no nonce / no server record: the same 4-miss token is accepted again and again
  assert.ok(verifyState(S, four, 'd42'));
  assert.ok(verifyState(S, four, 'd42'));
});

test('holds: a practice token expires and never carries the answer in clear', () => {
  const tok = sealPractice(S, { id: 'x', a: 158023, exp: 2000 });
  assert.equal(Buffer.from(tok, 'base64url').toString('latin1').includes('158023'), false);
  assert.ok(openPractice(S, tok, 1999));
  assert.equal(openPractice(S, tok, 2000), null);
  // a practice game's own finish reveals its answer (by design), never the Daily one: different keys
  assert.equal(verifyState(S, signState(S, { k: 'px', g: [] }), 'd42'), null);
});

test('audit L1: staff-looking usernames are accepted', { todo: 'audit: L1' }, () => {
  for (const n of ['admin', 'FCSolver', 'support', 'Moderator', 'fc.solver']) assert.equal(normalizeUsername(n), n);
});
