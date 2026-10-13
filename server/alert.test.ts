import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertFingerprint, alertText, createAlertGate } from './alert.js';

test('same fingerprint at most once per window, then reports how many were skipped', () => {
  let t = 0;
  const g = createAlertGate({ windowMs: 600_000, hourCap: 20, now: () => t });
  assert.deepEqual(g.take('a'), { send: true, skipped: 0 });
  assert.deepEqual(g.take('a'), { send: false, skipped: 0 });
  assert.deepEqual(g.take('a'), { send: false, skipped: 0 });
  t = 600_001;
  assert.deepEqual(g.take('a'), { send: true, skipped: 2 });
  assert.deepEqual(g.take('b'), { send: true, skipped: 0 });
});

test('at most hourCap sends per rolling hour across fingerprints', () => {
  let t = 0;
  const g = createAlertGate({ windowMs: 1, hourCap: 3, now: () => t });
  assert.equal(g.take('a').send, true);
  assert.equal(g.take('b').send, true);
  assert.equal(g.take('c').send, true);
  assert.equal(g.take('d').send, false);
  t = 3_600_001;
  assert.equal(g.take('e').send, true);
});

test('alertText: route without query, top 5 stack lines, nothing else', () => {
  const stack = ['Error: boom', ...Array.from({ length: 9 }, (_, i) => `    at f${i} (/app/server/x.ts:${i}:1)`)].join('\n');
  const s = alertText({ env: 'fc-solver.app', kind: '500', route: 'POST /api/solve?x=secret', err: { name: 'Error', message: 'boom', stack } });
  assert.match(s, /fc-solver\.app/);
  assert.match(s, /POST \/api\/solve/);
  assert.doesNotMatch(s, /secret/);
  assert.match(s, /at f4/);
  assert.doesNotMatch(s, /at f5/);
});

test('alertText: long messages are cut to 200 chars', () => {
  const s = alertText({ env: 'dev', kind: 'uncaught', err: { name: 'Error', message: 'x'.repeat(500) } });
  assert.ok(!s.includes('x'.repeat(201)));
});

test('alert: a failed webhook send is swallowed', async () => {
  const prev = process.env.ALERT_WEBHOOK_URL;
  process.env.ALERT_WEBHOOK_URL = 'http://127.0.0.1:9/hook';
  try {
    const { alert } = await import('./alert.js');
    await alert('500', new Error('x'), 'GET /a');
  } finally {
    if (prev === undefined) delete process.env.ALERT_WEBHOOK_URL;
    else process.env.ALERT_WEBHOOK_URL = prev;
  }
});

test('alertText: multi-line (Drizzle-like) message keeps only the first line, no params, no email', () => {
  const message = 'Failed query: select * from users where email = $1\nparams: bob@example.com,123';
  const s = alertText({ env: 'dev', kind: '500', err: { name: 'Error', message, stack: `Error: ${message}\n    at f (/app/x.ts:1:1)` } });
  assert.doesNotMatch(s, /bob@example\.com/);
  assert.doesNotMatch(s, /params/);
  assert.match(s, /at f/);
});

test('alertText: emails, ids and token-like runs in a one-line message are redacted', () => {
  const s = alertText({ env: 'dev', kind: '500', err: { name: 'Error', message: 'no user bob@example.com 123e4567-e89b-12d3-a456-426614174000 eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abc' } });
  assert.doesNotMatch(s, /bob@example/);
  assert.match(s, /\[email\]/);
  assert.match(s, /\[id\]/);
  assert.match(s, /\[token\]/);
});

test('alertText: stack lines without "at" are not included', () => {
  const s = alertText({ env: 'dev', kind: '500', err: { name: 'Error', message: 'm', stack: 'Error: m\nsecret continuation line\n    at f (/app/x.ts:1:1)' } });
  assert.doesNotMatch(s, /secret/);
});

test('different non-Error rejections get different fingerprints, Errors from one place stay merged', () => {
  assert.notEqual(alertFingerprint('unhandled', 'boom one'), alertFingerprint('unhandled', 'boom two'));
  assert.equal(alertFingerprint('unhandled', 'same'), alertFingerprint('unhandled', 'same'));
  const mk = () => new Error('x');
  assert.equal(alertFingerprint('500', mk(), 'GET /a'), alertFingerprint('500', mk(), 'GET /a'));
});
