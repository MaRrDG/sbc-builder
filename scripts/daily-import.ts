// Fill the Daily players table from what data/accounts already holds, then seed every Icon from
// server/daily/icons.json that is not in the table yet (rows synced from EA items always win, a seeded
// row is never rewritten here), then print the answer pool sizes per rating threshold (to tune
// DAILY_MIN_RATING / DAILY_WOMEN_MIN_RATING). Re-running it also corrects players' gender from the cached
// items and inserts no icon twice. Reads the cache and EA static (data/static.json) only; no EA call.
// Restart the app afterwards: the server loads the players into memory once.
//
// New icons (icons.json re-dump): fut.gg is behind Cloudflare (scripts get 403), so it is a browser step.
// Open https://www.fut.gg/players/ and run in the devtools console:
//   const all = []; for (let n = 1; n; ) { const j = await (await fetch(`/api/fut/players/v2/27/?rarity_id=12&page=${n}`)).json();
//     all.push(...(j.data ?? j.results)); n = j.next; }   // `next`: the next page number, null on the last page
//   copy(JSON.stringify(all.map((x) => ({ assetId: x.basePlayerEaId, nation: x.nation.eaId, position: x.position, gender: x.gender === 2 ? 1 : 0 }))
//     .sort((a, b) => a.assetId - b.assetId)));
// (fut.gg gender 1 man / 2 woman → EA 0 / 1), paste over server/daily/icons.json, keep one entry per
// line, run the tests (server/daily/icons.test.ts checks the count), deploy, run this script.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { initDb, closeDb } from '../server/db/index.js';
import { loadMeta } from '../server/meta.js';
import { DATA_DIR, readCache } from '../server/store.js';
import { itemsFromCache } from '../server/daily/ingest.js';
import { ICONS, iconRows } from '../server/daily/icons.js';
import { ingestItems, loadPlayers, playerById, playerRows, seedPlayers } from '../server/daily/store.js';
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
const meta = await loadMeta();
const seed = iconRows(ICONS, meta.players, { has: (id) => playerById(id) !== undefined }, Date.now());
const added = await seedPlayers(seed.rows);
if (seed.missing.length) console.warn(`icons not in EA static (no name, skipped): ${seed.missing.join(', ')}`);
const all = [...playerRows()];
console.log(`players: ${all.length} rows (${written} written from cached items)`);
console.log(`icons: ${ICONS.length} in icons.json, ${added} added, ${seed.present} already present, ${seed.missing.length} missing from EA static`);
console.log('pool size by min rating:', poolSizes(all, Date.now(), 75, 86));
console.log('women pool size by min rating:', poolSizes(all, Date.now(), 75, 86, 'women'));
console.log(`icon pool size: ${poolSizes(all, Date.now(), 0, 0, 'icons')[0]} (by min rating:`, poolSizes(all, Date.now(), 86, 92, 'icons'), ')');
await closeDb();
