// Every player item we have seen per persona, kept after it leaves the club: the FUT Gallery counts
// items that passed through the club, and EA does not expose that history to the web app.
// Fed from cache writes (club / storage / unassigned); never calls EA.
// Stored slim (only what scoring and the lineup card need) and kept in memory once loaded.
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { ClubItem } from '../ea.js';
import { placedItems } from '../layout.js';
import { DATA_DIR, onCacheWrite, readCache, writeCache } from '../store.js';
import type { GalleryItem, RarityKind } from './types.js';

/** The ClubItem fields the Gallery uses: toGalleryItem (scoring) and toPlayer (lineup card). */
export type LedgerItem = Pick<
  ClubItem,
  'id' | 'assetId' | 'resourceId' | 'rating' | 'rareflag' | 'preferredPosition' | 'possiblePositions' | 'teamid' | 'leagueId' |
  'nation' | 'untradeable' | 'gradingScore' | 'gender' | 'weakfootabilitytypecode' | 'skillmoves' | 'guidAssetId'
>;

export interface LedgerEntry {
  item: LedgerItem;
  firstOwner: boolean; // owners <= 1 when first seen (unknown owners = not first owner); never flips back
  firstSeen: number;
}
export type Ledger = Record<string, LedgerEntry>;

/** Bumped when the stored shape changes; a file with another version is rebuilt from the cache. */
export const LEDGER_VERSION = 2;
interface LedgerFile { v: number; entries: Ledger }

export const LEDGER_KEY = (personaId: number) => `accounts/${personaId}/gallery`;
const WATCHED = /^accounts\/(\d+)\/(club|storage|unassigned)$/;

const int = (v: unknown) => Number.isInteger(v);

/** A player item the Gallery can score and render; anything else (bricks, tokens, half items) is skipped. */
export function isLedgerItem(v: unknown): v is LedgerItem {
  const o = v as Partial<ClubItem> | null;
  return !!o && typeof o === 'object' && int(o.id) && (o.id ?? 0) > 0 && int(o.assetId) && int(o.rating) && int(o.rareflag) &&
    int(o.teamid) && int(o.leagueId) && int(o.nation) && typeof o.preferredPosition === 'string' &&
    Array.isArray(o.possiblePositions) && o.possiblePositions.every((p) => typeof p === 'string');
}

/** Real player items placed in SBC squad captures: field slots only, no bricks / dream / concept items. */
export function collectSquadItems(captures: unknown): ClubItem[] {
  if (!Array.isArray(captures)) return [];
  const out: ClubItem[] = [];
  for (const c of captures as { response?: unknown }[]) {
    for (const item of placedItems(c?.response)) {
      if (item.itemType === 'player' && isLedgerItem(item)) out.push(item as unknown as ClubItem);
    }
  }
  return out;
}

export function slim(i: LedgerItem): LedgerItem {
  const out: LedgerItem = {
    id: i.id, assetId: i.assetId, resourceId: i.resourceId, rating: i.rating, rareflag: i.rareflag,
    preferredPosition: i.preferredPosition, possiblePositions: [...i.possiblePositions], teamid: i.teamid, leagueId: i.leagueId,
    nation: i.nation, untradeable: !!i.untradeable,
  };
  if (i.gradingScore !== undefined) out.gradingScore = i.gradingScore;
  if (i.gender !== undefined) out.gender = i.gender;
  if (i.weakfootabilitytypecode !== undefined) out.weakfootabilitytypecode = i.weakfootabilitytypecode;
  if (i.skillmoves !== undefined) out.skillmoves = i.skillmoves;
  if (i.guidAssetId !== undefined) out.guidAssetId = i.guidAssetId;
  return out;
}

const same = (a: LedgerItem, b: LedgerItem) =>
  a.rating === b.rating && a.rareflag === b.rareflag && (a.gradingScore ?? 0) === (b.gradingScore ?? 0) &&
  a.teamid === b.teamid && a.preferredPosition === b.preferredPosition;

export function mergeLedger(prev: Ledger, items: ClubItem[], now: number): { ledger: Ledger; changed: boolean } {
  const ledger = { ...prev };
  let changed = false;
  for (const item of items) {
    if (item.loansInfo || !isLedgerItem(item)) continue;
    const key = String(item.id);
    const old = ledger[key];
    if (old && same(old.item, item)) continue;
    const firstOwner = old ? old.firstOwner : typeof item.owners === 'number' && item.owners <= 1;
    ledger[key] = { item: slim(item), firstOwner, firstSeen: old?.firstSeen ?? now };
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

/** The loaded ledger per persona; `rev` changes on every write (memo key for the Gallery answer). */
interface Loaded { ledger: Ledger; at: number; rev: number }
const loaded = new Map<number, Loaded>();
let revs = 0;

export async function readLedgerRaw(personaId: number): Promise<Ledger> {
  const f = (await readCache<LedgerFile>(LEDGER_KEY(personaId)))?.data;
  return f?.v === LEDGER_VERSION ? f.entries : {};
}

async function readSquadCaches(personaId: number): Promise<ClubItem[]> {
  const dir = join(DATA_DIR, 'accounts', String(personaId), 'challengeSquads');
  const files = await readdir(dir).catch(() => [] as string[]);
  const out: ClubItem[] = [];
  for (const f of files.filter((f) => f.endsWith('.json'))) {
    const c = await readCache<unknown>(`accounts/${personaId}/challengeSquads/${f.slice(0, -5)}`);
    out.push(...collectSquadItems(c?.data));
  }
  return out;
}

async function save(personaId: number, ledger: Ledger): Promise<Loaded> {
  const c = await writeCache<LedgerFile>(LEDGER_KEY(personaId), { v: LEDGER_VERSION, entries: ledger });
  const l = { ledger, at: c.fetchedAt, rev: ++revs };
  loaded.set(personaId, l);
  return l;
}

/** Current ledger (memory, else disk); when no current-version file exists yet, backfills from what
 * the cache already holds (club, storage, unassigned, SBC squads). Call only inside serial(). */
async function loadOrBackfill(personaId: number): Promise<Loaded> {
  const mem = loaded.get(personaId);
  if (mem) return mem;
  const existing = await readCache<LedgerFile>(LEDGER_KEY(personaId));
  if (existing?.data?.v === LEDGER_VERSION && existing.data.entries && typeof existing.data.entries === 'object') {
    const ledger: Ledger = {};
    for (const [k, e] of Object.entries(existing.data.entries)) if (e && isLedgerItem(e.item)) ledger[k] = e;
    const l = { ledger, at: existing.fetchedAt, rev: ++revs };
    loaded.set(personaId, l);
    return l;
  }
  // no ledger yet, or an older format (full DTOs): rebuild from the cache
  const acc = (n: string) => `accounts/${personaId}/${n}`;
  const lists = await Promise.all(['club', 'storage', 'unassigned'].map(async (n) => (await readCache<ClubItem[]>(acc(n)))?.data ?? []));
  const squads = await readSquadCaches(personaId);
  const { ledger } = mergeLedger({}, [...lists.flat(), ...squads], Date.now());
  return save(personaId, ledger);
}

export function recordItems(personaId: number, items: ClubItem[]): Promise<void> {
  return serial(personaId, async () => {
    const cur = await loadOrBackfill(personaId);
    const { ledger, changed } = mergeLedger(cur.ledger, items, Date.now());
    if (changed) await save(personaId, ledger);
  });
}

export function readLedger(personaId: number): Promise<Loaded> {
  return serial(personaId, () => loadOrBackfill(personaId));
}

/** Tests only: forget the in-memory copies so the next read goes to disk. */
export function forgetLedgers() {
  loaded.clear();
}

export function installLedger() {
  onCacheWrite((key, data) => {
    const m = WATCHED.exec(key);
    if (!m || !Array.isArray(data)) return;
    recordItems(Number(m[1]), data as ClubItem[]).catch((err) => console.warn('[gallery] ledger write failed:', err));
  });
}
