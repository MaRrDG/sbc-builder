// Keeps a local copy of each account's club + SBC data. EA is only hit once a day after the
// 20:01 drop (automatic) or when the user presses Sync (manual).
import type { ClubItem, Challenge, SbcSet, ChemProfilesResponse } from './ea.js';
import { SessionError } from './ea.js';
import { readCache, writeCache, type Cached } from './store.js';
import { loadMeta, invalidateMeta } from './meta.js';
import { listAccounts, type Account } from './accounts.js';
import { enqueue, hasPending, jobStatus, webAppOpen } from './jobs.js';
import { softly } from './db/index.js';
import { saveChallenges, saveSets } from './db/sbcs.js';

export interface SetsData {
  categories: { categoryId: number; name: string; sets: SbcSet[] }[];
}

export interface SyncStatus {
  ea: Awaited<ReturnType<Account['meter']['summary']>>;
  clubSyncs: { used: number; limit: number }; // today, manual + scheduled
  running: string | null;
  error: string | null;
  clubAt: number | null;
  sbcAt: number | null;
  sbcNextAt: number | null; // earliest a visit refreshes the SBC list again (null: legacy account)
  editedAt: number | null; // last local edit (e.g. an SBC submitted in the web app)
  unassigned: number; // players from opened packs not sent to the club yet
}

const running = new Map<number, string>();
/** An admin asked for a sync while the account was offline: run it on its next web app visit. */
const forced = new Map<number, { club: boolean; sbc: boolean }>();
const errors = new Map<number, string | null>();
const edited = new Map<number, number>();

export function markEdited(acc: Account) {
  edited.set(acc.id, Date.now());
}

export async function getStatus(acc: Account): Promise<SyncStatus> {
  const jobs = acc.clientMode ? jobStatus(acc) : null;
  return {
    ea: await acc.meter.summary(),
    clubSyncs: { used: await clubSyncsToday(acc), limit: CLUB_SYNCS_PER_DAY },
    running: jobs ? jobs.running : running.get(acc.id) ?? null,
    error: jobs ? jobs.error : errors.get(acc.id) ?? null,
    editedAt: edited.get(acc.id) ?? null,
    unassigned: (await readCache<unknown[]>(acc.key('unassigned')))?.data.length ?? 0,
    clubAt: (await readCache(acc.key('club')))?.fetchedAt ?? null,
    sbcAt: (await readCache(acc.key('sets')))?.fetchedAt ?? null,
    sbcNextAt: acc.clientMode ? await sbcNextAt(acc) : null,
  };
}

function utasOf(acc: Account) {
  if (!acc.utas) throw new SessionError('No EA session for this account. Open the FC web app with the extension.', 401, 'noSession');
  return acc.utas;
}

async function run<T>(acc: Account, label: string, fn: () => Promise<T>): Promise<T> {
  const busy = running.get(acc.id);
  if (busy) throw new SessionError(`Sync already running (${busy})`, 409, 'syncRunning');
  running.set(acc.id, label);
  errors.set(acc.id, null);
  try {
    return await fn();
  } catch (e) {
    errors.set(acc.id, (e as Error).message);
    throw e;
  } finally {
    running.delete(acc.id);
  }
}

// Club syncs (button or schedule) are capped per account per day. The SBC list is never
// synced on demand: only by the schedule, after the daily drop.
export const CLUB_SYNCS_PER_DAY = Number(process.env.CLUB_SYNCS_PER_DAY ?? 3);
const TZ_DAY = () => new Intl.DateTimeFormat('en-CA', { timeZone: DROP_TZ }).format(new Date());

async function clubSyncsToday(acc: Account): Promise<number> {
  const c = await readCache<{ day: string; club: number }>(acc.key('sync-count'));
  return c?.data.day === TZ_DAY() ? c.data.club : 0;
}

async function countClubSync(acc: Account) {
  await writeCache(acc.key('sync-count'), { day: TZ_DAY(), club: (await clubSyncsToday(acc)) + 1 });
}

/**
 * Manual (club only) or scheduled sync. Client-mode accounts only queue a job for their web app
 * tab (the data arrives through the extension); legacy accounts still fetch from the server.
 */
export async function requestSync(acc: Account, what: 'club' | 'sbc' | 'all', scheduled = false) {
  if (!scheduled && what !== 'club')
    throw new SessionError('The SBC list refreshes on its own after the daily drop (20:01).', 403, 'sbcScheduleOnly');
  const club = what === 'club' || what === 'all';
  const sbc = what === 'sbc' || what === 'all';
  if (club && (await clubSyncsToday(acc)) >= CLUB_SYNCS_PER_DAY) {
    if (!scheduled)
      throw new SessionError(
        `Club already synced ${CLUB_SYNCS_PER_DAY} times today. Opening your club in the web app still updates it for free.`,
        429,
        'clubLimit',
        { limit: CLUB_SYNCS_PER_DAY },
      );
    if (!sbc) return;
  }
  const doClub = club && (await clubSyncsToday(acc)) < CLUB_SYNCS_PER_DAY;
  if (acc.clientMode) {
    if (!webAppOpen(acc)) throw new SessionError('Open the FC27 web app in this browser to sync. FC Solver asks EA only from there.', 409, 'webAppClosed');
    await acc.meter.check(); // over today's budget or paused: refuse before the tab starts
    if (doClub && !hasPending(acc, 'club')) {
      await enqueue(acc, 'club');
      await countClubSync(acc);
    }
    if (sbc) await enqueue(acc, 'sbc');
    return;
  }
  if (doClub) {
    await countClubSync(acc);
    await syncClub(acc);
  }
  if (sbc) await syncSbcs(acc);
}

export function syncClub(acc: Account): Promise<Cached<ClubItem[]>> {
  return run(acc, 'club', async () => {
    const utas = utasOf(acc);
    const items = await utas.clubPlayers();
    // anything the fresh club already contains is no longer waiting in Unassigned
    const pending = await readCache<ClubItem[]>(acc.key('unassigned'));
    if (pending) {
      const inClub = new Set(items.map((i) => i.id));
      await writeCache(acc.key('unassigned'), pending.data.filter((p) => !inClub.has(p.id)));
    }
    const squad = await utas.activeSquad().catch(() => null);
    if (squad) await writeCache(acc.key('squad'), squad);
    const prof = await utas.chemistryProfiles().catch(() => null);
    if (prof) {
      await writeCache<ChemProfilesResponse>(acc.key('chemProfiles'), prof);
      invalidateMeta(acc.key('chemProfiles'));
    }
    return writeCache(acc.key('club'), items);
  });
}

/** Refresh the SBC list; only re-fetch challenges for sets that are new or changed. */
export function syncSbcs(acc: Account): Promise<Cached<SetsData>> {
  return run(acc, 'sbc', async () => {
    const utas = utasOf(acc);
    const prev = await readCache<SetsData>(acc.key('sets'));
    const next = await utas.sets();
    const prevSets = new Map(prev?.data.categories.flatMap((c) => c.sets).map((s) => [s.setId, s]) ?? []);
    for (const set of next.categories.flatMap((c) => c.sets)) {
      const old = prevSets.get(set.setId);
      const changed =
        !old ||
        old.challengesCompletedCount !== set.challengesCompletedCount ||
        old.timesCompleted !== set.timesCompleted ||
        old.timesCompletedInInterval !== set.timesCompletedInInterval ||
        old.challengesCount !== set.challengesCount;
      const cached = await readCache(acc.key(`challenges/${set.setId}`));
      if (cached && !changed) continue;
      // finished one-off sets are only loaded if the user opens them
      if (!cached && set.challengesCompletedCount >= set.challengesCount && !set.repeatable) continue;
      const ch = await utas.challenges(set.setId);
      await writeCache(acc.key(`challenges/${set.setId}`), ch.challenges);
      await softly('save challenges', () => saveChallenges(set.setId, ch.challenges));
    }
    await softly('save sets', () => saveSets(next.categories.flatMap((c) => c.sets)));
    return writeCache(acc.key('sets'), next);
  });
}

/**
 * Challenges of a set, from cache only. Opening an SBC or solving never reaches EA; the cache is
 * filled by syncs and by the extension when the user opens the set in the web app.
 * `refresh` is an explicit user request and the only way this asks EA.
 */
export async function getChallenges(acc: Account, setId: number, refresh = false): Promise<Cached<Challenge[]> | null> {
  const key = acc.key(`challenges/${setId}`);
  const cached = await readCache<Challenge[]>(key);
  if (!refresh || !acc.utas) return cached;
  const ch = await acc.utas.challenges(setId);
  await softly('save challenges', () => saveChallenges(setId, ch.challenges));
  return writeCache(key, ch.challenges);
}

/** Start (unix s) of the current refresh window of a REFRESH set; windows tick from its release. */
function refreshWindowStart(set: SbcSet, now: number): number {
  const interval = set.repeatRefreshInterval ?? 86400;
  const anchor = set.releaseTime ?? 0;
  return anchor + Math.floor((now - anchor) / interval) * interval;
}

/**
 * The user submitted an SBC in the web app (reported by the extension): drop the used
 * items from the cached club/squad and mark the challenge done, without asking EA.
 * Cache timestamps are kept so the regular sync schedule is unchanged.
 */
export async function applySubmittedSbc(acc: Account, challengeId: number, itemIds: number[]) {
  const used = new Set(itemIds);
  const club = await readCache<ClubItem[]>(acc.key('club'));
  let removed = 0;
  if (club) {
    const left = club.data.filter((i) => !used.has(i.id));
    removed = club.data.length - left.length;
    await writeCache(acc.key('club'), left, club.fetchedAt);
  }
  // players from SBC storage go too
  const storage = await readCache<ClubItem[]>(acc.key('storage'));
  if (storage) {
    const left = storage.data.filter((i) => !used.has(i.id));
    removed += storage.data.length - left.length;
    if (left.length !== storage.data.length) await writeCache(acc.key('storage'), left, storage.fetchedAt);
  }
  const squad = await readCache<{ starters: number[]; bench: number[] }>(acc.key('squad'));
  if (squad) {
    const keep = (ids: number[]) => ids.filter((id) => !used.has(id));
    await writeCache(acc.key('squad'), { starters: keep(squad.data.starters), bench: keep(squad.data.bench) }, squad.fetchedAt);
  }

  // Find the set that owns the challenge and bump its progress.
  const sets = await readCache<SetsData>(acc.key('sets'));
  for (const set of sets?.data.categories.flatMap((c) => c.sets) ?? []) {
    const chKey = acc.key(`challenges/${set.setId}`);
    const chs = await readCache<Challenge[]>(chKey);
    const ch = chs?.data.find((c) => c.challengeId === challengeId);
    if (!chs || !ch) continue;
    const firstTime = ch.status !== 'COMPLETED';
    ch.status = 'COMPLETED';
    ch.timesCompleted = (ch.timesCompleted ?? 0) + 1;
    await writeCache(chKey, chs.data, chs.fetchedAt);
    if (firstTime) set.challengesCompletedCount = Math.min(set.challengesCount, set.challengesCompletedCount + 1);
    // the set counts as done once more when every challenge has been done that many times
    const rounds = Math.min(...chs.data.map((c) => c.timesCompleted ?? 0));
    if (rounds > set.timesCompleted) {
      const now = Math.floor(Date.now() / 1000);
      if (set.repeatabilityMode === 'REFRESH') {
        const sameWindow = set.lastCompletedTime !== undefined && set.lastCompletedTime >= refreshWindowStart(set, now);
        set.timesCompletedInInterval = sameWindow ? (set.timesCompletedInInterval ?? 0) + 1 : 1;
      }
      set.timesCompleted = rounds;
      set.lastCompletedTime = now;
    }
    await writeCache(acc.key('sets'), sets!.data, sets!.fetchedAt);
    break;
  }
  markEdited(acc);
  return { removed };
}

// New SBCs drop (and daily ones reset) at 18:00 UK = 20:00 Romania. We refresh a minute later.
const DROP_TZ = process.env.SBC_DROP_TZ ?? 'Europe/Bucharest';
const [DROP_H, DROP_M] = (process.env.SBC_DROP_TIME ?? '20:01').split(':').map(Number);

/** Wall-clock parts of `date` in `tz`, read back as if they were UTC (gives the tz offset). */
function wallAsUtc(date: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
}

/** Most recent SBC drop moment (epoch ms). */
export function lastSbcDrop(now = new Date()): number {
  const offset = wallAsUtc(now, DROP_TZ) - now.getTime();
  const wall = new Date(now.getTime() + offset);
  let drop = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), DROP_H, DROP_M);
  if (drop > wall.getTime()) drop -= 24 * 60 * 60 * 1000;
  return drop - offset;
}

// Besides the daily drop, the SBC list refreshes when the user shows up (opens the SBC page on
// the site, or comes back to the web app), at most once per cooldown: SBCs done on a console or
// in the companion app show up without waiting for 20:01.
export const SBC_VISIT_COOLDOWN_MS = Number(process.env.SBC_VISIT_COOLDOWN_MIN ?? 30) * 60 * 1000;

async function sbcNextAt(acc: Account): Promise<number> {
  return ((await readCache(acc.key('sets')))?.fetchedAt ?? 0) + SBC_VISIT_COOLDOWN_MS;
}

/**
 * A visit asks for fresh SBCs: queue a list refresh when the cooldown is over. Client-mode only,
 * and only with the web app open (nothing else may call EA). Never throws: a visit is not a click.
 */
export async function refreshSbcsOnVisit(acc: Account): Promise<boolean> {
  try {
    if (!acc.clientMode || !webAppOpen(acc) || hasPending(acc, 'sbc')) return false;
    if (Date.now() < (await sbcNextAt(acc))) return false;
    await acc.meter.check();
    await enqueue(acc, 'sbc');
    return true;
  } catch {
    return false; // over today's EA budget or paused
  }
}

/**
 * Club and SBCs: refreshed once a day, when last fetched before the latest daily drop. Nobody
 * online at 20:01: it runs as soon as the web app opens. Runs on startup and every minute
 * (cheap: it only reads cache timestamps unless something is actually due).
 */
// A fresh session means the web app just opened: let its own start-up burst finish first
// (the extension queue also waits for the web app to go quiet before each request).
const SESSION_GRACE_MS = 20 * 1000;

export async function autoSync(acc: Account): Promise<void> {
  if (!acc.hasSession || running.has(acc.id)) return;
  if (Date.now() - acc.info.sidUpdatedAt < SESSION_GRACE_MS) return;
  const f = forced.get(acc.id);
  forced.delete(acc.id);
  try {
    await loadMeta(acc.key('chemProfiles'));
    const drop = lastSbcDrop();
    const club = await readCache(acc.key('club'));
    let clubDue = !club || club.fetchedAt < drop;
    const sets = await readCache(acc.key('sets'));
    let sbcDue = !sets || sets.fetchedAt < drop;
    if (f) {
      clubDue ||= f.club;
      sbcDue ||= f.sbc;
    }
    if (acc.clientMode) {
      if (jobStatus(acc).running) {
        if (f) forced.set(acc.id, f); // try again on the next tick
        return;
      }
      if (clubDue || sbcDue) await requestSync(acc, clubDue && sbcDue ? 'all' : clubDue ? 'club' : 'sbc', true);
      return;
    }
    if (clubDue || sbcDue) await requestSync(acc, clubDue && sbcDue ? 'all' : clubDue ? 'club' : 'sbc', true);
  } catch (e) {
    if (f) forced.set(acc.id, f); // e.g. over today's EA budget: keep it for later
    console.warn(`auto sync failed for ${acc.info.personaName}:`, (e as Error).message);
  }
}

/** The web app just said hello: check right after the grace period instead of on the next tick. */
export function autoSyncSoon(acc: Account) {
  setTimeout(() => void autoSync(acc), SESSION_GRACE_MS + 1000);
}

export type AdminSyncOutcome =
  | { personaId: number; outcome: 'queued'; clubSkipped: boolean }
  | { personaId: number; outcome: 'deferred' }
  | { personaId: number; outcome: 'skipped'; code: string; params?: Record<string, string | number> };

/**
 * Admin sync for one account, with the same limits as everyone else (EA budget, throttle pause,
 * club syncs per day). Offline accounts are remembered and sync on their next web app visit.
 */
export async function adminSync(acc: Account, what: 'club' | 'sbc' | 'all'): Promise<AdminSyncOutcome> {
  const personaId = acc.id;
  const wantClub = what !== 'sbc';
  const wantSbc = what !== 'club';
  const club = wantClub && (await clubSyncsToday(acc)) < CLUB_SYNCS_PER_DAY;
  if (!club && !wantSbc) return { personaId, outcome: 'skipped', code: 'clubLimit', params: { limit: CLUB_SYNCS_PER_DAY } };
  if (!acc.hasSession) {
    const prev = forced.get(acc.id);
    forced.set(acc.id, { club: club || !!prev?.club, sbc: wantSbc || !!prev?.sbc });
    return { personaId, outcome: 'deferred' };
  }
  if (running.has(acc.id)) return { personaId, outcome: 'skipped', code: 'syncRunning' };
  try {
    await acc.meter.check();
  } catch (e) {
    const err = e as SessionError;
    return { personaId, outcome: 'skipped', code: err.msgCode ?? 'budget', params: err.params };
  }
  const kind = club && wantSbc ? 'all' : club ? 'club' : 'sbc';
  if (acc.clientMode) await requestSync(acc, kind, true);
  // legacy accounts fetch from the server right here, which takes a while: don't hold the request
  else void requestSync(acc, kind, true).catch((e) => console.warn(`admin sync failed for ${acc.info.personaName}:`, (e as Error).message));
  return { personaId, outcome: 'queued', clubSkipped: wantClub && !club };
}

/** Accounts with an admin sync waiting for their next visit. */
export const forcedSync = (acc: Account) => forced.get(acc.id) ?? null;

export async function autoSyncAll() {
  for (const acc of listAccounts()) await autoSync(acc);
}
