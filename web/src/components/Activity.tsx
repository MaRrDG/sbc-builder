// Sync activity in the top bar: a button with a progress ring, a non-modal panel with one row per
// job (club, SBC list, ...) running in the EA web app tab, and a short toast when one finishes.
// Nothing here blocks the page: the club keeps loading while you browse sets or play the Daily.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ArrowsClockwise, CheckCircle, HourglassMedium, PauseCircle, Queue, WarningCircle, X } from '@phosphor-icons/react';
import type { JobView, SyncStatus } from '../api';
import { useAgo, useI18n } from '../i18n';
import { isActive, mainJob, pct, toastable } from '../activity';

const R = 8;
const C = 2 * Math.PI * R;

/** 20px ring: filled up to the percentage when known, a turning arc otherwise (still under reduced motion). */
function Ring({ value, waiting }: { value: number | null; waiting: boolean }) {
  const spin = value === null && !waiting;
  const arc = value === null ? C * 0.28 : (C * value) / 100;
  return (
    <svg className={`activity-ring${spin ? ' turning' : ''}${waiting ? ' waiting' : ''}`} width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle className="track" cx="10" cy="10" r={R} />
      <circle className="arc" cx="10" cy="10" r={R} strokeDasharray={`${arc} ${C}`} transform="rotate(-90 10 10)" />
    </svg>
  );
}

type T = (key: string, params?: Record<string, string | number>) => string;

/** "120/~1200" (estimated total), "3/12" (exact), the count alone when only that is known, else "". */
export function jobProgress(t: T, j: JobView): string {
  if (j.total)
    return j.estimated ? t('activity.progressEst', { done: j.done, total: j.total }) : t('activity.progress', { done: j.done, total: j.total });
  return j.done ? String(j.done) : '';
}

function useJobText() {
  const { t } = useI18n();
  const kind = (j: JobView) => t(`activity.kind.${j.kind}`);
  const progress = (j: JobView) => jobProgress(t, j);
  return { kind, progress };
}

const timeOf = (ms: number, lang: string) => new Date(ms).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });

export function ActivityButton({ status, live, open, onToggle, buttonRef }: {
  status: SyncStatus | null; live: boolean; open: boolean; onToggle: () => void; buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useI18n();
  const ago = useAgo();
  const { kind, progress } = useJobText();
  const job = mainJob(status?.jobs ?? []);
  const waiting = !!job && (job.state === 'waitingTab' || job.state === 'waitingLogin');
  const paused = job?.state === 'paused';
  const count = job ? progress(job) : '';
  const short = waiting ? t('activity.waitShort') : paused ? t('activity.pausedShort') : count;
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`ghost activity-btn${job ? ' busy' : ''}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={open ? 'activity-panel' : undefined}
      onClick={onToggle}
    >
      {job ? <Ring value={pct(job)} waiting={waiting || paused} /> : <ArrowsClockwise weight="bold" aria-hidden="true" />}
      <span className="sr-only">{t('activity.title')}: </span>
      {job ? (
        <span className="activity-now">
          <span className="activity-kind">{kind(job)}</span>
          {short && <small>{short}</small>}
        </span>
      ) : (
        <span className="activity-idle">
          <span>{t('top.club')}</span> <small>{ago(status?.clubAt ?? null)}</small>
          <span aria-hidden="true"> · </span>
          <span>{t('top.sbcs')}</span> <small>{ago(status?.sbcAt ?? null)}</small>
        </span>
      )}
      {/* phones: the top bar keeps only this button, so it also says whether the web app is connected */}
      <span className={`session activity-session${live ? ' on' : ''}`}>{live ? t('top.live') : t('top.offline')}</span>
    </button>
  );
}

function JobRow({ job }: { job: JobView }) {
  const { t, lang } = useI18n();
  const ago = useAgo();
  const { kind, progress } = useJobText();
  const value = pct(job);
  const Icon =
    job.state === 'waitingTab' || job.state === 'waitingLogin'
      ? HourglassMedium
      : job.state === 'queued'
        ? Queue
        : job.state === 'running'
          ? ArrowsClockwise
          : job.state === 'paused'
            ? PauseCircle
            : job.state === 'done'
              ? CheckCircle
              : WarningCircle;
  const state =
    job.state === 'paused'
      ? t('activity.state.paused', { time: job.resumeAt ? timeOf(job.resumeAt, lang) : '…' })
      : t(`activity.state.${job.state}`);
  const why = job.state === 'failed' ? (job.notStarted ? t('clubSync.notStartedBody') : t('activity.failedBody')) : null;
  const moving = job.state === 'running' || job.state === 'queued';
  const count = progress(job);
  return (
    <li className={`activity-row ${job.state}`}>
      <Icon className="activity-icon" weight={job.state === 'done' || job.state === 'failed' ? 'fill' : 'bold'} aria-hidden="true" />
      <div className="activity-main">
        <div className="activity-line">
          <strong>{kind(job)}</strong>
          <span className="activity-meta">{isActive(job) ? count : ago(job.at)}</span>
        </div>
        <p className="activity-state">{state}</p>
        {why && <p className="activity-why">{why}</p>}
        {moving && (
          <div
            className={`activity-bar${value === null ? ' indeterminate' : ''}`}
            role="progressbar"
            aria-label={kind(job)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={value ?? undefined}
            aria-valuetext={count || state}
          >
            <span style={value === null ? undefined : { width: `${value}%` }} />
          </div>
        )}
      </div>
    </li>
  );
}

export function ActivityPanel({ status, now, busy, live, clubWait, onClose, onSyncClub, buttonRef }: {
  status: SyncStatus | null; now: number; busy: boolean; live: boolean;
  /** minutes until the Club button works again (0: now) */
  clubWait: number;
  onClose: () => void; onSyncClub: () => void; buttonRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useI18n();
  const ago = useAgo();
  const ref = useRef<HTMLDivElement>(null);
  const jobs = status?.jobs ?? [];
  const grace = !!status?.graceUntil && status.graceUntil > now;

  useEffect(() => {
    ref.current?.focus(); // opened from the button: keyboard users land in the panel
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      onClose();
      buttonRef.current?.focus();
    };
    const onDown = (e: PointerEvent) => {
      const el = e.target as Node;
      if (ref.current?.contains(el) || buttonRef.current?.contains(el)) return;
      onClose();
      // a click on nothing focusable leaves focus on the page: give it back to the button
      setTimeout(() => {
        if (document.activeElement === document.body) buttonRef.current?.focus();
      });
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [onClose, buttonRef]);

  const sbcNext =
    status?.sbcNextAt == null
      ? t('top.sbcAuto')
      : status.sbcNextAt > now
        ? t('top.sbcNext', { m: Math.max(1, Math.ceil((status.sbcNextAt - now) / 60_000)) })
        : t('top.sbcReady');

  return (
    <div id="activity-panel" className="activity-panel" role="dialog" aria-label={t('activity.title')} ref={ref} tabIndex={-1}>
      <div className="activity-head">
        <h2>{t('activity.title')}</h2>
        <button type="button" className="activity-x" aria-label={t('activity.close')} onClick={() => { onClose(); buttonRef.current?.focus(); }}>
          <X weight="bold" aria-hidden="true" />
        </button>
      </div>
      {jobs.length === 0 && !grace ? (
        <p className="activity-empty">{t('activity.idle')}</p>
      ) : (
        <ul className="activity-list">
          {grace && (
            <li className="activity-row waitingTab">
              <HourglassMedium className="activity-icon" weight="bold" aria-hidden="true" />
              <div className="activity-main">
                <p className="activity-state">{t('activity.grace')}</p>
              </div>
            </li>
          )}
          {jobs.map((j) => (
            <JobRow key={j.id} job={j} />
          ))}
        </ul>
      )}
      <div className="activity-foot">
        <button
          type="button"
          className="ghost"
          disabled={busy || !live || clubWait > 0}
          onClick={onSyncClub}
          title={clubWait > 0 ? t('top.clubWait', { n: clubWait }) : t('top.clubTitle')}
        >
          <ArrowsClockwise weight="bold" aria-hidden="true" />
          <span>{t('top.club')}</span>
          <small>{ago(status?.clubAt ?? null)}</small>
        </button>
        {clubWait > 0 && <p className="activity-note">{t('top.clubWait', { n: clubWait })}</p>}
        <p className="activity-note" title={t('top.sbcTitle')}>
          {t('top.sbcs')}: {ago(status?.sbcAt ?? null)} · {sbcNext}
        </p>
      </div>
    </div>
  );
}

type Toast = { what: 'club' | 'sbc' | 'failed'; at: number };

/**
 * A short note when a sync finishes; the panel keeps the details. `jobs` is null while the status on
 * screen came from the cache: only network statuses are compared, so a cached "running" that the
 * network shows done never toasts on load or on an account switch.
 */
export function ActivityToast({ jobs, players, account }: { jobs: JobView[] | null; players: number; account: number | null }) {
  const { t } = useI18n();
  const prev = useRef<{ account: number | null; jobs: JobView[] } | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!jobs) return;
    const before = prev.current?.account === account ? prev.current.jobs : null;
    prev.current = { account, jobs };
    if (!before) return; // the first network status of this account: nothing finished "just now"
    const fin = toastable(before, jobs, Date.now());
    const what = fin.some((j) => j.state === 'failed')
      ? 'failed'
      : fin.some((j) => j.kind === 'club')
        ? 'club'
        : fin.some((j) => j.kind === 'sbc')
          ? 'sbc'
          : null;
    if (what) setToast({ what, at: Date.now() });
  }, [jobs, account]);

  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(id);
  }, [toast]);

  // the live region stays in the page so screen readers hear what appears in it
  return (
    <div className="activity-toast-host" role="status" aria-live="polite">
      {toast && (
        <div className={`activity-toast ${toast.what}`}>
          {toast.what === 'failed' ? <WarningCircle weight="fill" aria-hidden="true" /> : <CheckCircle weight="fill" aria-hidden="true" />}
          <span>
            {toast.what === 'club'
              ? t('activity.toast.club', { count: players })
              : toast.what === 'sbc'
                ? t('activity.toast.sbc')
                : t('activity.toast.failed')}
          </span>
          <button type="button" className="activity-x" aria-label={t('activity.dismiss')} onClick={() => setToast(null)}>
            <X weight="bold" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
