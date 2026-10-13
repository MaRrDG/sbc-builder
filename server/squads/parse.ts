// The user's saved FUT squads (the web app's "My Squads"), read from what the web app loads:
// GET /squad/list and GET /squad/{id}. Nothing here calls EA. The exact /squad/list shape is not
// confirmed yet, so both parsers read defensively and the list keeps the raw response as well.

/** A squad slot: EA's slot index (0-10 starters, 11+ bench), the item id, and the item when EA sent it. */
export interface SquadSlot {
  index: number;
  itemId: number;
  /** EA's itemData for the slot (club item fields, marketAverage included), when the response carried it */
  item?: Record<string, unknown>;
}

export interface SquadSummary {
  id: number;
  name: string;
  formation: string | null;
  /** EA's own rating for the squad, when the list carries one */
  rating: number | null;
  /** null: the list did not carry the players (EA's /squad/list sends `players: []`; the squad itself has them) */
  players: SquadSlot[] | null;
}

/** Cache key `squads`. */
export interface SquadsCache {
  list: SquadSummary[];
  activeSquadId: number | null;
  /** the response as EA sent it, for when the shape turns out to differ from what we read */
  raw: unknown;
}

/** Cache key `squads/<id>`. */
export interface SquadDetail {
  id: number;
  name: string;
  formation: string | null;
  players: SquadSlot[];
}

const obj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const posInt = (x: unknown): x is number => Number.isInteger(x) && (x as number) > 0;
const str = (x: unknown) => (typeof x === 'string' ? x : null);

/** Players of a squad: `{ index, itemData: {...} }` or `{ index, id }` (ids only); empty slots (id 0) dropped. */
export function parseSlots(players: unknown): SquadSlot[] | null {
  if (!Array.isArray(players)) return null;
  const out: SquadSlot[] = [];
  players.forEach((p, i) => {
    if (posInt(p)) return void out.push({ index: i, itemId: p }); // a bare id list
    if (!obj(p)) return;
    const index = Number.isInteger(p.index) ? (p.index as number) : i;
    const data = obj(p.itemData) ? p.itemData : null;
    const itemId = data ? data.id : (p.itemId ?? p.id);
    if (!posInt(itemId)) return;
    // the item only when it is more than an id (a card we can show / price)
    out.push(data && Object.keys(data).length > 1 ? { index, itemId, item: data } : { index, itemId });
  });
  return out.sort((a, b) => a.index - b.index);
}

const nonEmpty = (slots: SquadSlot[] | null) => (slots?.length ? slots : null);

function parseSummary(s: unknown): SquadSummary | null {
  if (!obj(s)) return null;
  const id = s.id ?? s.squadId;
  if (!Number.isInteger(id) || (id as number) < 0) return null;
  const rating = typeof s.rating === 'number' && Number.isFinite(s.rating) ? s.rating : null;
  return {
    id: id as number,
    name: str(s.squadName) ?? str(s.name) ?? '',
    formation: str(s.formation),
    rating,
    // EA's list sends every squad with `players: []`: empty means "not in the list", not an empty squad
    players: nonEmpty(parseSlots(s.players)),
  };
}

/** GET /squad/list → the cached list; null when the response carries no squad array at all. */
export function parseSquadList(res: unknown): SquadsCache | null {
  if (!obj(res)) return null;
  const arr = [res.squad, res.squads, res.squadList].find(Array.isArray) as unknown[] | undefined;
  if (!arr) return null;
  const seen = new Set<number>();
  const list = arr.map(parseSummary).filter((s): s is SquadSummary => !!s && !seen.has(s.id) && !!seen.add(s.id));
  return { list, activeSquadId: Number.isInteger(res.activeSquadId) ? (res.activeSquadId as number) : null, raw: res };
}

/** GET /squad/{id} (or /squad/active) → one squad; null when it carries no players. */
export function parseSquad(res: unknown, pathId: number | null): SquadDetail | null {
  if (!obj(res)) return null;
  const players = parseSlots(res.players);
  const id = Number.isInteger(res.id) ? (res.id as number) : pathId;
  if (!players || id === null) return null;
  return { id, name: str(res.squadName) ?? str(res.name) ?? '', formation: str(res.formation), players };
}
