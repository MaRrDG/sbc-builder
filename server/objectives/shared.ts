// The shared objectives catalogue: trusted accounts relay EA's list, we keep it without anything personal, and
// accounts that have not opened Objectives in the web app (or miss a newer group) see it with progress unknown.
import type { EaAward, EaCategory, EaGroup, EaObjective, ObjectiveGroupView } from './types.js';

export const SHARED_OBJECTIVES_KEY = 'shared/objectives';

const list = <T>(x: unknown): T[] => (Array.isArray(x) ? x : []);
const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

const pick = <T extends object>(src: Record<string, unknown>, keys: (keyof T)[]): Partial<T> => {
  const out: Record<string, unknown> = {};
  for (const k of keys) if (src[k as string] !== undefined) out[k as string] = src[k as string];
  return out as Partial<T>;
};

/**
 * A reward with only the fields the site reads (a whitelist): EA's item data also carries the account's own
 * state (isCollected ...) and art / stats we never show. Used for the shared copy and for every answer.
 */
export function trimAward(a: EaAward): EaAward {
  const out = pick<EaAward>(a as unknown as Record<string, unknown>, ['value', 'awardType', 'count', 'untradeable']) as EaAward;
  const r = a.itemDataReduced;
  if (isObj(r)) out.itemDataReduced = pick<NonNullable<EaAward['itemDataReduced']>>(r, ['itemType', 'assetId', 'rating', 'preferredPosition', 'description']);
  return out;
}

const awards = (x: unknown) => list<EaAward>(x).filter(isObj).map(trimAward);

/**
 * Only the fields that describe the catalogue are kept (a whitelist, so a new personal field from EA never
 * leaks): groups, titles, texts, targets, rewards and times. State, progress and completion counts go.
 */
export function stripPersonal(categories: EaCategory[]): EaCategory[] {
  return list<EaCategory>(categories).filter(isObj).map((c) => ({
    categoryId: c.categoryId,
    name: c.name,
    groupsList: list<EaGroup>(c.groupsList).filter(isObj).map((g) => ({
      groupId: g.groupId,
      title: g.title,
      startTime: g.startTime,
      endTime: g.endTime,
      awardsList: awards(g.awardsList),
      objectives: list<EaObjective>(g.objectives).filter(isObj).map((o) => ({
        objectiveId: o.objectiveId,
        name: o.name,
        description: o.description,
        multiplier: o.multiplier,
        awards: awards(o.awards),
      })),
    })),
  }));
}

/**
 * The account's own groups (with progress) win per group id; groups only in the shared catalogue are added
 * with progress unknown and nothing done. source: where the list comes from ('shared' when the account has
 * no objectives of its own), null when there is neither.
 */
export function mergeGroups(own: ObjectiveGroupView[] | null, shared: ObjectiveGroupView[] | null): {
  source: 'own' | 'shared' | null; groups: ObjectiveGroupView[];
} {
  if (!own && !shared) return { source: null, groups: [] };
  const mine = (own ?? []).map((g) => ({ ...g, progressKnown: true }));
  const have = new Set(mine.map((g) => g.id));
  const extra = (shared ?? [])
    .filter((g) => !have.has(g.id))
    .map((g) => ({ ...g, progressKnown: false, objectives: g.objectives.map((o) => ({ ...o, progress: null, done: false })) }));
  return { source: own ? 'own' : 'shared', groups: [...mine, ...extra] };
}

const named = (a: EaAward, players: Record<string, { name: string }>): EaAward => {
  const r = a.itemDataReduced;
  if (a.awardType !== 'item' || r?.itemType !== 'player' || r.assetId === undefined) return a;
  const name = players[String(r.assetId)]?.name;
  return name ? { ...a, name } : a;
};

/** Player item rewards get the player's name (the site has no player list); the input is not changed. */
export function nameAwards(groups: ObjectiveGroupView[], players: Record<string, { name: string }>): ObjectiveGroupView[] {
  return groups.map((g) => ({
    ...g,
    awards: g.awards.map((a) => named(a, players)),
    objectives: g.objectives.map((o) => ({ ...o, awards: o.awards.map((a) => named(a, players)) })),
  }));
}
