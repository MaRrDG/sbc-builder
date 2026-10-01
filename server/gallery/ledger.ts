// Every player item we have seen per persona, kept after it leaves the club: the FUT Gallery counts
// items that passed through the club, and EA does not expose that history to the web app.
// Fed from cache writes (club / storage / unassigned); never calls EA.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ClubItem } from '../ea.js';
import { DATA_DIR, onCacheWrite, readCache, writeCache, type Cached } from '../store.js';
import type { GalleryItem, RarityKind } from './types.js';

export interface LedgerEntry {
  item: ClubItem;
  firstOwner: boolean; // owners <= 1 when first seen; never flips back
  firstSeen: number;
}
export type Ledger = Record<string, LedgerEntry>;

export const LEDGER_KEY = (personaId: number) => `accounts/${personaId}/gallery`;
const WATCHED = /^accounts\/(\d+)\/(club|storage|unassigned)$/;

const isPlayerItem = (v: unknown): v is ClubItem => {
  const o = v as Partial<ClubItem> | null;
  return !!o && typeof o === 'object' && Number.isInteger(o.id) && (o.id ?? 0) > 0 &&
    Number.isInteger(o.assetId) && Number.isInteger(o.rating) && Number.isInteger(o.rareflag) && typeof o.preferredPosition === 'string';
};

/** Player items anywhere inside a raw EA response (SBC squads keep them under itemData). */
export function collectItems(raw: unknown): ClubItem[] {
  const out: ClubItem[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (!v || typeof v !== 'object') return;
    if (isPlayerItem(v)) return void out.push(v);
    Object.values(v).forEach(walk);
  };
  walk(raw);
  return out;
}

const same = (a: ClubItem, b: ClubItem) =>
  a.rating === b.rating && a.rareflag === b.rareflag && (a.gradingScore ?? 0) === (b.gradingScore ?? 0) &&
  a.teamid === b.teamid && a.preferredPosition === b.preferredPosition;

export function mergeLedger(prev: Ledger, items: ClubItem[], now: number): { ledger: Ledger; changed: boolean } {
  const ledger = { ...prev };
  let changed = false;
  for (const item of items) {
    if (item.loansInfo) continue;
    const key = String(item.id);
    const old = ledger[key];
    if (old && same(old.item, item)) continue;
    ledger[key] = { item, firstOwner: old ? old.firstOwner : (item.owners ?? 1) <= 1, firstSeen: old?.firstSeen ?? now };
    changed = true;
  }
  return { ledger, changed };
}

export function toGalleryItem(e: LedgerEntry, kinds: Record<number, RarityKind>): GalleryItem {
  const i = e.item;
  return {
    id: i.id, assetId: i.assetId, rating: i.rating, rareflag: i.rareflag, kind: kinds[i.rareflag] ?? null,
    score: i.gradingScore ?? 0, nation: i.nation, league: i.leagueId, club: i.teamid, gender: i.gender ?? 0,
    position: i.preferredPosition, weakFoot: i.weakfootabilitytypecode ?? 0, skillMoves: i.skillmoves ?? 0,
    firstOwner: e.firstOwner,
  };
}

// one write at a time per persona, so concurrent cache writes never drop entries
const queues = new Map<number, Promise<unknown>>();
function serial<T>(personaId: number, fn: () => Promise<T>): Promise<T> {
  const run = (queues.get(personaId) ?? Promise.resolve()).then(fn, fn);
  queues.set(personaId, run.catch(() => {}));
  return run;
}

export async function readLedgerRaw(personaId: number): Promise<Ledger> {
  return (await readCache<Ledger>(LEDGER_KEY(personaId)))?.data ?? {};
}

async function readSquadCaches(personaId: number): Promise<ClubItem[]> {
  const dir = join(DATA_DIR, 'accounts', String(personaId), 'challengeSquads');
  const files = await readdir(dir).catch(() => [] as string[]);
  const out: ClubItem[] = [];
  for (const f of files.filter((f) => f.endsWith('.json'))) {
    const c = await readCache<unknown>(`accounts/${personaId}/challengeSquads/${f.slice(0, -5)}`);
    out.push(...collectItems(c?.data));
  }
  return out;
}

/** Current ledger; when no ledger file exists yet, backfills from what the cache already holds
 * (club, storage, unassigned, SBC squads). Call only inside serial(). */
async function loadOrBackfill(personaId: number): Promise<Cached<Ledger>> {
  const existing = await readCache<Ledger>(LEDGER_KEY(personaId));
  if (existing) return existing;
  const acc = (n: string) => `accounts/${personaId}/${n}`;
  const lists = await Promise.all(['club', 'storage', 'unassigned'].map(async (n) => (await readCache<ClubItem[]>(acc(n)))?.data ?? []));
  const squads = await readSquadCaches(personaId);
  const { ledger } = mergeLedger({}, [...lists.flat(), ...squads], Date.now());
  return writeCache(LEDGER_KEY(personaId), ledger);
}

export function recordItems(personaId: number, items: ClubItem[]): Promise<void> {
  return serial(personaId, async () => {
    const cur = await loadOrBackfill(personaId);
    const { ledger, changed } = mergeLedger(cur.data, items, Date.now());
    if (changed) await writeCache(LEDGER_KEY(personaId), ledger);
  });
}

export function readLedger(personaId: number): Promise<{ ledger: Ledger; at: number }> {
  return serial(personaId, async () => {
    const entry = await loadOrBackfill(personaId);
    return { ledger: entry.data, at: entry.fetchedAt };
  });
}

export function installLedger() {
  onCacheWrite((key, data) => {
    const m = WATCHED.exec(key);
    if (!m || !Array.isArray(data)) return;
    recordItems(Number(m[1]), data as ClubItem[]).catch((err) => console.warn('[gallery] ledger write failed:', err));
  });
}
