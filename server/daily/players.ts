// One row per player (assetId) for the Daily game, merged from every EA item the server caches.
// Only base cards (rareflag 0 / 1) move club, league and rating; special cards only prove the player
// exists. Pure: the store (store.ts) feeds it and writes changed rows to Postgres.
import { HERO_CLUB_ID, LEGENDS_CLUB_ID, LEGENDS_LEAGUE_ID } from '../meta.js';
import type { CardType, PlayerRow } from './types.js';

export const DAY = 86_400_000;
/** A row is rewritten for a mere "seen again" at most this often (keeps cache writes from churning the DB). */
export const SEEN_STEP = 12 * 3_600_000;
export const TRANSFER_WINDOW = 14 * DAY;
const MAX_BASE_CLUBS = 6;

export interface Observation { assetId: number; rareflag: number; rating: number; nation: number; league: number; club: number; position: string }
export interface PlayerName { name: string; full: string; rating?: number }

const id = (v: unknown): v is number => Number.isInteger(v) && (v as number) > 0;

export function observe(v: unknown): Observation | null {
  const o = v as Record<string, unknown> | null;
  if (!o || typeof o !== 'object' || o.itemType !== 'player') return null;
  const club = o.teamid ?? o.teamId; // club items say teamid, objective rewards teamId
  const { assetId, rareflag, rating, nation, leagueId, preferredPosition } = o;
  if (!id(assetId) || !Number.isInteger(rareflag) || (rareflag as number) < 0 || !id(rating) || !id(nation) || !id(leagueId) || !id(club)) return null;
  if (typeof preferredPosition !== 'string' || !preferredPosition) return null;
  return { assetId, rareflag: rareflag as number, rating, nation, league: leagueId, club, position: preferredPosition };
}

export const isBase = (o: { rareflag: number }) => o.rareflag === 0 || o.rareflag === 1;

export function cardTypeOf(o: { club: number; league: number }): CardType {
  if (o.club === LEGENDS_CLUB_ID || o.league === LEGENDS_LEAGUE_ID) return 'icon';
  return o.club === HERO_CLUB_ID ? 'hero' : 'normal';
}

export const baseSeen = (r: PlayerRow): number | null => (r.baseClubs.length ? Math.max(...r.baseClubs.map((c) => c.lastSeen)) : null);

export function inTransfer(r: PlayerRow, now: number): boolean {
  return new Set(r.baseClubs.filter((c) => now - c.lastSeen < TRANSFER_WINDOW).map((c) => c.club)).size >= 2;
}

export function mergePlayer(prev: PlayerRow | undefined, o: Observation, names: PlayerName | undefined, now: number): PlayerRow | null {
  const base = isBase(o);
  if (!prev) {
    if (!names) return null;
    return {
      assetId: o.assetId, name: names.name, fullName: names.full, nation: o.nation, league: o.league, club: o.club,
      position: o.position, rating: base ? o.rating : (names.rating ?? o.rating), rareflag: o.rareflag, cardType: cardTypeOf(o),
      baseClubs: base ? [{ club: o.club, league: o.league, lastSeen: now }] : [], firstSeen: now, lastSeen: now,
    };
  }
  const seenStale = now - prev.lastSeen >= SEEN_STEP;
  if (!base) return seenStale ? { ...prev, lastSeen: now } : null;
  const old = prev.baseClubs.find((c) => c.club === o.club);
  const fresh = !old || old.league !== o.league || now - old.lastSeen >= SEEN_STEP;
  const baseClubs = fresh
    ? [{ club: o.club, league: o.league, lastSeen: now }, ...prev.baseClubs.filter((c) => c.club !== o.club)]
        .sort((a, b) => b.lastSeen - a.lastSeen)
        .slice(0, MAX_BASE_CLUBS)
    : prev.baseClubs;
  const cur = baseClubs[0];
  const next: PlayerRow = {
    ...prev,
    ...(names ? { name: names.name, fullName: names.full } : {}),
    club: cur.club, league: cur.league, rating: o.rating, rareflag: o.rareflag, nation: o.nation, position: o.position,
    cardType: cardTypeOf(o), baseClubs, lastSeen: fresh || seenStale ? now : prev.lastSeen,
  };
  return JSON.stringify(next) === JSON.stringify(prev) ? null : next;
}
