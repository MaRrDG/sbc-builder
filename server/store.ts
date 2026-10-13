import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, rename, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
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

export async function readCache<T>(key: string): Promise<Cached<T> | null> {
  try {
    return JSON.parse(await readFile(file(key), 'utf8')) as Cached<T>;
  } catch {
    return null;
  }
}

// Read-through copy of the last parsed entry per key, for hot read-only paths (status poll, set list,
// club, solve). Shared between callers: never mutate what readShared returns; use readCache to edit.
const shared = new Map<string, Cached<unknown> | null>();
const generation = new Map<string, number>(); // bumped on every write: a slow read never overwrites a newer write
const SHARED_MAX = 400;

function share(key: string, entry: Cached<unknown> | null) {
  shared.delete(key);
  shared.set(key, entry);
  if (shared.size > SHARED_MAX) shared.delete(shared.keys().next().value as string);
}

export async function readShared<T>(key: string): Promise<Readonly<Cached<T>> | null> {
  if (shared.has(key)) {
    const hit = shared.get(key) as Cached<T> | null;
    share(key, hit); // most recently used
    return hit;
  }
  const gen = generation.get(key) ?? 0;
  const entry = await readCache<T>(key);
  // misses and read errors are not cached: the next call goes to disk again
  if (entry && (generation.get(key) ?? 0) === gen) share(key, entry);
  return entry;
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
  share(key, JSON.parse(json) as Cached<T>);
  for (const fn of listeners) {
    try {
      fn(key, entry.data);
    } catch (err) {
      console.warn(`[store] cache write listener failed for ${key}:`, err);
    }
  }
  return entry;
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
