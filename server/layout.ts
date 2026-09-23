// What a challenge's squad already holds, read from the web app's own response to
// POST /sbs/challenge/{id} (first open) or GET /sbs/challenge/{id}/squad (reopen):
//   { squad: { players: [{ index, itemData }] }, playerRequirements: [{ index, playerType, elgReq }] }
// Mirrors UTSquadEntityFactory.generateSBCSquadConstructorOptions:
//  - playerType BRICK: slot locked by EA, empty, counts for nothing;
//  - playerType CUSTOM_BRICK: locked placeholder with a club / league / nation that takes part
//    in chemistry like a player, but not in rating or requirement counts;
//  - any other slot holding an item: a player the user already placed.
import type { Account } from './accounts.js';
import { readCache } from './store.js';
import { Key } from './sbc.js';

export interface BrickSlot {
  index: number;
  custom: boolean;
  nation: number;
  league: number;
  club: number;
  rareflag: number;
  positions: string[] | null; // from the brick item when EA sends them
}

export interface ChallengeLayout {
  bricks: BrickSlot[];
  placed: { index: number; itemId: number }[];
  capturedAt: number;
}

interface Capture {
  method: string;
  path: string;
  request: unknown;
  response: unknown;
  at: number;
}

type Obj = Record<string, unknown>;
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function parseLayout(response: unknown, capturedAt: number): ChallengeLayout | null {
  const r = (response ?? {}) as Obj;
  const squad = (r.squad ?? null) as Obj | null;
  if (!squad || !Array.isArray(squad.players)) return null;
  const reqs = (Array.isArray(r.playerRequirements) ? r.playerRequirements : []) as Obj[];
  const typeAt = new Map<number, { type: string; elg: Obj[] }>();
  for (const q of reqs)
    typeAt.set(num(q.index), { type: String(q.playerType ?? '').toUpperCase(), elg: (Array.isArray(q.elgReq) ? q.elgReq : []) as Obj[] });

  const bricks: BrickSlot[] = [];
  const placed: ChallengeLayout['placed'] = [];
  for (const p of squad.players as Obj[]) {
    const index = num(p.index);
    if (index >= 11) continue; // only the 11 field slots matter in an SBC
    const item = (p.itemData ?? {}) as Obj;
    const req = typeAt.get(index);
    if (req?.type === 'BRICK' || req?.type === 'CUSTOM_BRICK') {
      const custom = req.type === 'CUSTOM_BRICK';
      // the brick item carries its club/league/nation; its requirement repeats them as eligibility keys
      const fromReq = (key: number) => num(req.elg.find((e) => num(e.eligibilityKey) === key)?.eligibilityValue);
      bricks.push({
        index,
        custom,
        nation: num(item.nationId ?? item.nation) || fromReq(Key.NATION_ID),
        league: num(item.leagueId) || fromReq(Key.LEAGUE_ID),
        club: num(item.teamId ?? item.teamid) || fromReq(Key.CLUB_ID),
        rareflag: num(item.rareflag),
        positions: Array.isArray(item.possiblePositions) ? (item.possiblePositions as string[]) : null,
      });
      continue;
    }
    const id = num(item.id);
    if (id > 0 && !item.dream && !item.concept) placed.push({ index, itemId: id });
  }
  return { bricks: bricks.sort((a, b) => a.index - b.index), placed, capturedAt };
}

/** Latest layout the web app loaded for this challenge (null if never opened there). */
export async function challengeLayout(acc: Account, challengeId: number): Promise<ChallengeLayout | null> {
  const caps = (await readCache<Capture[]>(acc.key(`challengeSquads/${challengeId}`)))?.data ?? [];
  // newest first; a save (PUT) answers without the requirements, so the layout comes from a load
  let layout: ChallengeLayout | null = null;
  for (const c of caps) if (c.method !== 'PUT' && (layout = parseLayout(c.response, c.at))) break;
  if (!layout) return null;
  // ...but players saved after that load are the current ones: PUT body {players:[{index,itemData:{id,dream}}]}
  const save = caps.find((c) => c.method === 'PUT' && c.path.endsWith('/squad') && c.at > layout!.capturedAt);
  const saved = (save?.request as { players?: { index?: number; itemData?: { id?: number; dream?: boolean } }[] } | null)?.players;
  if (Array.isArray(saved)) {
    const locked = new Set(layout.bricks.map((b) => b.index));
    layout.placed = saved
      .filter((p) => num(p.index) < 11 && !locked.has(num(p.index)) && num(p.itemData?.id) > 0 && !p.itemData?.dream)
      .map((p) => ({ index: num(p.index), itemId: num(p.itemData!.id) }));
  }
  return layout;
}

export { isBrickChallenge } from './bricks.js';
