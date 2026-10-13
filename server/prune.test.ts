import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pruneAccounts, type PruneDeps } from './prune.js';

const DAY = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 13);

function fakes(o: {
  ids?: number[];
  owned?: number[];
  trusted?: number[];
  cache?: Record<number, number | null>;
  events?: Record<number, number>;
  live?: number[];
  ownerNow?: Record<number, string>;
  rowsRefuse?: number[];
  dropFails?: number[];
  signalsFail?: boolean;
} = {}) {
  const calls: string[] = [];
  const errors: unknown[] = [];
  const deps: PruneDeps = {
    cachedAccountIds: async () => o.ids ?? [],
    newestAccountWrite: async (id) => (o.cache && id in o.cache ? o.cache[id] : now - 200 * DAY),
    pruneSignalsOf: async () => {
      if (o.signalsFail) throw new Error('db down');
      return {
        owned: new Set(o.owned ?? []),
        trusted: new Set(o.trusted ?? []),
        lastEvent: new Map(Object.entries(o.events ?? {}).map(([k, v]) => [Number(k), v])),
        lastLink: new Map(),
      };
    },
    isLive: (id) => (o.live ?? []).includes(id),
    ownerOf: async (id) => o.ownerNow?.[id] ?? null,
    purgeOrphanPersonaRows: async (id) => {
      calls.push(`rows:${id}`);
      return !(o.rowsRefuse ?? []).includes(id);
    },
    anonymizePersonaEvents: async (id) => void calls.push(`anon:${id}`),
    forgetAccount: (id) => void calls.push(`forget:${id}`),
    dropKeys: async (p) => {
      if ((o.dropFails ?? []).some((id) => p === `accounts/${id}`)) throw new Error('rm failed');
      calls.push(`drop:${p}`);
    },
    logPruned: () => void calls.push('log'),
    onError: async (e) => void errors.push(e),
  };
  return { calls, errors, deps };
}

test('prunes an ownerless quiet account: rows, events, memory, folder, log', async () => {
  const f = fakes({ ids: [7] });
  assert.deepEqual(await pruneAccounts(now, f.deps), [7]);
  assert.deepEqual(f.calls, ['rows:7', 'anon:7', 'forget:7', 'drop:accounts/7', 'log']);
});

test('keeps owned, trusted, live, recent and unreadable ones', async () => {
  const f = fakes({
    ids: [1, 2, 3, 4, 5, 6],
    owned: [1],
    trusted: [2],
    live: [3],
    events: { 4: now - 5 * DAY },
    cache: { 5: null, 6: now - 10 * DAY },
  });
  assert.deepEqual(await pruneAccounts(now, f.deps), []);
  assert.deepEqual(f.calls, []);
});

test('linked since the signals were read, or rows guard refuses: nothing touched', async () => {
  const f = fakes({ ids: [1, 2], ownerNow: { 1: 'user_a' }, rowsRefuse: [2] });
  assert.deepEqual(await pruneAccounts(now, f.deps), []);
  assert.deepEqual(f.calls, ['rows:2']);
});

test('a DB failure while reading signals prunes nothing and alerts', async () => {
  const f = fakes({ ids: [1], signalsFail: true });
  assert.deepEqual(await pruneAccounts(now, f.deps), []);
  assert.equal(f.calls.length, 0);
  assert.equal(f.errors.length, 1);
});

test('one failure alerts and the others still go', async () => {
  const f = fakes({ ids: [1, 2], dropFails: [1] });
  assert.deepEqual(await pruneAccounts(now, f.deps), [2]);
  assert.equal(f.errors.length, 1);
});
