// Gallery answer for one persona: best lineup + score per catalogue set, from the ledger.
import type { Account } from '../accounts.js';
import type { ClubItem } from '../ea.js';
import type { Meta } from '../meta.js';
import { toPlayer, type Player } from '../squad.js';
import { readCache } from '../store.js';
import { loadCatalogue } from './catalogue.js';
import { readLedger, toGalleryItem, type Ledger } from './ledger.js';
import { bestLineup } from './optimize.js';
import { nextGrade, scoreSet } from './score.js';
import { rarityKinds } from './tags.js';
import type { GallerySet, Grade, TagResult } from './types.js';

export interface GallerySetResult {
  id: string; name: string; category: GallerySet['category']; size: number;
  filled: number; missing: number; base: number; bonus: number; score: number;
  grade: Grade | null; next: { grade: Grade; need: number } | null;
  grades: Record<Grade, number>; rewards: Partial<Record<Grade, string>>;
  tags: TagResult[];
  lineup: (Player & { inClub: boolean; firstOwner: boolean; score: number })[];
}
export interface GalleryResponse { fetchedAt: number; ledgerSize: number; sets: GallerySetResult[] }

export function buildGallery(sets: GallerySet[], ledger: Ledger, inClub: Set<number>, meta: Meta): GallerySetResult[] {
  const kinds = rarityKinds(meta.names.rarity);
  const entries = Object.values(ledger);
  const pool = entries.map((e) => toGalleryItem(e, kinds));
  const byId = new Map(entries.map((e) => [e.item.id, e]));
  return sets.map((set) => {
    const lineup = bestLineup(set, pool);
    const s = scoreSet(set, lineup);
    return {
      id: set.id, name: set.name, category: set.category, size: set.size,
      filled: s.filled, missing: s.missing, base: s.base, bonus: s.bonus, score: s.total,
      grade: s.grade, next: nextGrade(set, s.total), grades: set.grades, rewards: set.rewards ?? {}, tags: s.tags,
      lineup: lineup.map((g) => {
        const e = byId.get(g.id)!;
        return { ...toPlayer(e.item, meta), inClub: inClub.has(g.id), firstOwner: e.firstOwner, score: g.score };
      }),
    };
  });
}

// per persona: recompute only when the ledger or the club changed
const memo = new Map<number, { key: string; value: GalleryResponse }>();

export async function galleryFor(acc: Account, meta: Meta): Promise<GalleryResponse> {
  const { ledger, at } = await readLedger(acc.id);
  const lists = await Promise.all(['club', 'storage', 'unassigned'].map((n) => readCache<ClubItem[]>(acc.key(n))));
  const key = `${at}:${lists.map((l) => l?.fetchedAt ?? 0).join(':')}:${lists.map((l) => l?.data.length ?? 0).join(':')}`;
  const hit = memo.get(acc.id);
  if (hit?.key === key) return hit.value;
  const inClub = new Set(lists.flatMap((l) => l?.data.map((i) => i.id) ?? []));
  const t0 = performance.now();
  const sets = buildGallery(loadCatalogue(), ledger, inClub, meta);
  console.log(`[gallery] built ${sets.length} sets in ${Math.round(performance.now() - t0)} ms`);
  const value = { fetchedAt: at, ledgerSize: Object.keys(ledger).length, sets };
  memo.set(acc.id, { key, value });
  return value;
}
