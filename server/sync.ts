// Keeps a local copy of each account's club + SBC data. EA is only hit once a day after the
// 20:01 drop (automatic) or when the user presses Sync (manual).
import type { ClubItem, Challenge, SbcSet } from './ea.js';
import { SessionError } from './ea.js';
import { readCache, readShared, writeCache, type Cached } from './store.js';
import type { ActiveSquad } from './solver.js';
import { loadMeta } from './meta.js';
import { listAccounts, type Account } from './accounts.js';
import { notify } from './live.js';
import { versionLess } from './admin/query.js';
import { planFor } from './plans.js';
import { personaRow } from './db/users.js';
import { clubCalledAt, enqueue, hasPending, jobList, jobStatus, tabReady, webAppOpen } from './jobs.js';
import { jobViews, type JobView } from './job-view.js';
import { clubDueOnVisit, clubManualAt } from './visit-rules.js';

export interface SetsData {
  categories: { categoryId: number; name: string; sets: SbcSet[] }[];
}

export interface SyncStatus {
  ea: Awaited<ReturnType<Account['meter']['summary']>>;
  clubNextAt: number | null; // when the Club button works again (null: now)
  running: string | null;
  error: string | null;
  errorCode: 'notStarted' | null; // the last sync failed before the web app tab asked EA anything
  clubAt: number | null;
  sbcAt: number | null;
  sbcNextAt: number | null; // earliest a visit refreshes the SBC list again (null: no extension in client mode, so no sync)
  editedAt: number | null; // last local edit (e.g. an SBC submitted in the web app)
  unassigned: number; // players from opened packs not sent to the club yet
  /** a club sync waiting for / running in the web app tab: players loaded so far, and the cached club size as a rough total */
  club: { state: 'queued' | 'running'; loaded: number; expected: number | null } | null;
  jobs: JobView[];
  graceUntil: number | null; // a fresh web app session: the first syncs wait for it to finish loading
}

const SESSION_GRACE_MS = 20 * 1000;

/** An admin asked for a sync while the account was offline: run it on its next web app visit. */
const forced = new Map<number, { club: boolean; sbc: boolean }>();
const edited = new Map<number, number>();

export function markEdited(acc: Account) {
  edited.set(acc.id, Date.now());
  notify(acc.id, ['edited']);
}

export async function getStatus(acc: Account): Promise<SyncStatus> {
  const jobs = acc.clientMode ? jobStatus(acc) : null;
  const clubJob = jobs ? jobs.club : null;
  const [club, unassigned, sets] = await Promise.all([
    readShared<unknown[]>(acc.key('club')),
    readShared<unknown[]>(acc.key('unassigned')),
    readShared(acc.key('sets')),
  ]);
  const ea = await acc.meter.summary();
  const graceEnd = acc.info.sidUpdatedAt + SESSION_GRACE_MS;
  const jobViewsNow = acc.clientMode
    ? jobViews(jobList(acc), { tabOpen: webAppOpen(acc), tabReady: tabReady(acc), pausedUntil: ea.pausedUntil, clubExpected: club?.data.length || null })
    : [];
  return {
    club: clubJob && { ...clubJob, expected: club?.data.length || null },
    ea,
    jobs: jobViewsNow,
    graceUntil: acc.clientMode && graceEnd > Date.now() ? graceEnd : null,
    clubNextAt: await clubButtonAt(acc),
    running: jobs?.running ?? null,
    error: jobs?.error ?? null,
    errorCode: jobs?.errorCode ?? null,
    editedAt: edited.get(acc.id) ?? null,
    unassigned: unassigned?.data.length ?? 0,
    clubAt: club?.fetchedAt ?? null,
    sbcAt: sets?.fetchedAt ?? null,
    sbcNextAt: acc.clientMode ? await sbcNextAt(acc) : null,
  };
}

// Club syncs have no daily cap: the schedule runs once after the drop, visits only when the club is
// older than CLUB_VISIT_STALE_H, and the Club button waits CLUB_MANUAL_COOLDOWN_MIN after the last
// club load or the last club sync that actually called EA (a sync that never reached EA, e.g. the
// web app was not logged in, blocks nothing). EA's daily request budget still caps everything. The SBC list is never synced
// on demand: only by the schedule, after the daily drop, and on visits.
export const CLUB_MANUAL_COOLDOWN_MS = Number(process.env.CLUB_MANUAL_COOLDOWN_MIN ?? 15) * 60 * 1000;
async function clubButtonAt(acc: Account): Promise<number | null> {
  const loaded = (await readShared(acc.key('club')))?.fetchedAt ?? null;
  const called = clubCalledAt(acc);
  const last = loaded === null ? called : called === null ? loaded : Math.max(loaded, called);
  return clubManualAt(last, Date.now(), CLUB_MANUAL_COOLDOWN_MS);
}

/**
 * Manual (club only) or scheduled sync: queues a job for the account's web app tab (the data
 * arrives through the extension). The server never calls EA itself.
 */
export async function requestSync(acc: Account, what: 'club' | 'sbc' | 'all', scheduled = false) {
  if (!scheduled && what !== 'club')
    throw new SessionError('The SBC list refreshes on its own after the daily drop (20:01).', 403, 'sbcScheduleOnly');
  const club = what === 'club' || what === 'all';
  const sbc = what === 'sbc' || what === 'all';
  // the cooldown also keeps a failing scheduled / visit sync from being retried every minute
  const clubAt = club ? await clubButtonAt(acc) : null;
  if (club && !scheduled && clubAt !== null) {
    const minutes = Math.ceil((clubAt - Date.now()) / 60000);
    throw new SessionError(`Club synced moments ago. Try again in ${minutes} min.`, 429, 'clubCooldown', { minutes });
  }
  const doClub = club && clubAt === null;
  if (!acc.clientMode || !webAppOpen(acc)) throw new SessionError('Open the FC27 web app in this browser to sync. FC Solver asks EA only from there.', 409, 'webAppClosed');
  await acc.meter.check(); // over today's budget or paused: refuse before the tab starts
  if (doClub && !hasPending(acc, 'club')) {
    await enqueue(acc, 'club');
  }
  if (sbc) await enqueue(acc, 'sbc');
}

/** Challenges of a set, from cache only: filled by syncs and by the extension when the set is opened in the web app. */
export async function getChallenges(acc: Account, setId: number): Promise<Cached<Challenge[]> | null> {
  return readCache<Challenge[]>(acc.key(`challenges/${setId}`));
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
  const squad = await readCache<ActiveSquad>(acc.key('squad'));
  if (squad) {
    const keep = (ids: number[]) => ids.filter((id) => !used.has(id));
    // only the used players go: formation (and any other field the relay stored) stays
    await writeCache(acc.key('squad'), { ...squad.data, starters: keep(squad.data.starters), bench: keep(squad.data.bench) }, squad.fetchedAt);
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

// A visit also refreshes a club older than this (within the daily club cap), so the club the
// solver uses is almost always current.
export const CLUB_VISIT_STALE_MS = Number(process.env.CLUB_VISIT_STALE_H ?? 2) * 60 * 60 * 1000;

/**
 * A visit (site opened, web app back in front): queue a club sync when the club is stale and a
 * list refresh when the SBC cooldown is over. Client-mode only, and only with the web app open
 * (nothing else may call EA). Never throws: a visit is not a click.
 */
export async function refreshOnVisit(acc: Account, { sbcs = true }: { sbcs?: boolean } = {}): Promise<{ club: boolean; sbc: boolean }> {
  const out = { club: false, sbc: false };
  try {
    if (!acc.clientMode || !webAppOpen(acc)) return out;
    await acc.meter.check();
    const club = await readCache(acc.key('club'));
    if (!hasPending(acc, 'club') && clubDueOnVisit(club?.fetchedAt ?? null, Date.now(), CLUB_VISIT_STALE_MS)) {
      await requestSync(acc, 'club', true);
      out.club = true;
    }
    if (sbcs && !hasPending(acc, 'sbc') && Date.now() >= (await sbcNextAt(acc))) {
      await enqueue(acc, 'sbc');
      out.sbc = true;
    }
  } catch {
    // over today's EA budget or paused
  }
  return out;
}

/**
 * Club and SBCs: refreshed once a day, when last fetched before the latest daily drop. Nobody
 * online at 20:01: it runs as soon as the web app opens. Runs on startup and every minute
 * (cheap: it only reads cache timestamps unless something is actually due).
 */
// A fresh session means the web app just opened: let its own start-up burst finish first
// (the extension queue also waits for the web app to go quiet before each request).

async function academyDue(acc: Account): Promise<boolean> {
  // one read per daily drop, whatever the outcome: either a full list came back ('academy') or we asked ('academyAsked')
  const drop = lastSbcDrop();
  const [last, asked] = await Promise.all([readCache(acc.key('academy')), readCache(acc.key('academyAsked'))]);
  if ((last && last.fetchedAt >= drop) || (asked && asked.fetchedAt >= drop)) return false;
  // extensions before 0.8.9 don't know the 'academy' job: it would hang until the start timeout
  if (!acc.info.extVersion || versionLess(acc.info.extVersion, '0.8.9')) return false;
  try {
    const owner = await personaRow(acc.id);
    return !!owner && (await planFor(owner.userId)).tier === 'premium';
  } catch (e) {
    console.error(`[db] academy owner failed: ${(e as Error).message}`); // not due; the next tick tries again
    return false;
  }
}

export async function autoSync(acc: Account): Promise<void> {
  if (!acc.clientMode || !acc.hasSession) return;
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
    if (jobStatus(acc).running) {
      if (f) forced.set(acc.id, f); // try again on the next tick
      return;
    }
    if (clubDue || sbcDue) await requestSync(acc, clubDue && sbcDue ? 'all' : clubDue ? 'club' : 'sbc', true);
    // timed evolutions: one read a day, only where someone gets the email (Premium)
    if (!jobStatus(acc).running && !hasPending(acc, 'academy') && (await academyDue(acc))) {
      await writeCache(acc.key('academyAsked'), { at: Date.now() });
      await enqueue(acc, 'academy');
    }
  } catch (e) {
    if (f) forced.set(acc.id, f); // e.g. over today's EA budget: keep it for later
    console.warn(`auto sync failed for ${acc.info.personaName}:`, (e as Error).message);
  }
}

/**
 * The extension just linked this account to a user: load the club right away, so the site shows
 * the user's players. The hello came from the web app tab itself, so the job runs there shortly.
 * Same limit as any sync (EA budget); quietly skipped when over it.
 */
export async function syncOnLink(acc: Account): Promise<boolean> {
  try {
    if (!acc.clientMode || hasPending(acc, 'club')) return false;
    await acc.meter.check();
    await enqueue(acc, 'club');
    return true;
  } catch {
    return false; // over today's EA budget or paused
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
 * club cooldown). Offline accounts are remembered and sync on their next web app visit.
 */
export async function adminSync(acc: Account, what: 'club' | 'sbc' | 'all'): Promise<AdminSyncOutcome> {
  const personaId = acc.id;
  const wantClub = what !== 'sbc';
  const wantSbc = what !== 'club';
  const clubAt = wantClub ? await clubButtonAt(acc) : null;
  const club = wantClub && clubAt === null;
  if (!club && !wantSbc)
    return { personaId, outcome: 'skipped', code: 'clubCooldown', params: { minutes: Math.ceil(((clubAt ?? Date.now()) - Date.now()) / 60000) } };
  if (!acc.hasSession) {
    const prev = forced.get(acc.id);
    forced.set(acc.id, { club: club || !!prev?.club, sbc: wantSbc || !!prev?.sbc });
    return { personaId, outcome: 'deferred' };
  }
  try {
    await acc.meter.check();
  } catch (e) {
    const err = e as SessionError;
    return { personaId, outcome: 'skipped', code: err.msgCode ?? 'budget', params: err.params };
  }
  const kind = club && wantSbc ? 'all' : club ? 'club' : 'sbc';
  await requestSync(acc, kind, true);
  return { personaId, outcome: 'queued', clubSkipped: wantClub && !club };
}

/** Accounts with an admin sync waiting for their next visit. */
export const forcedSync = (acc: Account) => forced.get(acc.id) ?? null;

export async function autoSyncAll() {
  for (const acc of listAccounts()) await autoSync(acc);
}
