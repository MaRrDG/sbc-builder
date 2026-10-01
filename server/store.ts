import { mkdir, readFile, writeFile, rename, stat } from 'node:fs/promises';
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

/** `fetchedAt` defaults to now; pass the old one for local edits that are not a fresh fetch. */
export async function writeCache<T>(key: string, data: T, fetchedAt = Date.now()): Promise<Cached<T>> {
  const entry: Cached<T> = { fetchedAt, data };
  const path = file(key);
  await mkdir(dirname(path), { recursive: true });
  // write-then-rename so a crash never leaves a half-written cache file
  await writeFile(path + '.tmp', JSON.stringify(entry));
  await rename(path + '.tmp', path);
  for (const fn of listeners) {
    try {
      fn(key, data);
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
