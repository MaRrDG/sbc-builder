// Blocks the site while a club sync runs in the web app tab, with how many players came in so far.
// Stays open after it ends to say how it went, until the user closes it.
import { useEffect, useRef, useState } from 'react';
import { CheckCircle, UsersThree, WarningCircle } from '@phosphor-icons/react';
import type { SyncStatus } from '../api';
import { useI18n } from '../i18n';

type Phase = 'running' | 'done' | 'failed' | null;

export function ClubSyncModal({ status, players }: { status: SyncStatus | null; players: number }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [phase, setPhase] = useState<Phase>(null);
  const running = status?.club?.state === 'running';

  useEffect(() => {
    if (running) setPhase('running');
    else setPhase((p) => (p === 'running' ? (status?.error ? 'failed' : 'done') : p));
  }, [running, status?.error]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (phase && !d.open) d.showModal(); // the rest of the page goes inert
    else if (!phase && d.open) d.close();
  }, [phase]);

  const loaded = status?.club?.loaded ?? 0;
  const expected = status?.club?.expected ?? null;
  // the cached club is only a rough total: never show 100% before the sync says it is done
  const pct = expected ? Math.min(99, Math.round((loaded / expected) * 100)) : null;

  return (
    <dialog
      ref={ref}
      className="club-sync"
      aria-labelledby="club-sync-title"
      aria-busy={phase === 'running'}
      onCancel={(e) => {
        if (phase === 'running') e.preventDefault(); // no Esc while it runs
        else setPhase(null);
      }}
      onClose={() => {
        // Chrome lets a repeated Esc close it despite preventDefault: open it again while it runs
        if (phase === 'running') ref.current?.showModal();
        else setPhase(null);
      }}
    >
      {phase === 'running' && (
        <>
          <UsersThree weight="duotone" className="club-sync-icon" aria-hidden />
          <h2 id="club-sync-title">{t('clubSync.title')}</h2>
          <p>{t('clubSync.lede')}</p>
          <div
            className={`club-sync-bar${pct === null ? ' indeterminate' : ''}`}
            role="progressbar"
            aria-label={t('clubSync.title')}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={pct ?? undefined}
          >
            <span style={pct === null ? undefined : { width: `${pct}%` }} />
          </div>
          <p className="club-sync-count" aria-live="polite">
            {expected ? t('clubSync.loadedOf', { count: loaded, total: expected }) : t('clubSync.loaded', { count: loaded })}
          </p>
          <p className="club-sync-hint">{t('clubSync.keepOpen')}</p>
        </>
      )}
      {phase === 'done' && (
        <>
          <CheckCircle weight="fill" className="club-sync-icon ok" aria-hidden />
          <h2 id="club-sync-title">{t('clubSync.done')}</h2>
          <p>{t('clubSync.doneBody', { count: players })}</p>
          <button type="button" className="club-sync-close" autoFocus onClick={() => setPhase(null)}>
            {t('clubSync.continue')}
          </button>
        </>
      )}
      {phase === 'failed' && (
        <>
          <WarningCircle weight="fill" className="club-sync-icon bad" aria-hidden />
          <h2 id="club-sync-title">{t('clubSync.failed')}</h2>
          <p>{t('clubSync.failedBody')}</p>
          <button type="button" className="club-sync-close" autoFocus onClick={() => setPhase(null)}>
            {t('clubSync.continue')}
          </button>
        </>
      )}
    </dialog>
  );
}
