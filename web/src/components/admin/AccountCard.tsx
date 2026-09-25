// One EA account: identity, freshness, EA usage and the admin actions (sync, trust).
import { useState, type ReactNode } from 'react';
import { ArrowsClockwise, CheckCircle, Circle, ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { api, type AdminAccount, type AdminSyncResult } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { errorText } from '../../messages';

export function AccountCard({ acc, latest, onChanged, extra }: { acc: AdminAccount; latest: string; onChanged: () => void; extra?: ReactNode }) {
  const { t } = useI18n();
  const ago = useAgo();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const act = async (key: string, fn: () => Promise<string | null>) => {
    setBusy(key);
    setMsg(null);
    try {
      setMsg(await fn());
      onChanged();
    } catch (e) {
      setMsg(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };
  const syncText = (r: AdminSyncResult | undefined) =>
    !r ? null : r.outcome === 'skipped' ? t(`err.${r.code}`, r.params) : t(`admin.account.sync.${r.outcome}`);
  const sync = (what: 'club' | 'sbc' | 'all') => act(`sync:${what}`, async () => syncText((await api.adminSync(what, [acc.personaId])).results[0]));
  const outdated = !acc.extVersion || acc.extVersion !== latest;
  const fresh = (at: number | null, stale: boolean, label: string) => (
    <span className="adm-dot">
      {stale ? <WarningCircle className="adm-bad" aria-hidden="true" /> : <CheckCircle aria-hidden="true" />}
      {label}: {ago(at)} {stale && <small>({t('admin.account.stale')})</small>}
    </span>
  );
  return (
    <article className="adm-card">
      <header className="adm-head">
        <div>
          <h3>{acc.personaName} {acc.trusted && <span className="adm-badge"><ShieldCheck aria-hidden="true" /> {t('admin.trusted')}</span>}</h3>
          <small className="muted">{acc.clubName} · {acc.personaId}</small>
        </div>
        <span className="adm-dot">
          <Circle weight={acc.online ? 'fill' : 'regular'} aria-hidden="true" /> {acc.online ? t('admin.account.online') : t('admin.account.offline')}
        </span>
      </header>
      <dl className="adm-dl">
        <dt>{t('admin.account.mode')}</dt><dd>{t(`admin.account.mode.${acc.mode}`)}</dd>
        <dt>{t('admin.account.ext')}</dt><dd>{acc.extVersion ?? '?'} {outdated && <span className="adm-badge bad">{t('admin.versions.old')}</span>}</dd>
        <dt>{t('admin.account.club')}</dt><dd>{fresh(acc.clubAt, acc.clubStale, t('admin.account.players', { n: acc.players, count: acc.players }))}</dd>
        <dt>{t('admin.account.sbcs')}</dt><dd>{fresh(acc.sbcAt, acc.sbcStale, t('admin.account.sbcList'))}</dd>
        <dt>{t('admin.account.ea')}</dt>
        <dd>
          {acc.ea.today}/{acc.ea.limit} · {t('admin.account.clubSyncs', { used: acc.clubSyncs.used, limit: acc.clubSyncs.limit })}
          {acc.ea.pausedUntil && <span className="adm-badge bad">{t('admin.account.paused')}</span>}
        </dd>
        {acc.running && (<><dt>{t('admin.account.running')}</dt><dd>{acc.running}</dd></>)}
        {acc.error && (<><dt>{t('admin.account.error')}</dt><dd className="adm-bad">{acc.error}</dd></>)}
        {acc.forced && (<><dt>{t('admin.account.forced')}</dt><dd>{[acc.forced.club && 'club', acc.forced.sbc && 'sbc'].filter(Boolean).join(', ')}</dd></>)}
        {extra}
      </dl>
      <div className="adm-actions">
        {(['all', 'club', 'sbc'] as const).map((w) => (
          <button key={w} type="button" className={w === 'all' ? 'solve-sm' : 'ghost wide'} disabled={!!busy} onClick={() => void sync(w)}>
            <ArrowsClockwise aria-hidden="true" /> {t(`admin.sync.${w}`)}
          </button>
        ))}
        <button type="button" className="ghost wide" disabled={!!busy} onClick={() => void act('trust', async () => (await api.adminTrust(acc.personaId, !acc.trusted), null))}>
          <ShieldCheck aria-hidden="true" /> {acc.trusted ? t('admin.untrust') : t('admin.trust')}
        </button>
      </div>
      {msg && <p role="status" className="muted">{msg}</p>}
    </article>
  );
}
