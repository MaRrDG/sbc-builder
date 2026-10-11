// The players table, kept in memory (a few thousand rows) and written through to Postgres. Fed by
// every cache write that carries EA player items; never calls EA.
import { loadMeta } from '../meta.js';
import { onCacheWrite } from '../store.js';
import { allPlayers, insertNewPlayers, upsertPlayers } from '../db/daily.js';
import { itemsFromCache } from './ingest.js';
import { mergePlayer, observe } from './players.js';
import type { PlayerRow } from './types.js';

const rows = new Map<number, PlayerRow>();
let loaded: Promise<void> | null = null;
let version = 0;
let queue: Promise<unknown> = Promise.resolve();
let names: { v: number; players: { i: number; n: string; f: string; c: number }[] } | null = null;

export function loadPlayers(): Promise<void> {
  return (loaded ??= allPlayers().then(
    (all) => {
      for (const r of all) rows.set(r.assetId, r);
      version++;
    },
    (err) => {
      loaded = null; // a failed load must not stick: the next call retries
      throw err;
    },
  ));
}

export const playerRows = (): Iterable<PlayerRow> => rows.values();
export const playerById = (id: number) => rows.get(id);

/** Merges items into the table; resolves to the number of rows written. One run at a time. */
export function ingestItems(items: unknown[], now = Date.now()): Promise<number> {
  const run = queue.then(async () => {
    await loadPlayers();
    const meta = await loadMeta();
    const changed = new Map<number, PlayerRow>();
    for (const item of items) {
      const o = observe(item);
      if (!o) continue;
      const next = mergePlayer(changed.get(o.assetId) ?? rows.get(o.assetId), o, meta.players[o.assetId], now);
      if (next) changed.set(o.assetId, next);
    }
    if (!changed.size) return 0;
    await upsertPlayers([...changed.values()]);
    for (const r of changed.values()) rows.set(r.assetId, r);
    version++;
    return changed.size;
  });
  queue = run.catch(() => {});
  return run;
}

/** Adds rows for players not in the table yet (Icon seeding); a row already there, here or in Postgres,
 *  is never overwritten. Resolves to the number of rows inserted. Runs in the ingest queue. */
export function seedPlayers(seed: PlayerRow[]): Promise<number> {
  const run = queue.then(async () => {
    await loadPlayers();
    const fresh = seed.filter((r) => !rows.has(r.assetId));
    if (!fresh.length) return 0;
    const ids = new Set(await insertNewPlayers(fresh));
    for (const r of fresh) if (ids.has(r.assetId)) rows.set(r.assetId, r);
    version++;
    return ids.size;
  });
  queue = run.catch(() => {});
  return run;
}

/** Autocomplete list (every player), rebuilt only when the table changed. */
export function namesList() {
  if (names?.v !== version) names = { v: version, players: [...rows.values()].map((r) => ({ i: r.assetId, n: r.name, f: r.fullName, c: r.club })) };
  return names;
}

export function installDailyIngest() {
  onCacheWrite((key, data) => {
    const items = itemsFromCache(key, data);
    if (items.length) ingestItems(items).catch((err) => console.warn('[daily] players write failed:', err));
  });
}
