import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, rm, stat, unlink } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// SBC_DATA_DIR: test override (unit tests point it at a temp dir); the app always uses data/
export const DATA_DIR = process.env.SBC_DATA_DIR ?? join(ROOT, 'data');

export interface Cached<T> {
  fetchedAt: number;
  data: T;
}

type WriteListener = (key: string, data: unknown) => void;
const listeners: WriteListener[] = [];

/** Called after every cache write (the gallery ledger listens for club / storage / unassigned). */
export function onCacheWrite(fn: WriteListener) {
  listeners.push(fn);
}

const file = (key: string) => join(DATA_DIR, `${key}.json`);

async function readEntry<T>(key: string): Promise<{ entry: Cached<T>; size: number } | null> {
  try {
    const text = await readFile(file(key), 'utf8');
    return { entry: JSON.parse(text) as Cached<T>, size: text.length };
  } catch {
    return null;
  }
}

export async function readCache<T>(key: string): Promise<Cached<T> | null> {
  return (await readEntry<T>(key))?.entry ?? null;
}

// Read-through copy of the last parsed entry per key, for hot read-only paths (status poll, set list,
// club, solve). Shared between callers: never mutate what readShared returns; use readCache to edit.
const shared = new Map<string, { entry: Cached<unknown> | null; size: number }>();
const generation = new Map<string, number>(); // bumped on every write: a slow read never overwrites a newer write
const SHARED_MAX = 400;
// bound by size too: a few big clubs must not fill the memory (JSON length, roughly the bytes held);
// SBC_SHARED_MAX_BYTES is a test override
const SHARED_MAX_BYTES = Number(process.env.SBC_SHARED_MAX_BYTES) || 150 * 1024 * 1024;
let sharedBytes = 0;
let drops = 0; // bumped by dropKeys

function unshare(key: string) {
  const old = shared.get(key);
  if (!old) return;
  sharedBytes -= old.size;
  shared.delete(key);
}

function share(key: string, entry: Cached<unknown> | null, size: number) {
  unshare(key);
  shared.set(key, { entry, size });
  sharedBytes += size;
  // least recently used first (Map order); an entry bigger than the whole budget is not kept either
  while (shared.size > SHARED_MAX || (sharedBytes > SHARED_MAX_BYTES && shared.size)) unshare(shared.keys().next().value as string);
}

export async function readShared<T>(key: string): Promise<Readonly<Cached<T>> | null> {
  const hit = shared.get(key);
  if (hit) {
    share(key, hit.entry, hit.size); // most recently used
    return hit.entry as Cached<T> | null;
  }
  const gen = generation.get(key) ?? 0;
  const dropped = drops;
  const read = await readEntry<T>(key);
  // misses and read errors are not cached: the next call goes to disk again
  if (read && (generation.get(key) ?? 0) === gen && drops === dropped) share(key, read.entry, read.size);
  return read?.entry ?? null;
}

const writing = new Map<string, Promise<unknown>>();

/** `fetchedAt` defaults to now; pass the old one for local edits that are not a fresh fetch. */
export function writeCache<T>(key: string, data: T, fetchedAt = Date.now()): Promise<Cached<T>> {
  // one write per key at a time, in call order
  // serialize now: later mutations of `data` by the caller must reach neither the disk nor the shared entry
  const entry: Cached<T> = { fetchedAt, data };
  const json = JSON.stringify(entry);
  const run = (writing.get(key) ?? Promise.resolve()).catch(() => {}).then(() => write(key, entry, json));
  writing.set(key, run);
  void run.finally(() => {
    if (writing.get(key) === run) writing.delete(key);
  }).catch(() => {});
  return run;
}

async function write<T>(key: string, entry: Cached<T>, json: string): Promise<Cached<T>> {
  const path = file(key);
  await mkdir(dirname(path), { recursive: true });
  // write-then-rename so a crash never leaves a half-written cache file; a unique tmp name per write
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  try {
    await writeFile(tmp, json);
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
  generation.set(key, (generation.get(key) ?? 0) + 1);
  share(key, JSON.parse(json) as Cached<T>, json.length);
  for (const fn of listeners) {
    try {
      fn(key, entry.data);
    } catch (err) {
      console.warn(`[store] cache write listener failed for ${key}:`, err);
    }
  }
  return entry;
}

/**
 * Delete every key under `prefix` (a folder such as `accounts/<personaId>`): the files on disk and
 * their shared entries. Refuses an empty prefix, `..`, or anything that is not strictly inside DATA_DIR.
 */
export async function dropKeys(prefix: string): Promise<void> {
  const path = join(DATA_DIR, prefix);
  const rel = relative(DATA_DIR, path);
  if (!prefix || prefix.split(/[\\/]/).includes('..') || !rel || rel.startsWith('..') || rel.split(sep).includes('..')) throw new Error(`dropKeys: refused prefix "${prefix}"`);
  const evict = () => {
    for (const key of [...shared.keys()]) if (key === prefix || key.startsWith(`${prefix}/`)) unshare(key);
    drops++; // a read already in flight must not put the old entry back
  };
  evict();
  await rm(path, { recursive: true, force: true });
  evict(); // a read that ran while the files were going away
}

/** When a cache file last changed (ms), 0 when missing; a cheap change check without parsing it. */
export async function cacheMtime(key: string): Promise<number> {
  try {
    return (await stat(file(key))).mtimeMs;
  } catch {
    return 0;
  }
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function isStale(entry: Cached<unknown> | null, maxAge = DAY_MS): boolean {
  return !entry || Date.now() - entry.fetchedAt > maxAge;
}
