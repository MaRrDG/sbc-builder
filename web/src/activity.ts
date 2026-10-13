// Pure rules for the activity indicator and panel (sync jobs running in the EA web app tab).
import type { JobView } from './api';

const ACTIVE = new Set<JobView['state']>(['waitingTab', 'waitingLogin', 'queued', 'running', 'paused']);
export const isActive = (j: JobView) => ACTIVE.has(j.state);

export const mainJob = (jobs: JobView[]) => jobs.find(isActive) ?? null;

export function pct(v: JobView): number | null {
  if (v.state === 'done') return 100;
  if (!v.total) return null;
  return Math.min(99, Math.round((v.done / v.total) * 100));
}

export function finishedNow(prev: JobView[], next: JobView[]): JobView[] {
  const wasActive = new Set(prev.filter(isActive).map((j) => j.id));
  return next.filter((j) => wasActive.has(j.id) && (j.state === 'done' || j.state === 'failed'));
}

/** Solve waits for a club sync that is queued or running in an open tab, never for one that waits for the tab. */
export const solveWait = (jobs: JobView[]) => jobs.find((j) => j.kind === 'club' && (j.state === 'queued' || j.state === 'running')) ?? null;

/** Jobs worth a toast: they finished between two network statuses, in the last 30 s (never an old finish seen late). */
export const TOAST_FRESH_MS = 30_000;
export const toastable = (prev: JobView[], next: JobView[], now: number) =>
  finishedNow(prev, next).filter((j) => now - j.at <= TOAST_FRESH_MS);
