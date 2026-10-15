// Cache reads for My Squads; nothing here calls EA.
import type { Account } from '../accounts.js';
import type { ClubItem } from '../ea.js';
import type { Meta } from '../meta.js';
import { cachedKeysIn, readCache, readShared, writeCache } from '../store.js';
import { squadRows, squadView, type ActiveIds, type SquadsInput } from './compute.js';
import { parseSquad, parseSquadList, type SquadDetail, type SquadsCache } from './parse.js';

const detailKey = (acc: Account, id: number) => acc.key(`squads/${id}`);

async function input(acc: Account, only?: number): Promise<SquadsInput & { clubAt: number | null }> {
  const [list, active, club] = await Promise.all([
    readCache<SquadsCache>(acc.key('squads')),
    readCache<ActiveIds>(acc.key('squad')),
    readShared<ClubItem[]>(acc.key('club')),
  ]);
  const ids = new Set(only !== undefined ? [only] : (list?.data.list ?? []).map((s) => s.id));
  const activeId = list?.data.activeSquadId ?? active?.data.squadId;
  if (only === undefined && activeId !== undefined && activeId !== null) ids.add(activeId);
  if (only === undefined && !list) // no list cached: every squad the web app opened is still a squad
    for (const key of await cachedKeysIn(acc.key('squads'))) {
      const id = Number(key.split('/').pop());
      if (Number.isSafeInteger(id) && id > 0) ids.add(id);
    }
  const details = new Map<number, { data: SquadDetail; fetchedAt: number }>();
  await Promise.all(
    [...ids].map(async (id) => {
      const d = await readCache<SquadDetail>(detailKey(acc, id));
      if (d) details.set(id, d);
    }),
  );
  return { list: list ?? null, details, active: active?.data ?? null, club: club?.data ?? [], clubAt: club?.fetchedAt ?? null };
}

export async function squadsFor(acc: Account, meta: Meta) {
  const inp = await input(acc);
  return { squads: squadRows(inp, meta), fetchedAt: inp.list?.fetchedAt ?? null, pricesAt: inp.clubAt };
}

export async function squadFor(acc: Account, meta: Meta, id: number) {
  const inp = await input(acc, id);
  const view = squadView(inp, meta, id);
  return view && { ...view, pricesAt: inp.clubAt };
}

/** GET /squad/list the web app (or a club sync) loaded. */
export async function saveSquadList(acc: Account, res: unknown): Promise<boolean> {
  const parsed = parseSquadList(res);
  if (!parsed) return false;
  await writeCache(acc.key('squads'), parsed);
  return true;
}

/** GET /squad/{id} or /squad/active, any squad (not only the active one). */
export async function saveSquad(
  acc: Account, res: unknown, pathId: number | null, allow: (id: number) => Promise<boolean> = async () => true,
): Promise<boolean> {
  const parsed = parseSquad(res, pathId);
  if (!parsed || !(await allow(parsed.id))) return false;
  await writeCache(detailKey(acc, parsed.id), parsed);
  return true;
}
