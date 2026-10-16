// The public view of one SBC set: what both the server HTML (html.ts) and /api/public/sbcs/:id show.
import type { ChallengeRow, SetRow } from '../db/sbcpages.js';
import type { Meta } from '../meta.js';
import { parseRequirements } from '../sbc.js';
import { formatAward, isExpired, setPath } from './rules.js';

export interface SbcChallengeView { id: number; name: string; formation: string | null; requirements: string[]; rewards: string[] }
export interface SbcSetView {
  id: number; path: string; name: string; description: string; categoryId: number | null;
  endTime: number | null; expired: boolean; repeatability: 'once' | 'unlimited' | 'refresh';
  repeats: number | null; refreshHours: number | null; rewards: string[];
  challenges: SbcChallengeView[]; stats: { solvers: number; foundPct: number } | null;
}
export interface SbcListItem { id: number; path: string; name: string; endTime: number | null; expired: boolean; challenges: number; rewards: string[] }

const rewards = (raw: Record<string, unknown> | null | undefined) =>
  (Array.isArray(raw?.awards) ? (raw.awards as unknown[]) : []).map(formatAward).filter((x): x is string => !!x);

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);

function repeat(set: SetRow): Pick<SbcSetView, 'repeatability' | 'repeats' | 'refreshHours'> {
  if (set.repeatabilityMode === 'UNLIMITED') return { repeatability: 'unlimited', repeats: null, refreshHours: null };
  if (set.repeatabilityMode === 'REFRESH') {
    const sec = num(set.raw?.repeatRefreshInterval);
    return { repeatability: 'refresh', repeats: num(set.raw?.repeats), refreshHours: sec ? Math.round(sec / 3600) : null };
  }
  return { repeatability: 'once', repeats: null, refreshHours: null };
}

/** Relayed requirements can be malformed: one bad challenge shows no requirements instead of breaking the page. */
function requirements(c: ChallengeRow, meta: Meta): string[] {
  try {
    return Array.isArray(c.elgReq) ? parseRequirements(c.elgReq, meta).map((r) => r.text) : [];
  } catch {
    return [];
  }
}

export function setView(set: SetRow, list: ChallengeRow[], meta: Meta, stats: SbcSetView['stats'], nowSec: number): SbcSetView {
  return {
    id: set.setId, path: setPath(set.setId, set.name), name: set.name, description: set.description, categoryId: set.categoryId,
    endTime: set.endTime, expired: isExpired(set.endTime, nowSec), ...repeat(set), rewards: rewards(set.raw),
    challenges: [...list].sort((a, b) => a.challengeId - b.challengeId).map((c) => ({
      id: c.challengeId, name: c.name, formation: c.formation,
      requirements: requirements(c, meta), rewards: rewards(c.raw),
    })),
    stats,
  };
}

export const listItem = (set: SetRow, nowSec: number): SbcListItem => ({
  id: set.setId, path: setPath(set.setId, set.name), name: set.name, endTime: set.endTime,
  expired: isExpired(set.endTime, nowSec), challenges: num(set.raw?.challengesCount) ?? 0, rewards: rewards(set.raw),
});

export function sortList(items: SbcListItem[]): SbcListItem[] {
  const end = (x: SbcListItem) => x.endTime ?? Number.MAX_SAFE_INTEGER;
  return [...items.filter((x) => !x.expired).sort((a, b) => end(a) - end(b)), ...items.filter((x) => x.expired).sort((a, b) => end(b) - end(a))];
}
