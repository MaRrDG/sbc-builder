// Keeps the cached club in step with what the user does in the web app, without a club sync:
//  - opening a pack puts its players in "unassigned" (they are not in the club yet);
//  - PUT /item {itemData:[{id, pile}]} moves items: pile "club" -> into the club,
//    any other pile (trade, storage, ...) -> out of the club;
//  - DELETE /item/{id} or /item?itemIds=... (quick sell) -> gone everywhere.
// It also fills the cache from what the web app itself loads, so FC Solver rarely has to ask EA:
//  - GET /sbs/sets, GET /sbs/setId/{id}/challenges -> SBC list and challenges;
//  - POST /club pages -> players upserted; a complete unfiltered scan replaces the club;
//  - GET /squad/list + /squad/{id} (or /squad/active) -> active squad;
//  - GET /chemistry/profiles -> promo chemistry profiles.
import type { ClubItem, Challenge, ChemProfilesResponse } from './ea.js';
import type { Account } from './accounts.js';
import { readCache, writeCache } from './store.js';
import { markEdited, type SetsData } from './sync.js';
import { invalidateMeta } from './meta.js';
import { parseLayout } from './layout.js';
import { softly } from './db/index.js';
import { reportBricks, saveChallenges, saveSets } from './db/sbcs.js';

/** Paths the extension may relay; everything else is rejected by the API. */
export const WATCHED_PATH =
  /^\/(purchased\/items|item(\/\d+)?|club|squad\/(list|active|\d+)|sbs\/sets|sbs\/setId\/\d+\/challenges|sbs\/challenge\/\d+(\/squad)?|chemistry\/profiles)$/;

export interface WebAppEvent {
  method: string;
  path: string;
  query?: string;
  request?: unknown;
  response?: unknown;
}

const CLUB_PILE = 7;

const isPlayer = (i: unknown): i is ClubItem =>
  !!i && typeof i === 'object' && (i as { itemType?: string }).itemType === 'player' && Number.isInteger((i as ClubItem).id);

async function load(acc: Account) {
  const club = await readCache<ClubItem[]>(acc.key('club'));
  const pending = await readCache<ClubItem[]>(acc.key('unassigned'));
  return { club, pending: pending?.data ?? [] };
}

// ---- data the web app loaded ---------------------------------------------------------

type Scan = { order: string; items: Map<number, ClubItem>; next: number; at: number };
const scans = new Map<number, Scan>(); // per account: an unfiltered club listing in progress
const activeSquadIds = new Map<number, number>();
const SCAN_TTL = 10 * 60 * 1000;
// body keys of a plain "all my players" listing; any other key is a filter
const PLAIN_CLUB_KEYS = new Set(['count', 'start', 'sort', 'sortBy', 'type', 'searchAltPositions']);

async function onClubPage(acc: Account, req: Record<string, unknown>, items: ClubItem[]): Promise<string | null> {
  const club = await readCache<ClubItem[]>(acc.key('club'));
  const start = Number(req.start);
  const count = Number(req.count);
  const plain = req.type === 'player' && Object.keys(req).every((k) => PLAIN_CLUB_KEYS.has(k)) && Number.isInteger(start) && count > 0;

  // Track a page-by-page listing of the whole club (the web app pages as you scroll).
  let complete: ClubItem[] | null = null;
  if (plain) {
    const order = `${req.sort}:${req.sortBy}`;
    let scan = scans.get(acc.id);
    if (start === 0) scan = { order, items: new Map(), next: 0, at: Date.now() };
    // pages must follow each other (overlap is fine) in the same order, within a few minutes
    if (scan && scan.order === order && start <= scan.next && Date.now() - scan.at < SCAN_TTL) {
      for (const i of items) scan.items.set(i.id, i);
      scan.next = Math.max(scan.next, start + items.length);
      scan.at = Date.now();
      scans.set(acc.id, scan);
      if (items.length < count) {
        complete = [...scan.items.values()];
        scans.delete(acc.id);
      }
    } else scans.delete(acc.id);
  }

  if (complete) {
    // the whole club, fresh from the web app: same as a club sync, without asking EA
    await writeCache(acc.key('club'), complete);
    const pending = await readCache<ClubItem[]>(acc.key('unassigned'));
    if (pending) {
      const inClub = new Set(complete.map((i) => i.id));
      await writeCache(acc.key('unassigned'), pending.data.filter((p) => !inClub.has(p.id)));
    }
    return `Club updated from the web app (${complete.length} players)`;
  }
  if (!club || items.length === 0) return null;
  // a partial or filtered page: refresh the players it shows, keep the club's sync timestamp
  const byId = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<number>();
  const next = club.data.map((c) => {
    const fresh = byId.get(c.id);
    if (fresh) seen.add(c.id);
    return fresh ?? c;
  });
  const added = items.filter((i) => !seen.has(i.id) && i.pile === CLUB_PILE);
  await writeCache(acc.key('club'), [...next, ...added], club.fetchedAt);
  return added.length ? `${added.length} new club player${added.length === 1 ? '' : 's'} seen in the web app` : null;
}

async function onSquad(acc: Account, squadId: number | 'active', res: { id?: number; players?: { index: number; itemData?: { id?: number } }[] }) {
  const known = activeSquadIds.get(acc.id) ?? (await readCache<{ squadId?: number }>(acc.key('squad')))?.data.squadId;
  if (squadId !== 'active' && squadId !== known) return null; // another saved squad, not the active one
  if (!Array.isArray(res.players)) return null;
  const ids = res.players
    .filter((p) => Number.isInteger(p.itemData?.id) && p.itemData!.id! > 0)
    .sort((a, b) => a.index - b.index)
    .map((p) => ({ index: p.index, id: p.itemData!.id! }));
  await writeCache(acc.key('squad'), {
    squadId: squadId === 'active' ? res.id ?? known : squadId,
    starters: ids.filter((p) => p.index < 11).map((p) => p.id),
    bench: ids.filter((p) => p.index >= 11).map((p) => p.id),
  });
  return 'Active squad updated from the web app';
}

/** Responses the web app loaded for itself; they replace or refresh our cache. Null if not one of them. */
async function applyLoadedData(acc: Account, method: string, ev: WebAppEvent): Promise<string | null | undefined> {
  const res = (ev.response ?? {}) as Record<string, unknown>;
  if (method === 'GET' && ev.path === '/sbs/sets') {
    if (!Array.isArray(res.categories)) return null;
    await writeCache<SetsData>(acc.key('sets'), { categories: res.categories as SetsData['categories'] });
    await softly('save sets', () => saveSets((res.categories as SetsData['categories']).flatMap((c) => c.sets ?? [])));
    return 'SBC list updated from the web app';
  }
  const setId = ev.path.match(/^\/sbs\/setId\/(\d+)\/challenges$/)?.[1];
  if (method === 'GET' && setId) {
    if (!Array.isArray(res.challenges)) return null;
    await writeCache<Challenge[]>(acc.key(`challenges/${setId}`), res.challenges as Challenge[]);
    await softly('save challenges', () => saveChallenges(Number(setId), res.challenges as Challenge[]));
    return 'SBC challenges updated from the web app';
  }
  if (method === 'POST' && ev.path === '/club') {
    const items = (Array.isArray(res.itemData) ? res.itemData : []).filter(isPlayer);
    return onClubPage(acc, (ev.request ?? {}) as Record<string, unknown>, items);
  }
  if (method === 'GET' && ev.path === '/squad/list') {
    if (Number.isInteger(res.activeSquadId)) activeSquadIds.set(acc.id, res.activeSquadId as number);
    return null;
  }
  const squad = ev.path.match(/^\/squad\/(active|\d+)$/)?.[1];
  if (method === 'GET' && squad) return onSquad(acc, squad === 'active' ? 'active' : Number(squad), res);
  // A challenge's squad as the web app sees it (players already placed, EA's fixed "brick" slots).
  // Kept raw for now: the exact shape still has to be read from real responses.
  const sbcSquad = ev.path.match(/^\/sbs\/challenge\/(\d+)(\/squad)?$/);
  if (sbcSquad) {
    const key = acc.key(`challengeSquads/${sbcSquad[1]}`);
    const prev = (await readCache<{ method: string; path: string; request: unknown; response: unknown; at: number }[]>(key))?.data ?? [];
    await writeCache(key, [{ method, path: ev.path, request: ev.request ?? null, response: ev.response ?? null, at: Date.now() }, ...prev].slice(0, 6));
    const layout = method === 'PUT' ? null : parseLayout(ev.response, Date.now());
    if (layout?.bricks.length)
      await softly('report bricks', async () => {
        const why = await reportBricks(Number(sbcSquad[1]), acc.id, layout.bricks, layout.capturedAt);
        if (why) console.warn(`[db] brick report for challenge ${sbcSquad[1]} refused: ${why}`);
      });
    return 'SBC squad updated from the web app'; // non-null: the UI reloads and shows it
  }
  if (method === 'GET' && ev.path === '/chemistry/profiles') {
    if (!Array.isArray(res.profiles)) return null;
    await writeCache<ChemProfilesResponse>(acc.key('chemProfiles'), res as unknown as ChemProfilesResponse);
    invalidateMeta(acc.key('chemProfiles'));
    return null;
  }
  return undefined; // not a data load: fall through to item moves
}

export async function applyWebAppEvent(acc: Account, ev: WebAppEvent): Promise<string | null> {
  const method = ev.method.toUpperCase();
  const loaded = await applyLoadedData(acc, method, ev);
  if (loaded !== undefined) {
    if (loaded) markEdited(acc); // the UI reloads its data when this moves
    return loaded;
  }
  const { club, pending } = await load(acc);
  if (!club) return null; // nothing cached yet; the first sync will have it all

  let clubItems = club.data;
  let unassigned = pending;
  let summary: string | null = null;

  if (ev.path === '/purchased/items') {
    const res = (ev.response ?? {}) as { itemList?: unknown[]; itemData?: unknown[] };
    const players = (res.itemList ?? res.itemData ?? []).filter(isPlayer);
    if (method === 'GET') {
      // the web app listed Unassigned: this is the complete, current list
      unassigned = players;
    } else {
      const fresh = new Set(players.map((p) => p.id));
      unassigned = [...unassigned.filter((p) => !fresh.has(p.id)), ...players];
      if (players.length) summary = `Pack opened: ${players.length} player${players.length === 1 ? '' : 's'} waiting in Unassigned`;
    }
  } else if (ev.path === '/item' && method === 'PUT') {
    const req = (ev.request ?? {}) as { itemData?: { id?: number; pile?: string | number }[] };
    const res = (ev.response ?? {}) as { itemData?: { id?: number; success?: boolean }[] };
    const failed = new Set((res.itemData ?? []).filter((r) => r.success === false).map((r) => r.id));
    const moves = (req.itemData ?? []).filter((m) => Number.isInteger(m.id) && !failed.has(m.id));
    let toClub = 0;
    let out = 0;
    for (const m of moves) {
      const pile = String(m.pile ?? '').toLowerCase();
      if (pile === 'club' || pile === String(CLUB_PILE)) {
        const item = unassigned.find((p) => p.id === m.id);
        if (item && !clubItems.some((c) => c.id === m.id)) {
          clubItems = [...clubItems, { ...item, pile: CLUB_PILE, itemState: 'free' }];
          toClub++;
        }
        unassigned = unassigned.filter((p) => p.id !== m.id);
      } else {
        const before = clubItems.length;
        clubItems = clubItems.filter((c) => c.id !== m.id);
        unassigned = unassigned.filter((p) => p.id !== m.id);
        out += before - clubItems.length;
      }
    }
    if (toClub || out) summary = [toClub && `${toClub} added to club`, out && `${out} left the club`].filter(Boolean).join(', ');
  } else if (ev.path.startsWith('/item') && method === 'DELETE') {
    const fromPath = ev.path.match(/^\/item\/(\d+)$/)?.[1];
    const fromQuery = new URLSearchParams(ev.query ?? '').get('itemIds');
    const ids = new Set([fromPath, ...(fromQuery?.split(',') ?? [])].filter(Boolean).map(Number));
    const before = clubItems.length;
    clubItems = clubItems.filter((c) => !ids.has(c.id));
    unassigned = unassigned.filter((p) => !ids.has(p.id));
    if (before !== clubItems.length) summary = `${before - clubItems.length} quick sold from club`;
  } else {
    return null;
  }

  if (clubItems !== club.data) await writeCache(acc.key('club'), clubItems, club.fetchedAt);
  await writeCache(acc.key('unassigned'), unassigned);
  markEdited(acc);
  return summary;
}
