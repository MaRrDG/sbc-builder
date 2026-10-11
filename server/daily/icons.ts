// Every base Icon (rarity 12) as a possible Daily / Practice answer, even when no account has synced it.
// icons.json (tracked) comes from fut.gg (base icon versions, rarity_id=12): `assetId` = fut.gg
// basePlayerEaId (same ids as EA static LegendsPlayers), `nation` = EA nation id, `position`, `gender`
// in EA terms (0 men, 1 women; fut.gg says 1 / 2). EA static only has names and ratings for icons, so
// nation / position / gender come from here; names and rating from EA static (`Meta.players`).
// Re-dump when EA adds icons: see scripts/daily-import.ts. Seeding: `npm run daily:import`.
// Pure: the store writes the rows (only new ones; a row we synced from EA items is never overwritten).
import { LEGENDS_CLUB_ID, LEGENDS_LEAGUE_ID } from '../meta.js';
import type { PlayerName } from './players.js';
import type { Gender, PlayerRow } from './types.js';
import catalogue from './icons.json' with { type: 'json' };

export interface IconEntry { assetId: number; nation: number; position: string; gender: Gender }

export const ICONS: readonly IconEntry[] = catalogue as IconEntry[];
/** EA rarity of a base Icon card (card art). */
export const ICON_RAREFLAG = 12;

export interface IconSeed {
  /** rows to insert: catalogue icons with an EA static name that are not in `players` yet */
  rows: PlayerRow[];
  /** catalogue icons already in `players` (synced or seeded before), left alone */
  present: number;
  /** catalogue icons EA static does not know (no name → no row) */
  missing: number[];
}

/** Player rows for the catalogue icons not in `existing`. `names` is EA static players + LegendsPlayers
 *  (Meta.players: same name logic as every other row). */
export function iconRows(
  cat: readonly IconEntry[],
  names: Readonly<Record<string, PlayerName | undefined>>,
  existing: { has(assetId: number): boolean },
  now: number,
): IconSeed {
  const out: IconSeed = { rows: [], present: 0, missing: [] };
  for (const ic of cat) {
    if (existing.has(ic.assetId)) {
      out.present++;
      continue;
    }
    const n = names[ic.assetId];
    if (!n || !n.name || !Number.isInteger(n.rating) || n.rating! <= 0) {
      out.missing.push(ic.assetId);
      continue;
    }
    out.rows.push({
      assetId: ic.assetId, name: n.name, fullName: n.full, nation: ic.nation, league: LEGENDS_LEAGUE_ID, club: LEGENDS_CLUB_ID,
      position: ic.position, rating: n.rating!, rareflag: ICON_RAREFLAG, cardType: 'icon', gender: ic.gender, baseClubs: [],
      firstSeen: now, lastSeen: now,
    });
  }
  return out;
}
