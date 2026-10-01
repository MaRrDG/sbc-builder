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
