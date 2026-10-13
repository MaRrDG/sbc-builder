// My Squads (Premium): the list and one squad with its value, put together from the cache only.
// Pure: the reads live in io.ts.
import type { ClubItem } from '../ea.js';
import type { Meta } from '../meta.js';
import { chemistry, squadRating, toPlayer, type Player } from '../squad.js';
import type { SquadDetail, SquadSlot, SquadsCache, SquadSummary } from './parse.js';
import { STARTERS, squadValue, type SquadValue } from './value.js';

/** The old active-squad cache (`squad`): ids only. */
export interface ActiveIds {
  squadId?: number;
  starters: number[];
  bench: number[];
  formation?: string;
}

export interface SquadsInput {
  list: { data: SquadsCache; fetchedAt: number } | null;
  /** `squads/<id>` caches, by squad id */
  details: Map<number, { data: SquadDetail; fetchedAt: number }>;
  active: ActiveIds | null;
  club: readonly ClubItem[];
}

export interface SquadRow {
  id: number;
  name: string;
  formation: string | null;
  active: boolean;
  rating: number | null;
  value: SquadValue;
  /** players known (loaded from the list or the squad itself); false: open it once in the web app */
  loaded: boolean;
}

export interface SquadSlotView {
  index: number;
  itemId: number;
  /** the card; null when the item is neither in the club nor described by EA's response */
  player: Player | null;
  value: number | null;
  loan: boolean;
  /** chemistry of a starter (0-3), null on the bench */
  chem: number | null;
}

export interface SquadView extends SquadRow {
  chemistry: number | null;
  fetchedAt: number | null;
  slots: SquadSlotView[];
}

const isCard = (i: Record<string, unknown> | undefined): i is Record<string, unknown> & ClubItem =>
  !!i && Number.isInteger(i.assetId) && Number.isInteger(i.rating) && Array.isArray(i.possiblePositions);

/** The squad's slots: its own load first (or the list's, when newer), else the active-squad ids. */
function slotsOf(id: number, summary: SquadSummary | undefined, input: SquadsInput): { slots: SquadSlot[]; at: number | null } | null {
  const detail = input.details.get(id);
  const fromList = summary?.players?.length ? summary.players : null; // [] (EA's list, older caches) = not loaded
  if (detail && (!fromList || detail.fetchedAt >= (input.list?.fetchedAt ?? 0))) return { slots: detail.data.players, at: detail.fetchedAt };
  if (fromList) return { slots: fromList, at: input.list?.fetchedAt ?? null };
  if (input.active && input.active.squadId === id && input.active.starters.length) {
    const slots = [
      ...input.active.starters.map((itemId, index) => ({ index, itemId })),
      ...input.active.bench.map((itemId, i) => ({ index: STARTERS + i, itemId })),
    ];
    return { slots, at: null };
  }
  return null;
}

function activeId(input: SquadsInput): number | null {
  return input.list?.data.activeSquadId ?? input.active?.squadId ?? null;
}

/** Every squad we know of: the list, plus the active squad when no list was loaded yet. */
function summaries(input: SquadsInput): SquadSummary[] {
  const list = input.list?.data.list ?? [];
  const ids = new Set(list.map((s) => s.id));
  const extra: SquadSummary[] = [];
  for (const [id, d] of input.details)
    if (!ids.has(id)) extra.push({ id, name: d.data.name, formation: d.data.formation, rating: null, players: null });
  const active = input.active?.squadId;
  if (active !== undefined && !ids.has(active) && !input.details.has(active))
    extra.push({ id: active, name: '', formation: input.active?.formation ?? null, rating: null, players: null });
  return [...list, ...extra];
}

function build(summary: SquadSummary, input: SquadsInput, clubById: Map<number, ClubItem>, meta: Meta): SquadView {
  const got = slotsOf(summary.id, summary, input);
  const detail = input.details.get(summary.id)?.data;
  const formation = detail?.formation ?? summary.formation ?? (input.active?.squadId === summary.id ? input.active.formation ?? null : null);
  const slots = got?.slots ?? [];
  const { slots: values, value } = squadValue(slots, clubById);
  const players = slots.map((s) => {
    const club = clubById.get(s.itemId);
    if (club) return toPlayer(club, meta);
    return isCard(s.item) ? toPlayer(s.item, meta) : null;
  });
  const starters = slots.map((s, i) => (s.index < STARTERS ? players[i] : null));
  const ratings = starters.filter((p): p is Player => !!p).map((p) => p.rating);
  const rating = ratings.length ? squadRating(ratings) : summary.rating;
  // chemistry needs the formation's slot types and the starters at their slot index
  const positions = formation ? meta.formations[formation] : undefined;
  let chem: number[] | null = null;
  if (positions && ratings.length) {
    const byIndex: (Player | null)[] = positions.map(() => null);
    slots.forEach((s, i) => {
      if (s.index < positions.length) byIndex[s.index] = players[i];
    });
    chem = chemistry(byIndex, positions.map((p) => p.typeId), meta).perSlot;
  }
  return {
    id: summary.id,
    name: detail?.name || summary.name,
    formation,
    active: activeId(input) === summary.id,
    rating: rating ?? null,
    value,
    loaded: got !== null, // players known, even when the squad is empty
    chemistry: chem ? chem.reduce((a, b) => a + b, 0) : null,
    fetchedAt: got?.at ?? null,
    slots: slots.map((s, i) => ({
      index: s.index,
      itemId: s.itemId,
      player: players[i],
      value: values[i].value,
      loan: values[i].loan,
      chem: chem && s.index < STARTERS ? (chem[s.index] ?? 0) : null,
    })),
  };
}

const clubMap = (club: readonly ClubItem[]) => new Map(club.map((c) => [c.id, c]));

/** GET /api/squads rows: active first, then the most valuable. */
export function squadRows(input: SquadsInput, meta: Meta): SquadRow[] {
  const byId = clubMap(input.club);
  return summaries(input)
    .map((s) => {
      const { id, name, formation, active, rating, value, loaded } = build(s, input, byId, meta);
      return { id, name, formation, active, rating, value, loaded };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.value.total - a.value.total || a.id - b.id);
}

/** GET /api/squads/:id, or null when we know no such squad. */
export function squadView(input: SquadsInput, meta: Meta, id: number): SquadView | null {
  const summary = summaries(input).find((s) => s.id === id);
  return summary ? build(summary, input, clubMap(input.club), meta) : null;
}
