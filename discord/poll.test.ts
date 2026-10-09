import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPoll, isOurResult, pollResult, pollResultMessage, validatePoll } from './poll.js';
import { ROLE, overwritesFor } from './layout.js';

const ok = { question: ' Best? ', answers: [' A ', 'B', null, '  ', 'C'] as (string | null)[], hours: 24, multi: null as boolean | null };

test('validatePoll trims, drops blank optional answers and defaults multi to false', () => {
  assert.deepEqual(validatePoll(ok), { ok: true, poll: { question: 'Best?', answers: ['A', 'B', 'C'], hours: 24, multi: false } });
});

test('validatePoll refuses empty question, blank required answers, duplicates, bad lengths and hours', () => {
  const code = (p: Partial<typeof ok>) => {
    const v = validatePoll({ ...ok, ...p });
    return v.ok ? 'ok' : v.code;
  };
  assert.equal(code({ question: '   ' }), 'question');
  assert.equal(code({ question: 'x'.repeat(301) }), 'question');
  assert.equal(code({ answers: ['A', '  ', 'C'] }), 'answers');
  assert.equal(code({ answers: ['A', 'a'] }), 'duplicate');
  assert.equal(code({ answers: ['A', 'x'.repeat(56)] }), 'answerLong');
  assert.equal(code({ answers: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K'] }), 'answers');
  assert.equal(code({ hours: 0 }), 'hours');
  assert.equal(code({ hours: 769 }), 'hours');
  assert.equal(code({ hours: 1.5 }), 'hours');
  assert.equal(code({ hours: 768 }), 'ok');
  assert.equal(code({ answers: ['A', 'x'.repeat(55)] }), 'ok');
});

test('pollResult: one winner, ties, no votes', () => {
  assert.deepEqual(pollResult([{ text: 'A', votes: 3 }, { text: 'B', votes: 5 }]), { winners: ['B'], top: 5, total: 8, tie: false });
  assert.deepEqual(pollResult([{ text: 'A', votes: 4 }, { text: 'B', votes: 4 }, { text: 'C', votes: 1 }]), { winners: ['A', 'B'], top: 4, total: 9, tie: true });
  assert.deepEqual(pollResult([{ text: 'A', votes: 0 }, { text: 'B', votes: 0 }]), { winners: [], top: 0, total: 0, tie: false });
});

test('canPoll: Admin or Moderator only', () => {
  assert.equal(canPoll([ROLE.admin]), true);
  assert.equal(canPoll(['everyone', ROLE.mod]), true);
  assert.equal(canPoll([ROLE.member, ROLE.en]), false);
  assert.equal(canPoll([]), false);
});

test('result message: English only, results listed, no pings', () => {
  const m = pollResultMessage('Best?', [{ text: 'A', votes: 4 }, { text: 'B', votes: 4 }], 'https://i/c.png');
  const e = m.embeds[0].toJSON();
  assert.equal(e.title, 'Best?');
  assert.equal(e.author?.name, 'FC Solver');
  const d = e.description!;
  assert.match(d, /Tie/);
  assert.doesNotMatch(d, /Egalitate/);
  assert.match(d, /\*\*A\*\*.*\*\*B\*\*/);
  assert.match(e.fields![0].value, /4\s+A/);
  assert.deepEqual(m.allowedMentions, { parse: [] });
  const none = pollResultMessage('Q', [{ text: 'A', votes: 0 }, { text: 'B', votes: 0 }]).embeds[0].toJSON().description!;
  assert.match(none, /No votes/);
  assert.doesNotMatch(none, /Niciun vot/);
});

test('isOurResult: our embed reply yes; Discord PollResult message and unrelated bot embeds no', () => {
  const ours = { type: 19, authorId: 'B', replyTo: 'P', embedAuthors: ['FC Solver'] as (string | null)[] };
  assert.equal(isOurResult(ours, 'P', 'B'), true);
  assert.equal(isOurResult({ ...ours, type: 46, embedAuthors: [] }, 'P', 'B'), false);
  assert.equal(isOurResult({ ...ours, type: 46 }, 'P', 'B'), false);
  assert.equal(isOurResult({ ...ours, embedAuthors: [null] }, 'P', 'B'), false);
  assert.equal(isOurResult({ ...ours, replyTo: 'X' }, 'P', 'B'), false);
  assert.equal(isOurResult({ ...ours, authorId: 'U' }, 'P', 'B'), false);
});

test('SendPolls only on the polls channel overwrite', () => {
  const ids = { everyone: 'E', bot: 'B', byName: new Map([[ROLE.member.toLowerCase(), 'M'], [ROLE.mod.toLowerCase(), 'D']]) };
  assert.ok(overwritesFor('member', 'text', true, ids, true).find((o) => o.id === 'B')!.allow.includes('SendPolls'));
  assert.ok(!overwritesFor('member', 'text', true, ids).find((o) => o.id === 'B')!.allow.includes('SendPolls'));
});
