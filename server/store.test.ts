import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'fcs-store-'));
process.env.SBC_DATA_DIR = dir;
const { readShared, writeCache, readCache } = await import('./store.js');

test('readShared: missing key is null, a later write is visible', async () => {
  assert.equal(await readShared('t/a'), null);
  await writeCache('t/a', [1, 2]);
  assert.deepEqual((await readShared<number[]>('t/a'))?.data, [1, 2]);
});

test('readShared: a write replaces the shared entry without a disk read', async () => {
  await writeCache('t/b', { v: 1 });
  assert.equal((await readShared<{ v: number }>('t/b'))?.data.v, 1);
  await writeCache('t/b', { v: 2 });
  await rm(join(dir, 't/b.json')); // memory must answer now
  assert.equal((await readShared<{ v: number }>('t/b'))?.data.v, 2);
});

test('writeCache: parallel writes to one key all succeed, last one wins, no tmp left', async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) => writeCache('t/c', i)));
  assert.equal((await readCache<number>('t/c'))?.data, 19);
  assert.deepEqual((await readdir(join(dir, 't'))).filter((f) => f.endsWith('.tmp')), []);
});

test.after(() => rm(dir, { recursive: true, force: true }));
