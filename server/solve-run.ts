// The /api/solve body, shared by the site and the Discord bot (/api/bot/solve): same pool, solver, squad.ts
// re-check, quota and event log. Reads the cache only, never EA.
import { SessionError, type ClubItem } from './ea.js';
import { loadMeta } from './meta.js';
import { parseRequirements } from './sbc.js';
import { evaluate, toPlayer } from './squad.js';
import { NO_FILTERS, diagnose, pointsPool, pointsProblem, solve, solvePoints, type ActiveSquad, type SolveOptions } from './solver.js';
import { challengeLayout, isBrickChallenge } from './layout.js';
import { readCache } from './store.js';
import { getChallenges } from './sync.js';
import type { Account } from './accounts.js';
import { planFor, planInfo } from './plans.js';
import { countSolve } from './db/users.js';
import { logEvent } from './db/events.js';
import { isPointsChallenge, pointsTarget, usablePoints } from './points.js';

export const metaFor = (acc: Account) => loadMeta(acc.key('chemProfiles'));

export interface SolveBody { setId: number; challengeId: number; options?: Partial<SolveOptions>; deep?: boolean; useStorage?: boolean }

export async function clubPlayers(acc: Account) {
  const meta = await metaFor(acc);
  const club = await readCache<ClubItem[]>(acc.key('club'));
  const storage = await readCache<ClubItem[]>(acc.key('storage'));
  const squad = (await readCache<ActiveSquad>(acc.key('squad')))?.data ?? null;
  return {
    fetchedAt: club?.fetchedAt ?? null,
    players: (club?.data ?? []).map((i) => toPlayer(i, meta)),
    storage: (storage?.data ?? []).map((i) => ({ ...toPlayer(i, meta), inStorage: true })),
    storageAt: storage?.fetchedAt ?? null,
    squad,
  };
}

export const DEFAULT_OPTIONS: SolveOptions = {
  excludeIds: [],
  excludeActiveSquad: true,
  excludeSquadReserves: false,
  excludeNations: [],
  excludeLeagues: [],
  excludeClubs: [],
  onlyUntradeable: false,
  maxRating: 99,
  excludeSpecial: true,
  keepPlaced: false,
};

export async function runSolve(userId: string, acc: Account, body: SolveBody, via: 'site' | 'discord' = 'site') {
  const plan = await planFor(userId);
  // Free: 20 found squads per 7-day window (server/plan.ts); checked before the solver runs
  if (plan.quota && plan.quota.used >= plan.quota.limit)
    throw new SessionError('Weekly solve limit reached.', 403, 'quotaExhausted', { limit: plan.quota.limit, resetsAt: plan.quota.resetsAt ?? 0 });
  const meta = await metaFor(acc);
  const { setId, challengeId } = body;
  const ch = (await getChallenges(acc, setId))?.data.find((c) => c.challengeId === challengeId);
  if (!ch) throw new SessionError('challenge not found (open it in the web app first)', 404, 'challengeNotFound');
  const { players: inClub, storage } = await clubPlayers(acc);
  if (inClub.length === 0) throw new SessionError('club is empty (sync your club first)', 409, 'clubEmpty');
  // SBC storage is in by default (its duplicates are cheaper, so the solver takes them first); `useStorage: false` = club only
  const clubOnly = body.useStorage === false;
  const players = clubOnly ? inClub : [...inClub, ...storage];
  const reqs = parseRequirements(ch.elgReq, meta);
  const options = { ...DEFAULT_OPTIONS, ...body.options };
  const t0 = Date.now();
  const squad = (await readCache<ActiveSquad>(acc.key('squad')))?.data ?? null;
  if (isPointsChallenge(ch)) {
    const target = pointsTarget(ch);
    if (target === 0) throw new SessionError('This challenge already has all its points.', 409, 'pointsDone');
    // same settings as squads: the filtered pool, plus with keepPlaced the cards already in the web app's Work Area
    const placed = options.keepPlaced ? ((await challengeLayout(acc, challengeId))?.placed ?? []) : [];
    const { pool, keep, placedCount, missingPlaced } = pointsProblem(players, reqs, options, squad, placed);
    // the solver takes one card per assetId, so duplicates must not inflate what the club holds
    const have = usablePoints(pool);
    const sol = have >= target ? await solvePoints(pool, reqs, target, body.deep ? 30 : 10, keep) : null;
    const found = !!sol?.check.allMet;
    // only a found selection costs a token, like squads
    const quota = plan.quota && found ? planInfo(await countSolve(userId), false, Date.now()).quota : plan.quota;
    logEvent({ type: 'solve', userId, personaId: acc.id, data: { setId, challengeId, found, points: true, ...(via === 'discord' ? { via } : {}) } });
    // enough points but no answer (infeasible / unknown / timeout): the cards do not combine, so say that
    const reasons = found
      ? undefined
      : have < target
        ? [{ code: 'points' as const, have, need: target, hidden: Math.max(0, usablePoints(pointsPool(players, reqs, NO_FILTERS, null)) - have) }]
        : [{ code: 'combo' as const }];
    return {
      found,
      status: sol?.status,
      ms: Date.now() - t0,
      cost: sol?.cost,
      eval: {
        rating: 0,
        chemistry: 0,
        results: sol?.check.results ?? [], // no selection: requirement rows stay neutral
        allMet: found,
      },
      slots: [],
      points: {
        target,
        required: ch.scoreRequirement ?? 0,
        submitted: ch.submittedScore ?? 0,
        total: sol?.check.total ?? 0,
        overshoot: sol?.check.overshoot ?? 0,
        cards: sol?.cards ?? [],
      },
      reasons,
      missingPlaced,
      placed: { kept: sol?.fixedIds.length ?? 0, total: placedCount },
      usedStorage: !!sol?.cards.some((p) => p.inStorage),
      clubOnly,
      quota,
    };
  }
  const layout = await challengeLayout(acc, challengeId);
  if (isBrickChallenge(ch.type) && !layout)
    throw new SessionError(
      'This SBC has locked slots. Open it once in the FC27 web app so FC Solver sees which, then solve again.',
      409,
      'needsLayout',
    );
  const bricks = layout?.bricks ?? [];
  const brickAt = new Map(bricks.map((b) => [b.index, b]));
  const sol = await solve(players, ch.formation, reqs, ch.elgOperation, meta, options, squad, body.deep ? 30 : 10, layout);
  const slotsMeta = meta.formations[ch.formation];
  const brickOf = (i: number) => {
    const b = brickAt.get(i);
    return b ? { custom: b.custom, nation: b.nation, league: b.league, club: b.club } : null;
  };
  if (!sol) {
    const empty = evaluate(slotsMeta.map(() => null), slotsMeta.map((s) => s.typeId), reqs, ch.elgOperation, meta, bricks);
    logEvent({ type: 'solve', userId, personaId: acc.id, data: { setId, challengeId, found: false, ...(via === 'discord' ? { via } : {}) } });
    return {
      found: false,
      ms: Date.now() - t0,
      reasons: diagnose(players, reqs, meta, options, squad, bricks),
      slots: slotsMeta.map((s, i) => ({ position: s, player: null, chem: 0, brick: brickOf(i), fixed: false })),
      eval: empty,
      clubOnly,
      quota: plan.quota,
    };
  }
  // only a found squad costs a token; Premium is not counted
  const quota =
    plan.quota && sol.eval.allMet ? planInfo(await countSolve(userId), false, Date.now()).quota : plan.quota;
  logEvent({ type: 'solve', userId, personaId: acc.id, data: { setId, challengeId, found: sol.eval.allMet, ...(via === 'discord' ? { via } : {}) } });
  return {
    found: sol.eval.allMet,
    status: sol.status,
    ms: Date.now() - t0,
    cost: sol.cost,
    eval: sol.eval,
    slots: slotsMeta.map((s, i) => ({
      position: s,
      player: sol.slots[i],
      chem: sol.eval.perSlotChem[i],
      brick: brickOf(i),
      fixed: !!sol.slots[i] && sol.fixedIds.includes(sol.slots[i]!.id),
    })),
    missingPlaced: sol.missingPlaced,
    placed: { kept: sol.fixedIds.length, total: sol.placedCount },
    usedStorage: sol.slots.some((p) => p?.inStorage),
    clubOnly,
    quota,
  };
}

export type SolveAnswer = Awaited<ReturnType<typeof runSolve>>;
