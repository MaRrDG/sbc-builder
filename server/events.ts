// Keeps the cached club in step with what the user does in the web app, without a club sync:
//  - opening a pack puts its players in "unassigned" (they are not in the club yet);
//  - PUT /item {itemData:[{id, pile}]} moves items: pile "club" -> into the club,
//    any other pile (trade, storage, ...) -> out of the club;
//  - DELETE /item/{id} or /item?itemIds=... (quick sell) -> gone everywhere.
import type { ClubItem } from './ea.js';
import type { Account } from './accounts.js';
import { readCache, writeCache } from './store.js';
import { markEdited } from './sync.js';

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

export async function applyWebAppEvent(acc: Account, ev: WebAppEvent): Promise<string | null> {
  const method = ev.method.toUpperCase();
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
