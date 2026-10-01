import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
process.env.SBC_DATA_DIR = await mkdtemp(join(tmpdir(), 'ledger-'));
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ClubItem } from '../ea.js';

const ci = (p: Partial<ClubItem> = {}): ClubItem => ({
  id: 1, assetId: 10, resourceId: 10, rating: 84, rareflag: 1, preferredPosition: 'CM', possiblePositions: ['CM'],
  teamid: 1, leagueId: 13, nation: 14, untradeable: false, itemState: 'free', owners: 1, gradingScore: 830, ...p,
});

test('concurrent recordItems calls lose nothing', async () => {
  const { recordItems, readLedgerRaw } = await import('./ledger.js');
  await Promise.all([...Array(20)].map((_, k) => recordItems(424242, [ci({ id: 100 + k })])));
  const led = await readLedgerRaw(424242);
  assert.equal(Object.keys(led).length, 20);
});

test('first recordItems backfills cached storage when no ledger exists yet', async () => {
  const { recordItems, readLedger } = await import('./ledger.js');
  const { writeCache } = await import('../store.js');
  await writeCache('accounts/555/storage', [ci({ id: 900 })]);
  await recordItems(555, [ci({ id: 901 })]);
  const { ledger } = await readLedger(555);
  assert.deepEqual(Object.keys(ledger).sort(), ['900', '901']);
});

test('an old-format ledger (full DTOs, no version) is discarded and rebuilt from the cache', async () => {
  const { readLedger, readLedgerRaw, LEDGER_KEY, LEDGER_VERSION } = await import('./ledger.js');
  const { writeCache, readCache } = await import('../store.js');
  await writeCache('accounts/777/club', [{ ...ci({ id: 50 }), attributeArray: [1, 2, 3] }]);
  // v1: { [id]: { item: ClubItem, firstOwner, firstSeen } } straight in data, with an item the cache no longer holds
  await writeCache(LEDGER_KEY(777), { '49': { item: ci({ id: 49 }), firstOwner: true, firstSeen: 1 } });
  const { ledger } = await readLedger(777);
  assert.deepEqual(Object.keys(ledger), ['50']);
  const file = await readCache<{ v: number; entries: Record<string, { item: object }> }>(LEDGER_KEY(777));
  assert.equal(file?.data.v, LEDGER_VERSION);
  assert.equal('attributeArray' in file!.data.entries['50'].item, false);
  assert.deepEqual(Object.keys(await readLedgerRaw(777)), ['50']);
});

test('a current-version ledger is read from disk once, then served from memory; bad entries skipped', async () => {
  const { readLedger, recordItems, forgetLedgers, LEDGER_KEY, LEDGER_VERSION } = await import('./ledger.js');
  const { writeCache } = await import('../store.js');
  const good = { item: ci({ id: 60 }), firstOwner: false, firstSeen: 1 };
  const bad = { item: { id: 61, assetId: 1 }, firstOwner: true, firstSeen: 1 };
  await writeCache(LEDGER_KEY(888), { v: LEDGER_VERSION, entries: { '60': good, '61': bad } });
  forgetLedgers();
  const a = await readLedger(888);
  assert.deepEqual(Object.keys(a.ledger), ['60']);
  const b = await readLedger(888);
  assert.equal(b.rev, a.rev); // no write in between: same in-memory copy
  await recordItems(888, [ci({ id: 62 })]);
  const c = await readLedger(888);
  assert.notEqual(c.rev, a.rev);
  assert.deepEqual(Object.keys(c.ledger).sort(), ['60', '62']);
});
