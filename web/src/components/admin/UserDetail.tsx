// One user: plan + quota controls, their EA accounts, solves per day and the event log.
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Copy } from '@phosphor-icons/react';
import { api, type AdminEvent } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { errorText } from '../../messages';
import { adminRoute, canGoBack, routePath } from '../../route';
import { AccountCard } from './AccountCard';
import type { AdminProps } from './AdminLayout';
import { BarChart } from './BarChart';
import { DataTable, type Column } from './DataTable';
import { untilEndOfDay } from './format';
import { PlanBadge } from './UsersTable';
import { useLoad } from './useLoad';

const dateInput = (ts: number | null) => (ts ? new Date(ts - new Date(ts).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '');

export function UserDetail({ route, navigate }: AdminProps) {
  const { t } = useI18n();
  const ago = useAgo();
  const id = route.userId ?? '';
  const { data: d, error, reload } = useLoad(() => api.adminUser(id), [id]);
  const [evPage, setEvPage] = useState(1);
  const ev = useLoad(() => api.adminUserEvents(id, evPage), [id, evPage]);
  const [tier, setTier] = useState<'free' | 'premium'>('free');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Sync the form from the loaded user only when it's a different user (or right after a plan
  // save), never on an unrelated reload (trust toggle, sync, quota reset) — that would wipe an
  // admin's unsaved tier/date edit.
  const syncedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!d || syncedFor.current === d.user.id) return;
    syncedFor.current = d.user.id;
    setTier(d.planSet);
    setUntil(dateInput(d.plan.premiumUntil));
  }, [d]);

  const back = () => (canGoBack() ? history.back() : navigate(adminRoute('users')));
  const act = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    setMsg(null);
    try {
      await fn();
      if (key === 'plan') syncedFor.current = null; // pick up the just-saved plan on the next reload
      setMsg(t('admin.user.saved'));
      await reload();
    } catch (e) {
      setMsg(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };

  if (!d)
    return (
      <>
        <a className="adm-back" href={routePath(adminRoute('users'))} onClick={(e) => (e.preventDefault(), back())}><ArrowLeft aria-hidden="true" /> {t('admin.user.back')}</a>
        {error ? <p className="signin-error" role="alert">{error}</p> : <p className="muted" aria-busy="true">{t('admin.loading')}</p>}
      </>
    );

  const eventText = (e: AdminEvent) => {
    const x = e.data as Record<string, string | number | boolean>;
    if (e.type === 'solve') return t(x.found ? 'admin.event.solveFound' : 'admin.event.solveMiss', { set: String(x.setId), ch: String(x.challengeId) });
    if (e.type === 'sync') return t(x.ok ? 'admin.event.syncOk' : 'admin.event.syncFail', { what: String(x.what), error: String(x.error ?? '') });
    if (e.type === 'ea_error') return t('admin.event.throttle');
    return t('admin.event.eaDay', { day: String(x.day), n: Number(x.count) });
  };
  const evCols: Column<AdminEvent>[] = [
    { key: 'at', label: t('admin.event.when'), render: (e) => <time dateTime={new Date(e.at).toISOString()} title={new Date(e.at).toLocaleString()}>{ago(e.at)}</time> },
    { key: 'what', label: t('admin.event.what'), render: eventText },
    { key: 'persona', label: t('admin.event.account'), hideSm: true, render: (e) => d.accounts.find((a) => a.personaId === e.personaId)?.personaName ?? e.personaId ?? '—' },
  ];

  return (
    <>
      <a className="adm-back" href={routePath(adminRoute('users'))} onClick={(e) => (e.preventDefault(), back())}><ArrowLeft aria-hidden="true" /> {t('admin.user.back')}</a>
      <section className="adm-card">
        <header className="adm-head">
          <div>
            <h2>{d.user.email || d.user.id} {d.user.admin && <span className="adm-badge">{t('admin.user.admin')}</span>}</h2>
            <small className="muted">
              {d.user.id}{' '}
              <button type="button" className="ghost" aria-label={t('admin.user.copyId')} onClick={() => void navigator.clipboard.writeText(d.user.id)}><Copy aria-hidden="true" /></button>
            </small>
          </div>
          <PlanBadge plan={d.plan} />
        </header>
        <dl className="adm-dl">
          <dt>{t('admin.users.col.joined')}</dt><dd>{new Date(d.user.createdAt).toLocaleString()}</dd>
          <dt>{t('admin.users.col.seen')}</dt><dd>{ago(d.user.lastSeenAt)}</dd>
        </dl>
      </section>

      <section className="adm-card">
        <h2>{t('admin.user.planTitle')}</h2>
        <div className="adm-actions">
          <label>{t('admin.users.col.plan')}{' '}
            <select value={tier} onChange={(e) => setTier(e.target.value as 'free' | 'premium')}>
              <option value="free">{t('admin.plan.free')}</option>
              <option value="premium">{t('admin.plan.premium')}</option>
            </select>
          </label>
          {tier === 'premium' && (
            <label>{t('admin.plan.until')}{' '}<input type="date" value={until} onChange={(e) => setUntil(e.target.value)} /></label>
          )}
          <button type="button" className="solve-sm" disabled={!!busy} onClick={() => void act('plan', () => api.adminPlan(id, tier, tier === 'premium' ? untilEndOfDay(until) : null))}>
            {t('admin.user.savePlan')}
          </button>
        </div>
        {d.plan.quota ? (
          <p>
            {t('admin.user.quota', { used: d.plan.quota.used, limit: d.plan.quota.limit })}
            {d.plan.quota.resetsAt && ` · ${t('admin.user.resets', { time: new Date(d.plan.quota.resetsAt).toLocaleString() })}`}{' '}
            <button type="button" className="ghost wide" disabled={!!busy || d.plan.quota.used === 0} onClick={() => void act('quota', () => api.adminQuotaReset(id))}>
              {t('admin.user.resetQuota')}
            </button>
          </p>
        ) : (
          <p className="muted">{t('admin.user.unlimited')}</p>
        )}
        {msg && <p role="status" className="muted">{msg}</p>}
      </section>

      <section className="adm-grid2">
        {d.accounts.length === 0 && d.missing.length === 0 && <p className="muted">{t('admin.user.noAccounts')}</p>}
        {d.accounts.map((a) => (
          <AccountCard key={a.personaId} acc={a} latest={d.latestExtension} onChanged={() => void reload()} extra={
            <>
              <dt>{t('admin.account.linked')}</dt><dd>{new Date(a.linkedAt).toLocaleDateString()}</dd>
              {a.previousUserId && (<><dt>{t('admin.account.previous')}</dt><dd>{a.previousUserId}</dd></>)}
            </>
          } />
        ))}
        {d.missing.map((pid) => <p key={pid} className="muted">{t('admin.user.missing', { id: pid })}</p>)}
      </section>

      <section className="adm-card">
        <BarChart title={t('admin.user.solves30')} days={d.solves.days} series={[
          { label: t('admin.charts.found'), values: d.solves.found, tone: 'go' },
          { label: t('admin.charts.notFound'), values: d.solves.notFound, tone: 'muted' },
        ]} />
      </section>

      <section>
        <h2>{t('admin.user.events')}</h2>
        {ev.error && <p className="signin-error" role="alert">{ev.error}</p>}
        <DataTable caption={t('admin.user.events')} columns={evCols} rows={ev.data?.rows ?? null} rowKey={(e) => e.id}
          page={ev.data?.page ?? 1} total={ev.data?.total ?? 0} pageSize={ev.data?.pageSize ?? 25} onPage={setEvPage}
          empty={t('admin.user.noEvents')} loading={!ev.data} />
      </section>
    </>
  );
}
