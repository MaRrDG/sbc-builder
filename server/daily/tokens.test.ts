import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openPractice, sealPractice, signState, verifyState } from './tokens.js';

const S = 'test-secret-0123456789abcdef';

test('state round-trips for its own game key only', () => {
  const tok = signState(S, { k: 'd42', g: [1, 2] });
  assert.deepEqual(verifyState(S, tok, 'd42'), { k: 'd42', g: [1, 2] });
  assert.equal(verifyState(S, tok, 'd43'), null); // yesterday's token today
  assert.equal(verifyState('other-secret-0123456789', tok, 'd42'), null);
});

test('tampered or malformed state is refused', () => {
  const tok = signState(S, { k: 'd42', g: [1] });
  const [body, mac] = tok.split('.');
  const forged = Buffer.from(JSON.stringify({ k: 'd42', g: [1, 2, 3] })).toString('base64url');
  assert.equal(verifyState(S, `${forged}.${mac}`, 'd42'), null);
  assert.equal(verifyState(S, `${body}.${mac}x`, 'd42'), null);
  assert.equal(verifyState(S, `${tok}.x`, 'd42'), null);
  assert.equal(verifyState(S, 'nope', 'd42'), null);
  assert.equal(verifyState(S, 42, 'd42'), null);
  assert.equal(verifyState(S, signState(S, { k: 'd42', g: [1, 2, 3, 4, 5, 6] }), 'd42'), null); // more than 5
  assert.equal(verifyState(S, signState(S, { k: 'd42', g: [1.5] }), 'd42'), null);
});

test('practice token hides the answer and expires', () => {
  const tok = sealPractice(S, { id: 'abc', a: 158023, exp: 1000 });
  assert.equal(tok.includes('158023'), false);
  assert.equal(Buffer.from(tok, 'base64url').toString('latin1').includes('158023'), false);
  assert.deepEqual(openPractice(S, tok, 999), { id: 'abc', a: 158023, exp: 1000 });
  assert.equal(openPractice(S, tok, 1000), null);
  assert.equal(openPractice('other-secret-0123456789', tok, 0), null);
  const bytes = Buffer.from(tok, 'base64url');
  bytes[bytes.length - 1] ^= 1;
  assert.equal(openPractice(S, bytes.toString('base64url'), 0), null);
  assert.equal(openPractice(S, 'short', 0), null);
});
