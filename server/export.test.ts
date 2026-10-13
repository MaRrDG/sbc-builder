import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleExport, sanitizeAccountInfo, sanitizeEvent, subscriptionExport, type ExportReaders } from './export-rules.js';

test('sanitizeAccountInfo drops keys, sid and paddle ids', () => {
  const out = sanitizeAccountInfo({
    personaId: 7, personaName: 'Ana', clubName: 'FC', sid: 'SECRET', sidUpdatedAt: 5, accessKey: 'KEY', paddleCustomerId: 'ctm_1', paddle_x: 'y', extVersion: '0.9', mode: 'client',
  });
  assert.deepEqual(out, { personaId: 7, personaName: 'Ana', clubName: 'FC', sidUpdatedAt: 5, extVersion: '0.9', mode: 'client' });
  assert.ok(!JSON.stringify(out).includes('SECRET'));
});

test('subscriptionExport keeps status, interval, period, canceledAt and drops ids', () => {
  const row = {
    id: 'sub_1', customerId: 'ctm_1', userId: 'u', status: 'active', priceId: 'pri_1', interval: 'year',
    currentPeriodEnd: new Date(2000), cancelAt: new Date(3000), createdAt: new Date(1000), eventAt: new Date(1), pastDueSince: null,
  };
  const out = subscriptionExport(row);
  assert.deepEqual(out, { status: 'active', interval: 'year', startedAt: '1970-01-01T00:00:01.000Z', periodEnd: '1970-01-01T00:00:02.000Z', canceledAt: '1970-01-01T00:00:03.000Z' });
  assert.ok(!JSON.stringify(out).includes('sub_1') && !JSON.stringify(out).includes('ctm_1') && !JSON.stringify(out).includes('pri_1'));
});

test('sanitizeEvent strips paddle ids from billing events only', () => {
  const data = { customerId: 'c', subscriptionId: 's', transactionId: 't', status: 'active' };
  assert.deepEqual(sanitizeEvent({ type: 'billing', data }).data, { status: 'active' });
  assert.deepEqual(sanitizeEvent({ type: 'solve', data }).data, data);
});

test('sanitizeEvent drops other users\' ids from redeem and points events', () => {
  assert.deepEqual(sanitizeEvent({ type: 'redeem', data: { kind: 'gift', codeOwner: 'user_x', ipHash: 'ab' } }).data, { kind: 'gift', ipHash: 'ab' });
  assert.deepEqual(sanitizeEvent({ type: 'points', data: { delta: 1, reason: 'invite', ref: 'user_y', ipHash: null } }).data, { delta: 1, reason: 'invite', ref: null, ipHash: null });
  assert.deepEqual(sanitizeEvent({ type: 'points', data: { delta: -3, reason: 'admin', ref: 'farm', by: 'user_admin', ipHash: null } }).data, { delta: -3, reason: 'admin', ref: 'farm', ipHash: null });
});

const readers = (over: Partial<ExportReaders> = {}): ExportReaders => ({
  user: async () => ({ email: 'a@b.c', lang: 'en', deleteAt: null, deleteSubs: ['sub_x'], paddleCustomerId: 'ctm_1', createdAt: new Date(0) }),
  plan: async () => ({ tier: 'free', source: null }),
  subscriptions: async () => [],
  personas: async () => [{ personaId: 1, linkedAt: new Date(0) }, { personaId: 2, linkedAt: new Date(0) }],
  accountInfo: async (id) => ({ personaId: id, personaName: `P${id}`, clubName: 'C', sid: 's', sidUpdatedAt: 0, accessKey: 'K' }),
  club: async (id) => (id === 1 ? { fetchedAt: 9, data: [{ id: 5 }] } : null),
  requestsToday: async (id) => (id === 1 ? 12 : null),
  completions: async () => [],
  marks: async () => [],
  evos: async () => [],
  daily: async () => ({ plays: [], reminders: [] }),
  invites: async () => ({ codes: [], redemptions: [], points: [] }),
  events: async () => [],
  ...over,
});

test('assembleExport: a persona with no cache has club null and does not throw', async () => {
  const out = (await assembleExport('u', readers())) as any;
  assert.equal(out.eaAccounts.length, 2);
  assert.deepEqual(out.eaAccounts[0].club, { fetchedAt: 9, items: [{ id: 5 }] });
  assert.equal(out.eaAccounts[1].club, null);
  assert.equal(out.eaAccounts[1].requestsToday, null);
  assert.equal(out.eaAccounts[0].requestsToday, 12);
});

test('assembleExport never leaks secrets', async () => {
  const text = JSON.stringify(await assembleExport('u', readers()));
  for (const s of ['"K"', 'sub_x', 'ctm_1', '"s"', 'accessKey', 'deleteSubs']) assert.ok(!text.includes(s), s);
});
