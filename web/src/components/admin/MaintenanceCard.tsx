// Maintenance mode switch: while on, users get the maintenance page (admins keep the whole site) and the
// owner's Discord alert channel hears about every switch.
import { useEffect, useState } from 'react';
import { Wrench } from '@phosphor-icons/react';
import { api, type AdminMaintenance } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { errorText } from '../../messages';

export function MaintenanceCard() {
  const { t } = useI18n();
  const ago = useAgo();
  const [m, setM] = useState<AdminMaintenance | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.adminMaintenance().then((s) => {
      setM(s);
      setNote(s.note);
    }, (e) => setError(errorText(e, t)));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (on: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const s = await api.adminSetMaintenance(on, note);
      setM(s);
      setNote(s.note);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={`adm-card${m?.on ? ' adm-maint-on' : ''}`}>
      <h2>
        <Wrench aria-hidden="true" /> {t('admin.maint.title')}
      </h2>
      <p role="status">
        <b>{m?.on ? t('admin.maint.on') : t('admin.maint.off')}</b>
        {m?.on && m.since && <span className="muted"> · {t('admin.maint.since', { time: ago(Date.parse(m.since)) })}</span>}
      </p>
      <p className="muted">{t('admin.maint.lede')}</p>
      <label className="adm-field">
        <span>{t('admin.maint.note')}</span>
        <input type="text" maxLength={280} value={note} placeholder={t('admin.maint.notePlaceholder')} onChange={(e) => setNote(e.target.value)} disabled={busy || !m} />
      </label>
      <div className="adm-actions">
        {m?.on ? (
          <>
            <button type="button" className="solve-sm" disabled={busy} onClick={() => void save(false)}>{t('admin.maint.turnOff')}</button>
            <button type="button" className="ghost" disabled={busy || note === m.note} onClick={() => void save(true)}>{t('admin.maint.saveNote')}</button>
          </>
        ) : (
          <button type="button" className="ghost" disabled={busy || !m} onClick={() => void save(true)}>{t('admin.maint.turnOn')}</button>
        )}
      </div>
      {error && <p className="signin-error" role="alert">{error}</p>}
    </section>
  );
}
