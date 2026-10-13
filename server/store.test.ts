import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'fcs-store-'));
process.env.SBC_DATA_DIR = dir;
process.env.SBC_SHARED_MAX_BYTES = '600'; // tiny budget for the size test; the other entries are a few bytes
const { readShared, writeCache, readCache, dropKeys } = await import('./store.js');

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

test('writeCache: mutating the passed object later changes neither shared entry nor disk', async () => {
  const obj = { v: 1 };
  const p = writeCache('t/d', obj);
  obj.v = 99;
  await p;
  obj.v = 100;
  assert.equal((await readShared<{ v: number }>('t/d'))?.data.v, 1);
  assert.equal(JSON.parse(await readFile(join(dir, 't/d.json'), 'utf8')).data.v, 1);
});

test('readShared: a miss is not cached, a file created on disk is found next time', async () => {
  assert.equal(await readShared('t/e'), null);
  await mkdir(join(dir, 't'), { recursive: true });
  await writeFile(join(dir, 't/e.json'), JSON.stringify({ fetchedAt: 5, data: 'x' }));
  assert.equal((await readShared<string>('t/e'))?.data, 'x');
});

test('readShared: over the byte budget the least recently used entry is dropped', async () => {
  const big = 'x'.repeat(250);
  await writeCache('t/s1', big);
  await writeCache('t/s2', big);
  await readShared('t/s1'); // s1 is now the most recently used
  await writeCache('t/s3', big); // three entries of ~280 bytes > 600: the least recently used (s2) goes
  await rm(join(dir, 't/s1.json'));
  await rm(join(dir, 't/s2.json'));
  await rm(join(dir, 't/s3.json'));
  assert.equal(await readShared('t/s2'), null); // evicted: answered from disk (gone)
  assert.equal((await readShared<string>('t/s1'))?.data, big); // recently used: still in memory
  assert.equal((await readShared<string>('t/s3'))?.data, big); // newest stays in memory
});

test('readShared: an entry bigger than the whole budget is not kept', async () => {
  await writeCache('t/huge', 'y'.repeat(1000));
  await rm(join(dir, 't/huge.json'));
  assert.equal(await readShared('t/huge'), null);
});

test.after(() => rm(dir, { recursive: true, force: true }));

test('dropKeys: removes one account folder and its shared entries, refuses anything else', async () => {
  await writeCache('accounts/7/x', { v: 1 });
  await writeCache('accounts/77/x', { v: 2 }); // same start, other account: stays
  assert.equal((await readShared<{ v: number }>('accounts/7/x'))?.data.v, 1);
  await dropKeys('accounts/7/'); // a trailing slash is fine
  assert.equal(await readShared('accounts/7/x'), null);
  assert.equal(await readCache('accounts/7/x'), null);
  await assert.rejects(readdir(join(dir, 'accounts/7')));
  assert.equal((await readShared<{ v: number }>('accounts/77/x'))?.data.v, 2);
  await dropKeys('accounts/7'); // again: nothing left, fine
  for (const bad of ['', '/', 'accounts', 'accounts/', 'accounts/7/x', 'accounts/../t', 't/p', '.', 'accounts/7a', '/accounts/7'])
    await assert.rejects(dropKeys(bad), bad);
  assert.equal((await readShared<{ v: number }>('accounts/77/x'))?.data.v, 2);
});

test('isAccountFolder accepts only positive integers without leading zeros', async () => {
  const { isAccountFolder } = await import('./store.js');
  for (const ok of ['1', '123456']) assert.equal(isAccountFolder(ok), true);
  for (const bad of ['0', '012', '-1', '1.5', '1e3', 'abc', '']) assert.equal(isAccountFolder(bad), false);
});
