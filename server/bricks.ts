// Pure rules for shared brick layouts: which challenges have them, how a report is fingerprinted,
// which reports are obviously broken, and which layout wins when accounts disagree.
import { createHash } from 'node:crypto';
import type { BrickSlot } from './layout.js';

/** Brick challenges have locked slots we must know before solving. */
export const isBrickChallenge = (type: string | null | undefined) => !!type && type.toUpperCase().includes('BRICK');

/** Bricks sorted by slot with a fixed key order, so equal layouts serialize equally. */
export function canonicalBricks(bricks: BrickSlot[]): BrickSlot[] {
  return [...bricks]
    .sort((a, b) => a.index - b.index)
    .map((b) => ({
      index: b.index, custom: b.custom, nation: b.nation, league: b.league, club: b.club, rareflag: b.rareflag,
      positions: b.positions ? [...b.positions] : null,
    }));
}

export const layoutHash = (bricks: BrickSlot[]) =>
  createHash('sha256').update(JSON.stringify(canonicalBricks(bricks))).digest('hex');

const isId = (v: unknown) => Number.isInteger(v) && (v as number) >= 0;

/** Why a reported layout cannot be right, or null when it passes. Structural checks only. */
export function rejectReason(challengeType: string | null | undefined, bricks: BrickSlot[]): string | null {
  if (!isBrickChallenge(challengeType)) return 'not a brick challenge';
  if (bricks.length === 0) return 'no locked slots';
  if (bricks.length > 10) return 'every slot locked';
  const seen = new Set<number>();
  for (const b of bricks) {
    if (!Number.isInteger(b.index) || b.index < 0 || b.index > 10) return `slot ${b.index} out of range`;
    if (seen.has(b.index)) return `slot ${b.index} twice`;
    seen.add(b.index);
    if (![b.nation, b.league, b.club, b.rareflag].every(isId)) return 'invalid id';
    if (b.positions !== null && !(Array.isArray(b.positions) && b.positions.every((p) => typeof p === 'string')))
      return 'invalid positions';
  }
  return null;
}

export interface Report {
  personaId: number;
  hash: string;
  bricks: BrickSlot[];
  capturedAt: number;
}

/** Newest trusted report wins; otherwise the layout most distinct accounts sent; ties: earliest seen. */
export function chooseLayout(reports: Report[], trusted: Set<number>): BrickSlot[] | null {
  if (!reports.length) return null;
  const fromTrusted = reports.filter((r) => trusted.has(r.personaId)).sort((a, b) => b.capturedAt - a.capturedAt)[0];
  if (fromTrusted) return fromTrusted.bricks;
  const byHash = new Map<string, { voters: Set<number>; first: number; bricks: BrickSlot[] }>();
  for (const r of reports) {
    const g = byHash.get(r.hash) ?? { voters: new Set<number>(), first: r.capturedAt, bricks: r.bricks };
    g.voters.add(r.personaId);
    g.first = Math.min(g.first, r.capturedAt);
    byHash.set(r.hash, g);
  }
  return [...byHash.values()].sort((a, b) => b.voters.size - a.voters.size || a.first - b.first)[0].bricks;
}
