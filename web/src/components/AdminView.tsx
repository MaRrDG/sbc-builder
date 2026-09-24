// Admin dashboard: users, their EA accounts, data freshness, EA usage and a manual sync for everyone.
// The server enforces admin rights; this screen is only linked for admins.
import { useCallback, useEffect, useState } from 'react';
import { ArrowsClockwise, CheckCircle, Circle, Clock, ShieldCheck, WarningCircle } from '@phosphor-icons/react';
import { api, type AdminAccount, type AdminStats, type AdminSyncResult } from '../api';
import { useAgo, useI18n } from '../i18n';
import { errorText } from '../messages';
import { untilText } from '../repeat';

type What = 'club' | 'sbc' | 'all';

export function AdminView() {
  const { t } = useI18n();
  const ago = useAgo();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<AdminSyncResult[] | null>(null);
  const [draftUntil, setDraftUntil] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      setStats(await api.adminStats());
      setError(null);
    } catch (e) {
      setError(errorText(e, t));
    }
  }, [t]);

  useEffect(() => {
    void load();
    const id = setInterval(() => !document.hidden && void load(), 15000);
    return () => clearInterval(id);
  }, [load]);

  const sync = async (what: What, personaIds?: number[]) => {
    const key = personaIds ? `${what}:${personaIds.join(',')}` : what;
    setBusy(key);
    try {
      const r = await api.adminSync(what, personaIds);
      setResults(r.results);
      await load();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };

  const trust = async (personaId: number, trusted: boolean) => {
    setBusy(`trust:${personaId}`);
    try {
      await api.adminTrust(personaId, trusted);
      await load();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };

  const changePlan = async (userId: string, tier: 'free' | 'premium', until: string) => {
    setBusy(`plan-${userId}`);
    try {
      await api.adminPlan(userId, tier, tier === 'premium' && until ? new Date(`${until}T23:59:59`).toISOString() : null);
      await load();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };

  const resetQuota = async (userId: string) => {
    setBusy(`quota-${userId}`);
    try {
      await api.adminQuotaReset(userId);
      await load();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(null);
    }
  };

  if (!stats)
    return (
      <section className="admin-page">
        <h1>{t('admin.title')}</h1>
        {error ? <p className="signin-error" role="alert">{error}</p> : <p className="muted" aria-busy="true">{t('admin.loading')}</p>}
      </section>
    );

  const u = stats.users;
  const a = stats.accounts;
  const names = new Map([...stats.userList.flatMap((x) => x.personas), ...stats.unlinked].map((p) => [p.personaId, p.personaName]));
  const counts = results && {
    queued: results.filter((r) => r.outcome === 'queued').length,
    deferred: results.filter((r) => r.outcome === 'deferred').length,
    skipped: results.filter((r) => r.outcome === 'skipped').length,
  };
  const versions = Object.entries(a.versions).sort((x, y) => y[1] - x[1]);

  const row = (p: AdminAccount) => (
    <AccountRow key={p.personaId} acc={p} latest={stats.latestExtension} busy={busy} onSync={sync} onTrust={trust} />
  );

  return (
    <section className="admin-page">
      <header className="page-head">
        <div>
          <h1>{t('admin.title')}</h1>
          <p className="muted">{t('admin.lede', { time: ago(stats.at) })}</p>
        </div>
        <button type="button" className="ghost wide admin-refresh" onClick={() => void load()}>
          <ArrowsClockwise weight="bold" aria-hidden="true" /> {t('admin.refresh')}
        </button>
      </header>
      {error && <p className="signin-error" role="alert">{error}</p>}

      <div className="admin-kpis">
        <Kpi label={t('admin.kpi.users')} value={u.total} sub={t('admin.kpi.usersSub', { n: u.new7d, p: u.withPersona })} />
        <Kpi label={t('admin.kpi.active')} value={u.active24h} sub={t('admin.kpi.activeSub', { n: u.active7d })} />
        <Kpi label={t('admin.kpi.accounts')} value={a.total} sub={t('admin.kpi.accountsSub', { c: a.client, l: a.legacy, u: a.total - a.linked })} />
        <Kpi label={t('admin.kpi.online')} value={a.online} sub={t('admin.kpi.onlineSub')} />
        <Kpi label={t('admin.kpi.ea')} value={stats.ea.today} sub={t('admin.kpi.eaSub', { p: a.paused, l: a.atLimit })} />
        <Kpi label={t('admin.kpi.stale')} value={Math.max(a.clubStale, a.sbcStale)} sub={t('admin.kpi.staleSub', { c: a.clubStale, s: a.sbcStale, f: a.failing })} />
      </div>

      <div className="admin-grid">
        <section className="settings-card">
          <h2>{t('admin.sync.title')}</h2>
          <p className="muted">{t('admin.sync.lede')}</p>
          <div className="admin-actions">
            <button type="button" className="solve-sm" disabled={!!busy} onClick={() => void sync('all')}>
              {busy === 'all' ? t('admin.sync.running') : t('admin.sync.all')}
            </button>
            <button type="button" className="ghost wide" disabled={!!busy} onClick={() => void sync('club')}>
              {t('admin.sync.club')}
            </button>
            <button type="button" className="ghost wide" disabled={!!busy} onClick={() => void sync('sbc')}>
              {t('admin.sync.sbc')}
            </button>
          </div>
          {counts && (
            <div role="status" className="admin-results">
              <p>{t('admin.sync.summary', counts)}</p>
              {results!.some((r) => r.outcome === 'skipped') && (
                <ul className="ea-list">
                  {results!.flatMap((r) =>
                    r.outcome === 'skipped' ? (
                      <li key={r.personaId}>
                        <span>{names.get(r.personaId) ?? r.personaId}</span>
                        <small>{t(`err.${r.code}`, r.params)}</small>
                      </li>
                    ) : [],
                  )}
                </ul>
              )}
            </div>
          )}
        </section>

        <section className="settings-card">
          <h2>{t('admin.data.title')}</h2>
          <ul className="ea-list">
            <li><span>{t('admin.data.sets')}</span><b>{stats.db.sets}</b></li>
            <li><span>{t('admin.data.challenges')}</span><b>{stats.db.challenges}</b></li>
            <li><span>{t('admin.data.bricks')}</span><b>{stats.db.brickReports}</b></li>
            <li><span>{t('admin.data.trusted')}</span><b>{stats.db.trusted}</b></li>
            <li><span>{t('admin.data.drop')}</span><b>{ago(stats.lastDrop)}</b></li>
          </ul>
          <h2 className="admin-sub">{t('admin.versions.title', { v: stats.latestExtension })}</h2>
          <ul className="ea-list">
            {versions.map(([v, n]) => (
              <li key={v}>
                <span>
                  {v === '?' ? t('admin.versions.unknown') : v}
                  {v !== stats.latestExtension && v !== '?' && <small> · {t('admin.versions.old')}</small>}
                </span>
                <b>{n}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <h2 className="admin-heading">{t('admin.users.title', { count: stats.userList.length })}</h2>
      <ul className="admin-users">
        {stats.userList.map((usr) => (
          <li key={usr.id} className="settings-card admin-user">
            <div className="admin-user-head">
              <b>{usr.email || usr.id}</b>
              <small className="muted">{t('admin.users.seen', { seen: ago(usr.lastSeenAt), joined: new Date(usr.createdAt).toLocaleDateString() })}</small>
            </div>
            <div className="admin-plan">
              <label>
                {t('admin.plan.label')}{' '}
                <select
                  value={usr.planSet}
                  disabled={busy === `plan-${usr.id}`}
                  onChange={(e) => void changePlan(usr.id, e.target.value as 'free' | 'premium', '')}
                >
                  <option value="free">Free</option>
                  <option value="premium">Premium</option>
                </select>
              </label>
              {usr.planSet === 'premium' &&
                (() => {
                  const saved = usr.plan.premiumUntil ? new Date(usr.plan.premiumUntil).toISOString().slice(0, 10) : '';
                  const value = draftUntil[usr.id] ?? saved;
                  return (
                    <label>
                      {t('admin.plan.until')}{' '}
                      <input
                        type="date"
                        value={value}
                        disabled={busy === `plan-${usr.id}`}
                        onChange={(e) => setDraftUntil((prev) => ({ ...prev, [usr.id]: e.target.value }))}
                        onBlur={(e) => {
                          if (e.target.value && e.target.value !== saved) void changePlan(usr.id, 'premium', e.target.value);
                        }}
                      />
                    </label>
                  );
                })()}
              <span className="muted">
                {usr.plan.quota
                  ? usr.plan.quota.resetsAt
                    ? t('admin.plan.quota', { used: usr.plan.quota.used, limit: usr.plan.quota.limit, reset: untilText(t, usr.plan.quota.resetsAt) })
                    : t('admin.plan.quotaIdle', { used: usr.plan.quota.used, limit: usr.plan.quota.limit })
                  : t('admin.plan.unlimited')}
              </span>
              {usr.plan.quota && usr.plan.quota.used > 0 && (
                <button type="button" className="ghost" disabled={busy === `quota-${usr.id}`} onClick={() => void resetQuota(usr.id)}>
                  {t('admin.plan.reset')}
                </button>
              )}
            </div>
            {usr.personas.length ? <ul className="admin-accounts">{usr.personas.map(row)}</ul> : <p className="muted">{t('admin.users.noAccount')}</p>}
          </li>
        ))}
      </ul>

      {stats.unlinked.length > 0 && (
        <>
          <h2 className="admin-heading">{t('admin.unlinked.title', { count: stats.unlinked.length })}</h2>
          <p className="muted">{t('admin.unlinked.lede')}</p>
          <div className="settings-card">
            <ul className="admin-accounts">{stats.unlinked.map(row)}</ul>
          </div>
        </>
      )}
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="admin-kpi">
      <span>{label}</span>
      <b>{value}</b>
      <small>{sub}</small>
    </div>
  );
}

function AccountRow({
  acc, latest, busy, onSync, onTrust,
}: {
  acc: AdminAccount;
  latest: string;
  busy: string | null;
  onSync: (what: What, ids: number[]) => void;
  onTrust: (personaId: number, trusted: boolean) => void;
}) {
  const { t } = useI18n();
  const ago = useAgo();
  const fresh = (at: number | null, stale: boolean, label: string) => (
    <span className={`admin-fresh${stale ? ' stale' : ''}`}>
      {stale ? <WarningCircle weight="bold" aria-hidden="true" /> : <CheckCircle weight="bold" aria-hidden="true" />}
      {label} {at ? ago(at) : t('time.never')}
      <span className="sr-only">{stale ? t('admin.acc.stale') : t('admin.acc.fresh')}</span>
    </span>
  );
  const key = `all:${acc.personaId}`;
  return (
    <li className="admin-account">
      <div className="admin-account-id">
        <b>
          {acc.personaName}
          {acc.trusted && (
            <span className="admin-trusted" title={t('admin.acc.trustedHint')}>
              <ShieldCheck weight="fill" aria-hidden="true" /> {t('admin.acc.trusted')}
            </span>
          )}
        </b>
        <small className="muted">
          {acc.clubName} · {acc.mode === 'client' ? t('admin.acc.client') : t('admin.acc.legacy')} · {t('admin.acc.ext', { v: acc.extVersion ?? '?' })}
          {acc.extVersion && acc.extVersion !== latest && ` (${t('admin.versions.old')})`}
        </small>
      </div>
      <div className="admin-account-state">
        <span className={`admin-online${acc.online ? ' on' : ''}`}>
          <Circle weight={acc.online ? 'fill' : 'bold'} aria-hidden="true" /> {acc.online ? t('top.live') : t('top.offline')}
        </span>
        {fresh(acc.clubAt, acc.clubStale, t('admin.acc.club', { n: acc.players }))}
        {fresh(acc.sbcAt, acc.sbcStale, t('admin.acc.sbc'))}
        <span>{t('admin.acc.ea', { n: acc.ea.today, limit: acc.ea.limit, c: acc.clubSyncs.used, cl: acc.clubSyncs.limit })}</span>
        {acc.running && <span><ArrowsClockwise weight="bold" aria-hidden="true" /> {t('admin.acc.running', { what: acc.running })}</span>}
        {acc.forced && <span><Clock weight="bold" aria-hidden="true" /> {t('admin.acc.forced')}</span>}
        {acc.ea.pausedUntil && <span className="admin-bad"><WarningCircle weight="bold" aria-hidden="true" /> {t('admin.acc.paused')}</span>}
        {acc.error && <span className="admin-bad"><WarningCircle weight="bold" aria-hidden="true" /> {acc.error}</span>}
      </div>
      <div className="admin-row-actions">
        <button
          type="button"
          className={`ghost wide admin-row-sync${acc.trusted ? ' on' : ''}`}
          disabled={!!busy}
          aria-pressed={acc.trusted}
          title={t('admin.acc.trustedHint')}
          onClick={() => onTrust(acc.personaId, !acc.trusted)}
        >
          <ShieldCheck weight={acc.trusted ? 'fill' : 'bold'} aria-hidden="true" /> {acc.trusted ? t('admin.acc.untrust') : t('admin.acc.trust')}
        </button>
        <button type="button" className="ghost wide admin-row-sync" disabled={!!busy} onClick={() => onSync('all', [acc.personaId])}>
          <ArrowsClockwise weight="bold" aria-hidden="true" /> {busy === key ? t('admin.sync.running') : t('admin.acc.sync')}
        </button>
      </div>
    </li>
  );
}
