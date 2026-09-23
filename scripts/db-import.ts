// One-off backfill: copies the SBC sets, challenges and brick layouts already cached per account
// (data/accounts/<personaId>/) into Postgres. Safe to run again: everything is upserted / deduplicated.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Challenge } from '../server/ea.js';
import type { SetsData } from '../server/sync.js';
import { DATA_DIR, readCache } from '../server/store.js';
import { parseLayout } from '../server/layout.js';
import { closeDb, initDb } from '../server/db/index.js';
import { reportBricks, saveChallenges, saveSets } from '../server/db/sbcs.js';

const ids = async (dir: string) =>
  (await readdir(dir).catch(() => [] as string[])).map((f) => f.replace(/\.json$/, '')).filter((f) => /^\d+$/.test(f)).map(Number);

await initDb();
const accounts = await ids(join(DATA_DIR, 'accounts'));
let sets = 0, chals = 0, bricks = 0, refused = 0;

// sets and challenges of every account first, so brick reports find their challenge
for (const persona of accounts) {
  const s = await readCache<SetsData>(`accounts/${persona}/sets`);
  const list = s?.data.categories.flatMap((c) => c.sets) ?? [];
  await saveSets(list);
  sets += list.length;
  for (const setId of await ids(join(DATA_DIR, 'accounts', String(persona), 'challenges'))) {
    const ch = (await readCache<Challenge[]>(`accounts/${persona}/challenges/${setId}`))?.data ?? [];
    await saveChallenges(setId, ch);
    chals += ch.length;
  }
}

for (const persona of accounts) {
  for (const challengeId of await ids(join(DATA_DIR, 'accounts', String(persona), 'challengeSquads'))) {
    const caps = (await readCache<{ method: string; response: unknown; at: number }[]>(`accounts/${persona}/challengeSquads/${challengeId}`))?.data ?? [];
    for (const c of caps) {
      if (c.method === 'PUT') continue;
      const layout = parseLayout(c.response, c.at);
      if (!layout?.bricks.length) continue;
      const why = await reportBricks(challengeId, persona, layout.bricks, c.at);
      if (why) {
        refused++;
        console.warn(`challenge ${challengeId} (account ${persona}): refused, ${why}`);
      } else bricks++;
    }
  }
}

console.log(`accounts ${accounts.length}, sets ${sets}, challenges ${chals}, brick reports ${bricks}, refused ${refused}`);
await closeDb();
