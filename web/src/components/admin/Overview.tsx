// Dashboard: KPIs (each opens the filtered table), 7/30-day charts, what needs attention, versions,
// data counts and the sync-everyone action from the old screen.
import { useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { api, type AdminAttention, type AdminSyncResult } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { errorText } from '../../messages';
import { adminRoute, routePath } from '../../route';
import type { AdminProps } from './AdminLayout';
import { BarChart } from './BarChart';
import { KpiCard } from './KpiCard';
import { useLoad } from './useLoad';

export function Overview({ navigate }: AdminProps) {
  const { t } = useI18n();
  const ago = useAgo();
  const [range, setRange] = useState<7 | 30>(7);
  const { data: o, error, reload } = useLoad(() => api.adminOverview(range), [range], 30000);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<AdminSyncResult[] | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const users = (query: string) => adminRoute('users', { query });
  const accounts = (query: string) => adminRoute('accounts', { query });
  const kpiLink = (r: ReturnType<typeof users>) => ({ href: routePath(r), onOpen: () => navigate(r) });

  const syncAll = async (what: 'club' | 'sbc' | 'all') => {
    setBusy(what);
    setSyncError(null);
    try {
      setResults((await api.adminSync(what)).results);
      await reload();
    } catch (e) {
      setSyncError(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };

  if (!o) return error ? <p className="signin-error" role="alert">{error}</p> : <p className="muted" aria-busy="true">{t('admin.loading')}</p>;
  const k = o.kpis;
  const s = o.series;

  const attentionText = (a: AdminAttention) =>
    a.kind === 'expiring'
      ? t('admin.attention.expiring', { email: a.email, time: new Date(a.until).toLocaleDateString() })
      : t(`admin.attention.${a.kind}`, { name: a.personaName, detail: a.detail ?? '' });
  const attentionRoute = (a: AdminAttention) =>
    a.userId ? adminRoute('user', { userId: a.userId }) : accounts(`q=${a.kind === 'expiring' ? '' : a.personaId}`);

  return (
    <>
      {error && <p className="signin-error" role="alert">{error}</p>}
      <p className="muted">{t('admin.lede', { time: ago(o.at) })}</p>
      <div className="adm-kpis">
        <KpiCard label={t('admin.kpi.users')} value={k.users.total} sub={t('admin.kpi.usersNew', { n: k.users.new7d, count: k.users.new7d })} {...kpiLink(users(''))} />
        <KpiCard label={t('admin.kpi.active')} value={k.users.active24h} sub={t('admin.kpi.active7d', { n: k.users.active7d, count: k.users.active7d })} {...kpiLink(users('activity=24h'))} />
        <KpiCard label={t('admin.kpi.premium')} value={k.premium.total} sub={t('admin.kpi.expiring', { n: k.premium.expiring7d, count: k.premium.expiring7d })} {...kpiLink(users('plan=premium'))} />
        <KpiCard label={t('admin.kpi.online')} value={`${k.accounts.online}/${k.accounts.total}`} sub={t('admin.kpi.unlinked', { n: k.accounts.unlinked, count: k.accounts.unlinked })} {...kpiLink(accounts('state=online'))} />
        <KpiCard label={t('admin.kpi.problem')} value={k.accounts.problem} tone={k.accounts.problem ? 'bad' : undefined} sub={t('admin.kpi.problemSub')} {...kpiLink(accounts('state=problem'))} />
        <KpiCard label={t('admin.kpi.solvesToday')} value={k.solvesToday} />
        <KpiCard label={t('admin.kpi.ea')} value={k.ea.today} sub={t('admin.kpi.eaSub', { limit: k.ea.limit })} />
      </div>

      <section className="adm-card">
        <div className="adm-head">
          <h2>{t('admin.charts.title')}</h2>
          <div className="adm-range" role="group" aria-label={t('admin.charts.range')}>
            {([7, 30] as const).map((r) => (
              <button key={r} type="button" className="ghost" aria-pressed={range === r} onClick={() => setRange(r)}>
                {t('admin.charts.days', { n: r })}
              </button>
            ))}
          </div>
        </div>
        <div className="adm-grid2">
          <BarChart title={t('admin.charts.solves')} days={s.days} series={[
            { label: t('admin.charts.found'), values: s.found, tone: 'go' },
            { label: t('admin.charts.notFound'), values: s.notFound, tone: 'muted' },
          ]} />
          <BarChart title={t('admin.charts.signups')} days={s.days} series={[{ label: t('admin.charts.signups'), values: s.signups, tone: 'ink' }]} />
          <BarChart title={t('admin.charts.ea')} days={s.days} series={[{ label: t('admin.charts.ea'), values: s.eaRequests, tone: 'ink' }]} />
          <BarChart title={t('admin.charts.syncs')} days={s.days} series={[
            { label: t('admin.charts.syncOk'), values: s.syncs.map((n, i) => n - s.syncFailed[i]), tone: 'ink' },
            { label: t('admin.charts.syncFailed'), values: s.syncFailed, tone: 'bad' },
          ]} />
        </div>
      </section>

      <div className="adm-grid2">
        <section className="adm-card">
          <h2>{t('admin.attention.title', { count: o.attention.length })}</h2>
          {o.attention.length === 0 ? (
            <p className="muted">{t('admin.attention.none')}</p>
          ) : (
            <ul className="adm-list">
              {o.attention.map((a, i) => {
                const r = attentionRoute(a);
                return (
                  <li key={i}>
                    <a href={routePath(r)} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(r); }}>{attentionText(a)}</a>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        <section className="adm-card">
          <h2>{t('admin.versions.title', { v: o.latestExtension })}</h2>
          <ul className="adm-list">
            {o.versions.map((v) => (
              <li key={v.version}>
                <span>{v.version === '?' ? t('admin.versions.unknown') : v.version}{!v.latest && v.version !== '?' && <small className="muted"> · {t('admin.versions.old')}</small>}{v.latest && <small> · {t('admin.versions.latest')}</small>}</span>
                <b>{v.count}</b>
              </li>
            ))}
          </ul>
          <h2>{t('admin.data.title')}</h2>
          <ul className="adm-list">
            <li><span>{t('admin.data.sets')}</span><b>{o.db.sets}</b></li>
            <li><span>{t('admin.data.challenges')}</span><b>{o.db.challenges}</b></li>
            <li><span>{t('admin.data.bricks')}</span><b>{o.db.brickReports}</b></li>
            <li><span>{t('admin.data.trusted')}</span><b>{o.db.trusted}</b></li>
            <li><span>{t('admin.data.drop')}</span><b>{ago(o.lastDrop)}</b></li>
          </ul>
        </section>
      </div>

      <section className="adm-card">
        <h2>{t('admin.sync.title')}</h2>
        <p className="muted">{t('admin.sync.lede')}</p>
        <div className="adm-actions">
          <button type="button" className="solve-sm" disabled={!!busy} onClick={() => void syncAll('all')}>
            <ArrowsClockwise aria-hidden="true" /> {busy === 'all' ? t('admin.sync.running') : t('admin.sync.all')}
          </button>
          <button type="button" className="ghost wide" disabled={!!busy} onClick={() => void syncAll('club')}>{t('admin.sync.club')}</button>
          <button type="button" className="ghost wide" disabled={!!busy} onClick={() => void syncAll('sbc')}>{t('admin.sync.sbc')}</button>
        </div>
        {syncError && <p className="signin-error" role="alert">{syncError}</p>}
        {results && (
          <p role="status">{t('admin.sync.summary', {
            queued: results.filter((r) => r.outcome === 'queued').length,
            deferred: results.filter((r) => r.outcome === 'deferred').length,
            skipped: results.filter((r) => r.outcome === 'skipped').length,
          })}</p>
        )}
      </section>
    </>
  );
}
