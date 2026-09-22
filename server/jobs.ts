// Sync jobs for accounts whose extension (0.7+) makes every EA request from the web app tab.
// The server never talks to EA for them: it queues a job, the extension picks it up while a
// web app tab is open, the page runs a fixed, read-only recipe for that job kind, and its
// responses come back through /api/webapp-event like any other web app load.
import { randomBytes } from 'node:crypto';
import type { Account } from './accounts.js';
import { readCache } from './store.js';
import type { SetsData } from './sync.js';

export type JobKind = 'club' | 'sbc' | 'challenges' | 'challengeSquad';

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
}

const queues = new Map<number, Job[]>();
const lastPoll = new Map<number, number>();
const lastFinished = new Map<number, number>();
const RUNNING_TIMEOUT = 3 * 60 * 1000; // a tab closed mid-job: give up and allow a new one
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
  for (const j of q)
    if (j.status === 'running' && now - (j.startedAt ?? now) > RUNNING_TIMEOUT) {
      j.status = 'failed';
      j.error = 'The web app tab stopped before the sync finished.';
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
  if (kind === 'sbc') {
    const sets = await readCache<SetsData>(acc.key('sets'));
    job.before = Object.fromEntries(sets?.data.categories.flatMap((c) => c.sets).map((s) => [s.setId, progress(s)]) ?? []);
  }
  q.push(job);
  return job;
}

/** The extension asks for the next job; also marks the web app tab as open. */
export function nextJob(acc: Account): Job | null {
  lastPoll.set(acc.id, Date.now());
  const q = queueOf(acc);
  if (q.some((j) => j.status === 'running')) return null; // one at a time
  if (Date.now() - (lastFinished.get(acc.id) ?? 0) < REST_BETWEEN_JOBS) return null;
  const job = q.find((j) => j.status === 'queued') ?? null;
  if (job) {
    job.status = 'running';
    job.startedAt = Date.now();
  }
  return job;
}

export function findJob(acc: Account, id: string) {
  return queueOf(acc).find((j) => j.id === id) ?? null;
}

/** The page finished a job. An SBC list refresh queues the challenges of sets that changed. */
export async function finishJob(acc: Account, job: Job, ok: boolean, error?: string) {
  job.status = ok ? 'done' : 'failed';
  lastFinished.set(acc.id, Date.now());
  job.error = ok ? undefined : error ?? 'Sync failed in the web app tab.';
  if (!ok || job.kind !== 'sbc') return;
  const sets = await readCache<SetsData>(acc.key('sets'));
  const changed: number[] = [];
  for (const set of sets?.data.categories.flatMap((c) => c.sets) ?? []) {
    const cached = await readCache(acc.key(`challenges/${set.setId}`));
    if (cached && job.before?.[set.setId] === progress(set)) continue;
    // finished one-off sets are only loaded when the user opens them in the web app
    if (!cached && set.challengesCompletedCount >= set.challengesCount && !set.repeatable) continue;
    changed.push(set.setId);
  }
  if (changed.length) await enqueue(acc, 'challenges', changed);
}

/** What the UI shows as "running" and the last error, for accounts on jobs. */
export function jobStatus(acc: Account): { running: string | null; error: string | null } {
  const q = queueOf(acc);
  const active = q.find((j) => j.status === 'running' || j.status === 'queued');
  const last = [...q].reverse().find((j) => j.status === 'done' || j.status === 'failed');
  return {
    running: active ? (active.kind === 'club' ? 'club' : active.kind === 'challengeSquad' ? 'squad' : 'sbc') : null,
    error: !active && last?.status === 'failed' ? last.error ?? null : null,
  };
}
