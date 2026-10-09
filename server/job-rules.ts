// Pure rules for client-mode sync jobs: which polls come from a web app tab, and when a job
// nobody is running any more gives up.
import { versionLess } from './admin/query.js';

/**
 * A /api/jobs/next poll made by a web app tab. Extension 0.8.8+ tabs always send `ready`; its
 * background also polls once right after /api/hello, and a hello can come from an FC Solver site
 * visit (link token) with no web app tab open at all. That poll must neither take a job nor
 * count as an open tab. Older extensions send nothing either way: trusted as before.
 */
export function isTabPoll(extVersion: string | null | undefined, ready: string | undefined): boolean {
  if (ready !== undefined) return true;
  return !extVersion || versionLess(extVersion, '0.8.8');
}

export interface JobTimes {
  status: 'queued' | 'running' | 'done' | 'failed';
  createdAt: number;
  startedAt?: number;
  calledAt?: number;
}

export const JOB_TIMEOUTS = {
  /** handed to a tab that never called EA for it (web app not logged in, tab gone to the EA login) */
  start: 60 * 1000,
  /** a tab closed mid-job: give up and allow a new one */
  running: 3 * 60 * 1000,
  /** the extension polls every 5 s (15 s hidden) while a web app tab is open */
  open: 30 * 1000,
};

/**
 * What a waiting / running job becomes now: null keeps it, 'notStarted' fails it without any
 * EA call spent, 'stopped' fails it after the tab started asking EA.
 */
export function expiredAs(job: JobTimes, now: number, tabOpen: boolean): 'notStarted' | 'stopped' | null {
  if (job.status === 'running') {
    const started = job.startedAt ?? now;
    if (!job.calledAt && (now - started > JOB_TIMEOUTS.start || !tabOpen)) return 'notStarted';
    // no tab polls any more: nothing is running it, whatever the job said last
    if (job.calledAt && (now - started > JOB_TIMEOUTS.running || !tabOpen)) return 'stopped';
    return null;
  }
  // the tab closed (or went to the EA login) before it took the job: nobody will run it
  if (job.status === 'queued' && now - job.createdAt > JOB_TIMEOUTS.open && !tabOpen) return 'notStarted';
  return null;
}
