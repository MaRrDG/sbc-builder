// Pure: what the site shows for each sync job (activity panel, top bar): its state and progress.
export type JobKindView = 'club' | 'sbc' | 'challenges' | 'challengeSquad' | 'academy';
export type JobState = 'waitingTab' | 'waitingLogin' | 'queued' | 'running' | 'paused' | 'done' | 'failed';

export interface JobLike {
  id: string;
  kind: JobKindView;
  status: 'queued' | 'running' | 'done' | 'failed';
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  notStarted?: boolean;
  setIds?: number[];
  clubLoaded?: number;
  calls?: number;
}

export interface JobCtx {
  tabOpen: boolean;
  tabReady: boolean;
  pausedUntil: number | null;
  clubExpected: number | null;
}

export interface JobView {
  id: string;
  kind: JobKindView;
  state: JobState;
  done: number;
  total: number | null;
  estimated: boolean;
  at: number;
  error: string | null;
  notStarted: boolean;
  resumeAt: number | null;
}

export function jobView(j: JobLike, ctx: JobCtx): JobView {
  const active = j.status === 'queued' || j.status === 'running';
  const state: JobState =
    !active ? j.status === 'done' ? 'done' : 'failed'
    : ctx.pausedUntil ? 'paused'
    : j.status === 'running' ? 'running'
    : !ctx.tabOpen ? 'waitingTab'
    : !ctx.tabReady ? 'waitingLogin'
    : 'queued';
  const total = j.kind === 'challenges' ? j.setIds?.length ?? null : j.kind === 'club' ? ctx.clubExpected : null;
  const done =
    j.kind === 'club' ? j.clubLoaded ?? 0
    : j.kind === 'challenges' ? state === 'done' ? total ?? 0 : Math.min(j.calls ?? 0, total ?? 0)
    : 0;
  return {
    id: j.id,
    kind: j.kind,
    state,
    done,
    total,
    estimated: j.kind === 'club' && total !== null,
    at: j.finishedAt ?? j.startedAt ?? j.createdAt,
    error: state === 'failed' ? j.error ?? null : null,
    notStarted: !!j.notStarted,
    resumeAt: state === 'paused' ? ctx.pausedUntil : null,
  };
}

/** Active jobs first (oldest first), then the newest finished job of each kind; at most 6 rows. */
export function jobViews(jobs: JobLike[], ctx: JobCtx): JobView[] {
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running').sort((a, b) => a.createdAt - b.createdAt);
  const finished = new Map<JobKindView, JobLike>();
  for (const j of jobs) {
    if (j.status !== 'done' && j.status !== 'failed') continue;
    const prev = finished.get(j.kind);
    if (!prev || (j.finishedAt ?? 0) > (prev.finishedAt ?? 0)) finished.set(j.kind, j);
  }
  const done = [...finished.values()].filter((j) => !active.some((a) => a.kind === j.kind)).sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  return [...active, ...done].slice(0, 6).map((j) => jobView(j, ctx));
}
