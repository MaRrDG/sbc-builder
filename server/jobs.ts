// Sync jobs for accounts whose extension (0.7+) makes every EA request from the web app tab.
// The server never talks to EA for them: it queues a job, the extension picks it up while a
// web app tab is open, the page runs a fixed, read-only recipe for that job kind, and its
// responses come back through /api/webapp-event like any other web app load.
import { randomBytes } from 'node:crypto';
import type { Account } from './accounts.js';
import { readCache, writeCache } from './store.js';
import type { Challenge, SbcSet } from './ea.js';
import { sharedChallenges } from './db/sbcs.js';
import { seedChallenges } from './shared-sbc.js';
import { logEvent } from './db/events.js';
import { lastSbcDrop, type SetsData } from './sync.js';
import type { ClubPages } from './club-pages.js';

export type JobKind = 'club' | 'sbc' | 'challenges' | 'challengeSquad' | 'academy';

export interface Job {
  id: string;
  kind: JobKind;
  setIds?: number[]; // challenges only
  challengeId?: number; // challengeSquad only: GET /sbs/challenge/{id}/squad (never the POST that starts it)
  status: 'queued' | 'running' | 'done' | 'failed';
  createdAt: number;
  startedAt?: number;
  error?: string;
  /** sbc only: set progress when the job was queued, to see which sets changed afterwards */
  before?: Record<number, string>;
  /** club only: the pages this job loaded, and whether they added up to the whole club */
  clubPages?: ClubPages;
  clubReplaced?: boolean;
  /** club only: players loaded so far, for the progress bar */
  clubLoaded?: number;
  /** first request the page made to EA for this job (reported through /api/jobs/:id/call) */
  calledAt?: number;
  /** failed without ever calling EA (web app not logged in, tab closed): costs EA nothing */
  notStarted?: boolean;
}

const queues = new Map<number, Job[]>();
const lastPoll = new Map<number, number>();
const lastVisible = new Map<number, boolean>();
const lastFinished = new Map<number, number>();
const lastClubCall = new Map<number, number>();
const NOT_STARTED = 'The web app tab did not start the sync. Log in to EA in the web app and it runs again.';
const RUNNING_TIMEOUT = 3 * 60 * 1000; // a tab closed mid-job: give up and allow a new one
// handed to a tab that never called EA for it (web app not logged in, tab gone to the EA login):
// the first request goes out within ~20 s (quiet wait + gap), so give up well before RUNNING_TIMEOUT
const START_TIMEOUT = 60 * 1000;
const OPEN_WINDOW = 30 * 1000; // the extension polls every few seconds while a web app tab is open
const MAX_SETS_PER_JOB = 40;
const REST_BETWEEN_JOBS = 5 * 1000; // a breather for EA between one job and the next

const progress = (s: SetsData['categories'][number]['sets'][number]) =>
  [s.challengesCompletedCount, s.challengesCount, s.timesCompleted, s.timesCompletedInInterval ?? ''].join(':');

function queueOf(acc: Account) {
  let q = queues.get(acc.id);
  if (!q) queues.set(acc.id, (q = []));
  // forget finished jobs after a while, fail jobs a closed tab never finished
  const now = Date.now();
  for (const j of q) {
    if (j.status === 'running' && !j.calledAt && now - (j.startedAt ?? now) > START_TIMEOUT) {
      j.status = 'failed';
      j.error = NOT_STARTED;
      j.notStarted = true;
    } else if (j.status === 'running' && now - (j.startedAt ?? now) > RUNNING_TIMEOUT) {
      j.status = 'failed';
      j.error = 'The web app tab stopped before the sync finished.';
    } else if (j.status === 'queued' && now - j.createdAt > OPEN_WINDOW && !webAppOpen(acc)) {
      // the tab closed (or went to the EA login) before it took the job: nobody will run it
      j.status = 'failed';
      j.error = NOT_STARTED;
      j.notStarted = true;
    }
  }
  const keep = q.filter((j) => j.status === 'queued' || j.status === 'running' || now - j.createdAt < 10 * 60 * 1000);
  q.splice(0, q.length, ...keep);
  return q;
}

/** A job of this kind is already waiting or running. */
export const hasPending = (acc: Account, kind: JobKind) =>
  queueOf(acc).some((j) => j.kind === kind && (j.status === 'queued' || j.status === 'running'));

/** A web app tab with the extension asked for work in the last few seconds. */
export const webAppOpen = (acc: Account) => Date.now() - (lastPoll.get(acc.id) ?? 0) < OPEN_WINDOW;

export async function enqueue(acc: Account, kind: JobKind, setIds?: number[], challengeId?: number): Promise<Job | null> {
  const q = queueOf(acc);
  const pending = q.find(
    (j) => j.kind === kind && (j.status === 'queued' || j.status === 'running') && kind !== 'challenges' && j.challengeId === challengeId,
  );
  if (pending) return pending;
  const job: Job = { id: randomBytes(8).toString('hex'), kind, status: 'queued', createdAt: Date.now() };
  if (kind === 'challenges') {
    if (!setIds?.length) return null;
    job.setIds = setIds.slice(0, MAX_SETS_PER_JOB);
  }
  if (kind === 'challengeSquad') {
    if (!Number.isInteger(challengeId)) return null;
    job.challengeId = challengeId;
  }
  if (kind === 'club') job.clubPages = new Map();
  if (kind === 'sbc') {
    const sets = await readCache<SetsData>(acc.key('sets'));
    job.before = Object.fromEntries(sets?.data.categories.flatMap((c) => c.sets).map((s) => [s.setId, progress(s)]) ?? []);
  }
  q.push(job);
  return job;
}

/**
 * The user just came (back) to the web app: the tab was closed, or hidden and now in front again
 * (`visible` is sent by extension 0.8.4+). Call before nextJob, which records this poll.
 */
export function webAppReturned(acc: Account, visible: boolean | undefined): boolean {
  const wasOpen = webAppOpen(acc);
  const wasVisible = lastVisible.get(acc.id);
  if (visible !== undefined) lastVisible.set(acc.id, visible);
  return !wasOpen || (visible === true && wasVisible === false);
}

/** The extension asks for the next job; also marks the web app tab as open. `canRun` false: the tab is not logged in to EA yet. */
export function nextJob(acc: Account, canRun = true): Job | null {
  lastPoll.set(acc.id, Date.now());
  const q = queueOf(acc);
  if (!canRun) return null; // queued jobs wait for the login
  if (q.some((j) => j.status === 'running')) return null; // one at a time
  if (Date.now() - (lastFinished.get(acc.id) ?? 0) < REST_BETWEEN_JOBS) return null;
  const job = q.find((j) => j.status === 'queued') ?? null;
  if (job) {
    job.status = 'running';
    job.startedAt = Date.now();
  }
  return job;
}

/** The page made a request to EA for this job; a club sync's first one starts the Club button cooldown. */
export function markCall(acc: Account, job: Job) {
  if (job.calledAt) return;
  job.calledAt = Date.now();
  if (job.kind === 'club') lastClubCall.set(acc.id, job.calledAt);
}

/** When a club sync last actually asked EA for something (null: not since the server started). */
export const clubCalledAt = (acc: Account) => lastClubCall.get(acc.id) ?? null;

export function findJob(acc: Account, id: string) {
  return queueOf(acc).find((j) => j.id === id) ?? null;
}

const CLUB_PAGES_WAIT = 10 * 1000; // the last page is relayed separately and may land after "done"

/** A set new to this account and untouched: take its challenges from the shared copy, no EA call. */
async function seedFromShared(acc: Account, set: SbcSet): Promise<boolean> {
  try {
    const list = seedChallenges(set, await sharedChallenges(set.setId, new Date(lastSbcDrop())));
    if (!list) return false;
    await writeCache<Challenge[]>(acc.key(`challenges/${set.setId}`), list);
    return true;
  } catch (e) {
    console.error(`[db] shared challenges for set ${set.setId} failed: ${(e as Error).message}`);
    return false; // ask EA as before
  }
}

/**
 * The page finished a job. A club sync only counts once its pages replaced the whole club;
 * an SBC list refresh queues the challenges of sets that changed.
 */
export async function finishJob(acc: Account, job: Job, ok: boolean, error?: string, pagesTagged = false): Promise<{ playedElsewhere: boolean; changedSets: number }> {
  // extensions before 0.8.3 don't tag their pages with the job: the passive scan in events.ts covers them
  if (ok && job.kind === 'club' && pagesTagged) {
    for (const until = Date.now() + CLUB_PAGES_WAIT; !job.clubReplaced && Date.now() < until; )
      await new Promise((r) => setTimeout(r, 250));
    if (!job.clubReplaced) {
      ok = false;
      error = 'Some club pages did not reach FC Solver, so the club was not replaced. Sync again.';
    }
  }
  job.status = ok ? 'done' : 'failed';
  lastFinished.set(acc.id, Date.now());
  job.error = ok ? undefined : error ?? 'Sync failed in the web app tab.';
  // e.g. "The web app has not talked to EA yet.": the page never asked EA, so nothing was spent
  if (!ok && !job.calledAt) job.notStarted = true;
  // a tab that is not ready fails every scheduled retry at once: keep those out of the history
  if ((job.kind === 'club' || job.kind === 'sbc') && !job.notStarted)
    logEvent({ type: 'sync', personaId: acc.id, data: { what: job.kind, ok, mode: 'client', ...(ok ? {} : { error: job.error!.slice(0, 200) }) } });
  if (!ok || job.kind !== 'sbc') return { playedElsewhere: false, changedSets: 0 };
  const sets = await readCache<SetsData>(acc.key('sets'));
  const changed: number[] = [];
  let playedElsewhere = false;
  for (const set of sets?.data.categories.flatMap((c) => c.sets) ?? []) {
    // progress went up without us seeing the submit (console, companion app): the club lost players
    const was = job.before?.[set.setId]?.split(':').map(Number);
    if (was && (set.challengesCompletedCount > was[0] || set.timesCompleted > was[2])) playedElsewhere = true;
    const cached = await readCache(acc.key(`challenges/${set.setId}`));
    if (cached && job.before?.[set.setId] === progress(set)) continue;
    // finished one-off sets are only loaded when the user opens them in the web app
    if (!cached && set.challengesCompletedCount >= set.challengesCount && !set.repeatable) continue;
    if (!cached && (await seedFromShared(acc, set))) continue;
    changed.push(set.setId);
  }
  if (changed.length) await enqueue(acc, 'challenges', changed);
  return { playedElsewhere, changedSets: changed.length };
}

/** What the UI shows as "running" and the last error, for accounts on jobs. */
export function jobStatus(acc: Account): {
  running: string | null;
  error: string | null;
  /** 'notStarted': the last job failed before the tab asked EA anything (not logged in, tab closed) */
  errorCode: 'notStarted' | null;
  club: { state: 'queued' | 'running'; loaded: number } | null;
} {
  const q = queueOf(acc);
  const active = q.find((j) => j.status === 'running' || j.status === 'queued');
  const last = [...q].reverse().find((j) => j.status === 'done' || j.status === 'failed');
  const clubJob = q.find((j) => j.kind === 'club' && (j.status === 'running' || j.status === 'queued'));
  return {
    running: active ? (active.kind === 'club' ? 'club' : active.kind === 'challengeSquad' ? 'squad' : 'sbc') : null,
    error: !active && last?.status === 'failed' ? last.error ?? null : null,
    errorCode: !active && last?.status === 'failed' && last.notStarted ? 'notStarted' : null,
    club: clubJob ? { state: clubJob.status === 'running' ? 'running' : 'queued', loaded: clubJob.clubLoaded ?? 0 } : null,
  };
}
