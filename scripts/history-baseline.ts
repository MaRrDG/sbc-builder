// One-off (safe to re-run): replay every account's cached SBC list, challenges and objectives through the
// completion history, so tracking starts at deploy instead of at the next web app visit. Reads the cache only.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { closeDb, initDb } from '../server/db/index.js';
import { DATA_DIR, readCache } from '../server/store.js';
import { recordHistory } from '../server/history/ingest.js';

await initDb();
const ids = (await readdir(join(DATA_DIR, 'accounts')).catch(() => [] as string[])).filter((d) => /^\d+$/.test(d));
let files = 0;
for (const id of ids) {
  const keys = [`accounts/${id}/sets`, `accounts/${id}/objectives`];
  for (const f of await readdir(join(DATA_DIR, 'accounts', id, 'challenges')).catch(() => [] as string[]))
    if (/^\d+\.json$/.test(f)) keys.push(`accounts/${id}/challenges/${f.slice(0, -5)}`);
  for (const key of keys) {
    const c = await readCache(key);
    if (!c) continue;
    await recordHistory(key, c.data);
    files++;
  }
}
console.log(`history baseline: ${ids.length} accounts, ${files} cache files replayed`);
await closeDb();
