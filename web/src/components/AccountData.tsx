// Settings "Your data": download everything FC Solver keeps about the user, or schedule the account's
// deletion (7 days to undo). DeletionBanner sits on top of every dashboard screen while one is scheduled.
import { useId, useState } from 'react';
import { ArrowsClockwise, DownloadSimple, Trash, WarningCircle } from '@phosphor-icons/react';
import { api } from '../api';
import { isConfirmWord } from '../account/confirmWord';
import { useI18n, type Lang } from '../i18n';
import { errorText } from '../messages';
import { Row, Section } from './SettingsRows';

const dateText = (ms: number, lang: Lang) => new Date(ms).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });

/** Cancels a scheduled deletion; `onDone` reloads /api/me. */
function useCancelDelete(onDone: () => void) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cancel = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.cancelDelete();
      onDone();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, cancel };
}

export function DeletionBanner({ deleteAt, onChange }: { deleteAt: number | null; onChange: () => void }) {
  const { t, lang } = useI18n();
  const { busy, error, cancel } = useCancelDelete(onChange);
  if (deleteAt === null) return null;
  return (
    <div className="notice deletion-notice" role="status">
      <WarningCircle weight="fill" aria-hidden="true" />
      <span>
        {t('deletion.banner', { date: dateText(deleteAt, lang) })}{' '}
        <button type="button" className="text" disabled={busy} onClick={() => void cancel()}>
          {t('deletion.cancel')}
        </button>
        {error && <span className="deletion-error" role="alert"> {error}</span>}
      </span>
    </div>
  );
}

export function YourDataCard({ deleteAt, onChange }: { deleteAt: number | null; onChange: () => void }) {
  const { t, lang } = useI18n();
  const id = useId();
  const [exporting, setExporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [word, setWord] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const undo = useCancelDelete(onChange);

  const download = async () => {
    setExporting(true);
    setError(null);
    try {
      await api.exportData();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setExporting(false);
    }
  };

  const remove = async () => {
    if (!isConfirmWord(word) || deleting) return;
    setDeleting(true);
    setError(null);
    try {
      await api.requestDelete(word.trim());
      setOpen(false);
      setWord('');
      onChange();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setDeleting(false);
    }
  };

  const shownError = error ?? undo.error;
  return (
    <Section title={t('settings.data.title')}>
      <Row title={t('settings.export')} hint={t('settings.exportHint')}>
        <button type="button" className="ghost bordered" disabled={exporting} aria-busy={exporting} onClick={() => void download()}>
          {exporting ? <ArrowsClockwise weight="bold" className="spin" aria-hidden="true" /> : <DownloadSimple weight="bold" aria-hidden="true" />}{' '}
          {exporting ? t('settings.exporting') : t('settings.exportButton')}
        </button>
      </Row>
      {deleteAt !== null ? (
        <Row title={t('settings.delete')} hint={t('deletion.banner', { date: dateText(deleteAt, lang) })}>
          <button type="button" className="ghost bordered" disabled={undo.busy} onClick={() => void undo.cancel()}>
            {t('deletion.cancel')}
          </button>
        </Row>
      ) : (
        <Row title={t('settings.delete')} hint={t('settings.deleteHint')}>
          <button
            type="button"
            className="ghost bordered danger"
            aria-expanded={open}
            aria-controls={`${id}-confirm`}
            onClick={() => {
              setOpen((v) => !v);
              setError(null);
            }}
          >
            <Trash weight="bold" aria-hidden="true" /> {t('settings.delete')}
          </button>
        </Row>
      )}
      {deleteAt === null && open && (
        <form
          id={`${id}-confirm`}
          className="delete-confirm"
          onSubmit={(e) => {
            e.preventDefault();
            void remove();
          }}
        >
          <p>{t('settings.deleteBody')}</p>
          <p>
            {t('settings.deleteSub')}{' '}
            <a href="/refunds" target="_blank" rel="noopener">
              {t('billing.refunds')}
              <span className="sr-only"> {t('nav.newTab')}</span>
            </a>
          </p>
          <label htmlFor={`${id}-word`}>{t('settings.deleteConfirm', { word: t('settings.deleteWord') })}</label>
          <div className="delete-confirm-row">
            <input
              id={`${id}-word`}
              value={word}
              onChange={(e) => setWord(e.target.value)}
              placeholder={t('settings.deleteWord')}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
            />
            <button type="submit" className="delete-go" disabled={!isConfirmWord(word) || deleting} aria-busy={deleting}>
              {deleting && <ArrowsClockwise weight="bold" className="spin" aria-hidden="true" />} {t('settings.deleteButton')}
            </button>
            <button type="button" className="ghost bordered" onClick={() => setOpen(false)}>
              {t('account.cancel')}
            </button>
          </div>
        </form>
      )}
      {shownError && (
        <div className="banner" role="alert">
          {shownError}
        </div>
      )}
    </Section>
  );
}
