import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { applyEvent, PAST_DUE_GRACE_MS, subscriptionActive, verifySignature, type PaddleSubEvent, type SubRow } from './rules.js';

const SECRET = 'pdl_ntfset_test_secret';
const BODY = '{"event_id":"evt_1","event_type":"subscription.created"}';
const NOW = Date.UTC(2026, 9, 12, 12, 0, 0);
const TS = Math.floor(NOW / 1000);

function sign(body: string, ts: number, secret = SECRET): string {
  return createHmac('sha256', secret).update(`${ts}:${body}`).digest('hex');
}

test('verifySignature accepts a valid signature', () => {
  assert.equal(verifySignature(BODY, `ts=${TS};h1=${sign(BODY, TS)}`, SECRET, NOW), true);
});

test('verifySignature accepts any of several h1 values (secret rotation)', () => {
  const header = `ts=${TS};h1=${'0'.repeat(64)};h1=${sign(BODY, TS)}`;
  assert.equal(verifySignature(BODY, header, SECRET, NOW), true);
});

test('verifySignature rejects a wrong secret', () => {
  assert.equal(verifySignature(BODY, `ts=${TS};h1=${sign(BODY, TS, 'other')}`, SECRET, NOW), false);
});

test('verifySignature rejects a tampered body', () => {
  const header = `ts=${TS};h1=${sign(BODY, TS)}`;
  assert.equal(verifySignature(BODY.replace('evt_1', 'evt_2'), header, SECRET, NOW), false);
});

test('verifySignature rejects a timestamp older than 5 minutes', () => {
  const old = TS - 10 * 60;
  assert.equal(verifySignature(BODY, `ts=${old};h1=${sign(BODY, old)}`, SECRET, NOW), false);
  const edge = TS - 5 * 60;
  assert.equal(verifySignature(BODY, `ts=${edge};h1=${sign(BODY, edge)}`, SECRET, NOW), true);
});

test('verifySignature rejects a missing or malformed header', () => {
  assert.equal(verifySignature(BODY, undefined, SECRET, NOW), false);
  assert.equal(verifySignature(BODY, '', SECRET, NOW), false);
  assert.equal(verifySignature(BODY, `h1=${sign(BODY, TS)}`, SECRET, NOW), false);
  assert.equal(verifySignature(BODY, `ts=${TS}`, SECRET, NOW), false);
  assert.equal(verifySignature(BODY, `ts=abc;h1=${sign(BODY, TS)}`, SECRET, NOW), false);
  assert.equal(verifySignature(BODY, `ts=${TS};h1=short`, SECRET, NOW), false);
});

const PRICES = { month: 'pri_month', year: 'pri_year' };

function ev(over: Partial<PaddleSubEvent['data']> = {}, at = '2026-10-12T12:00:00Z', type = 'subscription.created'): PaddleSubEvent {
  return {
    eventId: `evt_${at}`,
    type,
    occurredAt: new Date(at),
    data: {
      id: 'sub_1',
      status: 'active',
      customer_id: 'ctm_1',
      custom_data: { userId: 'user_1' },
      items: [{ price: { id: 'pri_month' } }],
      current_billing_period: { ends_at: '2026-11-12T12:00:00Z' },
      scheduled_change: null,
      ...over,
    },
  };
}

test('applyEvent creates a row from the first event', () => {
  const row = applyEvent(null, ev(), PRICES);
  assert.deepEqual(row, {
    id: 'sub_1',
    userId: 'user_1',
    customerId: 'ctm_1',
    status: 'active',
    priceId: 'pri_month',
    interval: 'month',
    currentPeriodEnd: new Date('2026-11-12T12:00:00Z'),
    cancelAt: null,
    eventAt: new Date('2026-10-12T12:00:00Z'),
  });
});

test('applyEvent ignores a new row without userId', () => {
  assert.equal(applyEvent(null, ev({ custom_data: null }), PRICES), null);
  assert.equal(applyEvent(null, ev({ custom_data: {} }), PRICES), null);
});

test('applyEvent ignores an unknown price', () => {
  assert.equal(applyEvent(null, ev({ items: [{ price: { id: 'pri_other' } }] }), PRICES), null);
});

test('applyEvent renewal moves the period end', () => {
  const first = applyEvent(null, ev(), PRICES)!;
  const next = applyEvent(first, ev({ current_billing_period: { ends_at: '2026-12-12T12:00:00Z' } }, '2026-11-12T12:00:05Z', 'subscription.updated'), PRICES)!;
  assert.deepEqual(next.currentPeriodEnd, new Date('2026-12-12T12:00:00Z'));
  assert.deepEqual(next.eventAt, new Date('2026-11-12T12:00:05Z'));
});

test('applyEvent scheduled cancel sets cancelAt and stays active', () => {
  const first = applyEvent(null, ev(), PRICES)!;
  const next = applyEvent(first, ev({ scheduled_change: { action: 'cancel', effective_at: '2026-11-12T12:00:00Z' } }, '2026-10-20T00:00:00Z', 'subscription.updated'), PRICES)!;
  assert.equal(next.status, 'active');
  assert.deepEqual(next.cancelAt, new Date('2026-11-12T12:00:00Z'));
  // a non-cancel scheduled change is not a cancel
  const pause = applyEvent(first, ev({ scheduled_change: { action: 'pause', effective_at: '2026-11-12T12:00:00Z' } }, '2026-10-20T00:00:00Z'), PRICES)!;
  assert.equal(pause.cancelAt, null);
});

test('applyEvent canceled keeps the last known period end when Paddle sends none', () => {
  const first = applyEvent(null, ev(), PRICES)!;
  const next = applyEvent(first, ev({ status: 'canceled', current_billing_period: null }, '2026-11-12T12:00:00Z', 'subscription.canceled'), PRICES)!;
  assert.equal(next.status, 'canceled');
  assert.deepEqual(next.currentPeriodEnd, new Date('2026-11-12T12:00:00Z'));
});

test('applyEvent past_due updates the status', () => {
  const first = applyEvent(null, ev(), PRICES)!;
  const next = applyEvent(first, ev({ status: 'past_due' }, '2026-11-12T12:05:00Z', 'subscription.past_due'), PRICES)!;
  assert.equal(next.status, 'past_due');
});

test('applyEvent ignores an event older than the row', () => {
  const first = applyEvent(null, ev({}, '2026-10-20T00:00:00Z'), PRICES)!;
  assert.equal(applyEvent(first, ev({ status: 'past_due' }, '2026-10-19T00:00:00Z', 'subscription.updated'), PRICES), null);
});

test('applyEvent duplicate of the same event gives the same row', () => {
  const first = applyEvent(null, ev(), PRICES)!;
  assert.deepEqual(applyEvent(first, ev(), PRICES), first);
});

test('applyEvent keeps userId on an existing row when custom_data is absent', () => {
  const first = applyEvent(null, ev(), PRICES)!;
  const next = applyEvent(first, ev({ custom_data: null, items: [{ price: { id: 'pri_year' } }] }, '2026-10-13T00:00:00Z', 'subscription.updated'), PRICES)!;
  assert.equal(next.userId, 'user_1');
  assert.equal(next.interval, 'year');
  assert.equal(next.priceId, 'pri_year');
});

function row(status: SubRow['status'], periodEnd: number): SubRow {
  return { id: 's', userId: 'u', customerId: 'c', status, priceId: 'p', interval: 'month', currentPeriodEnd: new Date(periodEnd), cancelAt: null, eventAt: new Date(0) };
}

test('subscriptionActive per status', () => {
  const later = NOW + 1000;
  assert.equal(subscriptionActive(null, NOW), false);
  assert.equal(subscriptionActive(row('active', later), NOW), true);
  assert.equal(subscriptionActive(row('trialing', later), NOW), true);
  assert.equal(subscriptionActive(row('past_due', later), NOW), true);
  assert.equal(subscriptionActive(row('paused', later), NOW), false);
  assert.equal(subscriptionActive(row('canceled', later), NOW), false);
});

test('subscriptionActive ends at period end for active', () => {
  assert.equal(subscriptionActive(row('active', NOW), NOW), false);
  assert.equal(subscriptionActive(row('active', NOW + 1), NOW), true);
});

test('subscriptionActive gives past_due a 3 day grace after period end', () => {
  const end = NOW - PAST_DUE_GRACE_MS;
  assert.equal(subscriptionActive(row('past_due', end + 1), NOW), true);
  assert.equal(subscriptionActive(row('past_due', end), NOW), false);
});
