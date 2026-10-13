// Last known dashboard data per signed-in user and EA account (IndexedDB): drawn at once on open,
// then replaced by the network answer. Cleared on sign-out; another user's data is dropped on sign-in.
import type { api, Meta } from './api';

export type CacheName = 'me' | 'data';
export interface AccountData {
  meta: Meta;
  club: Awaited<ReturnType<typeof api.club>>;
  sets: Awaited<ReturnType<typeof api.sets>>;
  status: Awaited<ReturnType<typeof api.status>>;
}

export const cacheKey = (userId: string, persona: number | null, name: CacheName) => `${userId}:${persona ?? 0}:${name}`;
export const ownedBy = (key: string, userId: string) => key.startsWith(`${userId}:`);

const STORE = 'kv';
let db: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  db ??= new Promise((resolve) => {
    try {
      const r = indexedDB.open('fcs-cache', 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = r.onblocked = () => resolve(null);
    } catch {
      resolve(null); // private window / blocked storage: no cache, the app still works
    }
  });
  return db;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (d) =>
      new Promise((resolve) => {
        if (!d) return resolve(undefined);
        try {
          const r = fn(d.transaction(STORE, mode).objectStore(STORE));
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export const cacheGet = <T>(key: string) => run<T>('readonly', (s) => s.get(key) as IDBRequest<T>);
export function cacheSet(key: string, value: unknown) {
  void run('readwrite', (s) => s.put(value, key));
}
export async function cacheKeep(userId: string) {
  const keys = (await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) ?? [];
  for (const k of keys) if (typeof k === 'string' && !ownedBy(k, userId)) void run('readwrite', (s) => s.delete(k));
}
export async function cacheClear() {
  await run('readwrite', (s) => s.clear());
}
