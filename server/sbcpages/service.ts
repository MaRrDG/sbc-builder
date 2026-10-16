// Cached data for the public SBC pages and the IndexNow ping for newly public sets.
import { publicSetRow, publicSetRows, solveRows } from '../db/sbcpages.js';
import { loadMeta } from '../meta.js';
import { readCache, writeCache } from '../store.js';
import { inSitemap, setPath } from './rules.js';
import { summarizeSolves } from './stats.js';
import { listItem, setView, sortList, type SbcListItem, type SbcSetView } from './view.js';

const TTL = 10 * 60_000;
const MAX_ENTRIES = 2000;
const now = () => Math.floor(Date.now() / 1000);
const memo = new Map<string, { at: number; v: unknown }>();
async function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.v as T;
  const v = await fn();
  if (memo.size >= MAX_ENTRIES) memo.clear(); // unknown ids are cached too: bound the map
  memo.set(key, { at: Date.now(), v });
  return v;
}

export const hubData = () => cached('hub', async (): Promise<SbcListItem[]> => sortList((await publicSetRows(now())).map((s) => listItem(s, now()))));

export const setData = (setId: number) =>
  cached(`set:${setId}`, async (): Promise<SbcSetView | null> => {
    const row = await publicSetRow(setId, now());
    if (!row) return null;
    return setView(row.set, row.challenges, await loadMeta(), summarizeSolves(await solveRows(setId)), now());
  });

export const sitemapEntries = () =>
  cached('sitemap', async () => [
    { path: '/sbcs', lastmod: new Date().toISOString().slice(0, 10) },
    ...(await publicSetRows(now())).filter((s) => inSitemap(s.endTime, now())).map((s) => ({ path: setPath(s.setId, s.name), lastmod: s.lastSeen.toISOString().slice(0, 10) })),
  ]);

/** Hourly: sets that became public since the last run are sent to IndexNow (Bing, Yandex…). Off without INDEXNOW_KEY. */
export function startIndexNow(base: string): void {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return;
  const run = async () => {
    try {
      const rows = await publicSetRows(now());
      const seen = new Set((await readCache<number[]>('indexnow'))?.data ?? []);
      const first = seen.size === 0; // first run: remember, don't flood
      const fresh = rows.filter((s) => !seen.has(s.setId));
      if (fresh.length && !first) {
        const res = await fetch('https://api.indexnow.org/indexnow', {
          method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
          body: JSON.stringify({ host: new URL(base).host, key, keyLocation: `${base}/${key}.txt`, urlList: fresh.map((s) => base + setPath(s.setId, s.name)) }),
        });
        if (!res.ok && res.status !== 202) throw new Error(`indexnow ${res.status}`);
      }
      await writeCache('indexnow', rows.map((s) => s.setId));
    } catch (e) {
      console.warn('[indexnow]', (e as Error).message);
    }
  };
  setTimeout(run, 60_000).unref();
  setInterval(run, 3_600_000).unref();
}
