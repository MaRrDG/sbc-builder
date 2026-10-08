// One-off: fill the Daily players table from what data/accounts already holds, then print the
// answer pool size per rating threshold (to tune DAILY_MIN_RATING). Reads the cache only; no EA call.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { initDb, closeDb } from '../server/db/index.js';
import { DATA_DIR, readCache } from '../server/store.js';
import { itemsFromCache } from '../server/daily/ingest.js';
import { ingestItems, loadPlayers, playerRows } from '../server/daily/store.js';
import { poolSizes } from '../server/daily/pool.js';

await initDb();
await loadPlayers();
const root = join(DATA_DIR, 'accounts');
let written = 0;
for (const persona of await readdir(root).catch(() => [] as string[])) {
  const keys = ['club', 'storage', 'unassigned', 'objectives'].map((n) => `accounts/${persona}/${n}`);
  const squads = await readdir(join(root, persona, 'challengeSquads')).catch(() => [] as string[]);
  keys.push(...squads.filter((f) => f.endsWith('.json')).map((f) => `accounts/${persona}/challengeSquads/${f.slice(0, -5)}`));
  for (const key of keys) {
    const c = await readCache<unknown>(key);
    if (c) written += await ingestItems(itemsFromCache(key, c.data), c.fetchedAt);
  }
}
const all = [...playerRows()];
console.log(`players: ${all.length} rows (${written} written)`);
console.log('pool size by min rating:', poolSizes(all, Date.now(), 75, 86));
await closeDb();
