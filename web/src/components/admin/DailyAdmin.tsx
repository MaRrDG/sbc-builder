// Daily: per-day stats (answer, KPIs, guess distribution, most tried players, signed-in games) and the
// full leaderboard with a "clear username" action. Day and view live in the URL (?day=N&view=leaderboard).
import { useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { api, type AdminDailyDay, type AdminDailyLbRow } from '../../api';
import { useI18n } from '../../i18n';
import { errorText } from '../../messages';
import { adminRoute, routePath } from '../../route';
import { Card } from '../Card';
import { toCardPlayer } from '../../daily/MysteryCard';
import type { AdminProps } from './AdminLayout';
import { BarChart } from './BarChart';
import { DataTable, type Column } from './DataTable';
import { KpiCard } from './KpiCard';
import { getQuery, setQuery, shortDay } from './format';
import { useLoad } from './useLoad';

const PAGE = 25;
type Game = AdminDailyDay['games'][number];

export function DailyAdmin({ route, navigate }: AdminProps) {
  const { t } = useI18n();
  const q = getQuery(route.query);
  const view = q.view === 'leaderboard' ? 'leaderboard' : 'day';
  const day = q.day && /^\d+$/.test(q.day) ? Number(q.day) : null;
  const go = (patch: Record<string, string | number | null>) =>
    navigate(adminRoute('daily', { query: setQuery(route.query, patch) }), true);
  return (
    <>
      <div className="adm-toolbar">
        <div className="adm-range adm-daily-views" role="group" aria-label={t('admin.tab.daily')}>
          <button type="button" className="ghost" aria-pressed={view === 'day'} onClick={() => go({ view: null })}>{t('admin.daily.viewDay')}</button>
          <button type="button" className="ghost" aria-pressed={view === 'leaderboard'} onClick={() => go({ view: 'leaderboard' })}>{t('admin.daily.viewLb')}</button>
        </div>
      </div>
      {view === 'day' ? <DayView day={day} onDay={(d) => go({ day: d })} navigate={navigate} /> : <LeaderboardView navigate={navigate} />}
    </>
  );
}

function DayView({ day, onDay, navigate }: { day: number | null; onDay: (d: number) => void; navigate: AdminProps['navigate'] }) {
  const { t, lang } = useI18n();
  const { data: d, error } = useLoad(() => api.adminDaily(day), [day]);
  const { data: meta } = useLoad(() => api.meta(), []);
  const [page, setPage] = useState(1);
  const [shownDay, setShownDay] = useState(d?.day);
  if (d && d.day !== shownDay) (setShownDay(d.day), setPage(1)); // a new day starts on the first page

  if (!d) return error ? <p className="signin-error" role="alert">{error}</p> : <p className="muted" aria-busy="true">{t('admin.loading')}</p>;
  const s = d.summary;
  const days = [...d.days].sort((a, b) => a.day - b.day);
  const at = days.findIndex((x) => x.day === d.day);
  const prev = at > 0 ? days[at - 1] : null;
  const next = at >= 0 && at < days.length - 1 ? days[at + 1] : null;
  const empty = s.finished === 0 && d.games.length === 0;

  const userRoute = (g: Game) => adminRoute('user', { userId: g.userId });
  const result = (g: Game) =>
    g.won ? t('admin.daily.resultWon', { n: g.used }) : g.finishedAt ? t('admin.daily.resultLost') : t('admin.daily.resultPlaying');
  const columns: Column<Game>[] = [
    { key: 'user', label: t('admin.daily.user'), primary: true, render: (g) => g.username ?? (g.email || g.userId) },
    { key: 'guesses', label: t('admin.daily.guesses'), render: (g) => g.guesses.map((x) => x.name).join(' → ') || '—' },
    { key: 'result', label: t('admin.daily.result'), render: result },
    { key: 'finishedAt', label: t('admin.daily.finishedAt'), render: (g) => (g.finishedAt ? new Date(g.finishedAt).toLocaleString() : '—') },
  ];

  return (
    <>
      {error && <p className="signin-error" role="alert">{error}</p>}
      <nav className="adm-daily-nav" aria-label={t('admin.daily.viewDay')}>
        <button type="button" className="ghost" disabled={!prev} onClick={() => prev && onDay(prev.day)}>
          <CaretLeft aria-hidden="true" /> {prev ? t('admin.daily.day', { n: prev.day }) : ''}
        </button>
        <label>
          <span className="sr-only">{t('admin.daily.viewDay')}</span>
          <select value={d.day} onChange={(e) => onDay(Number(e.target.value))}>
            {[...days].reverse().map((x) => (
              <option key={x.day} value={x.day}>{t('admin.daily.day', { n: x.day })} · {shortDay(x.date, lang)}</option>
            ))}
          </select>
        </label>
        <button type="button" className="ghost" disabled={!next} onClick={() => next && onDay(next.day)}>
          {next ? t('admin.daily.day', { n: next.day }) : ''} <CaretRight aria-hidden="true" />
        </button>
      </nav>

      <div className="adm-daily-top">
        <section className="adm-card adm-daily-answer">
          <h2>{t('admin.daily.answer')}</h2>
          {d.answer && meta ? (
            <div role="img" aria-label={`${d.answer.name}, ${d.answer.rating} ${d.answer.position}`}>
              <Card player={toCardPlayer(d.answer)} meta={meta} size="sm" />
            </div>
          ) : (
            <p className="muted">{d.answer ? `${d.answer.name}, ${d.answer.rating} ${d.answer.position}` : '—'}</p>
          )}
        </section>
        <div className="adm-kpis">
          <KpiCard label={t('admin.daily.finished')} value={s.finished} />
          <KpiCard label={t('admin.daily.won')} value={s.won} />
          <KpiCard label={t('admin.daily.winPct')} value={`${s.winPct}%`} />
          <KpiCard label={t('admin.daily.signedIn')} value={s.signedIn.finished} sub={`${t('admin.daily.won')} ${s.signedIn.won}`} />
          <KpiCard label={t('admin.daily.anon')} value={s.anon.finished} sub={`${t('admin.daily.won')} ${s.anon.won}`} />
        </div>
      </div>

      {empty ? (
        <p className="adm-empty adm-card">{t('admin.daily.empty')}</p>
      ) : (
        <>
          <div className="adm-grid2">
            <section className="adm-card">
              <BarChart
                title={t('admin.daily.dist')}
                days={s.dist.map((_, i) => String(i + 1))}
                series={[{ label: t('admin.daily.won'), values: s.dist, tone: 'ink' }]}
                xLabel={(x) => x}
                xTitle={t('admin.daily.guesses')}
              />
            </section>
            <section className="adm-card">
              <h2>{t('admin.daily.mostTried')}</h2>
              {d.topGuessed.length === 0 ? (
                <p className="muted">—</p>
              ) : (
                <ul className="adm-list">
                  {d.topGuessed.map((p) => <li key={p.id}><span>{p.name}</span><b>{p.count}</b></li>)}
                </ul>
              )}
            </section>
          </div>
          <section className="adm-section">
            <h2>{t('admin.daily.games')}</h2>
            <DataTable
              caption={t('admin.daily.games')}
              columns={columns}
              rows={d.games.slice((page - 1) * PAGE, page * PAGE)}
              rowKey={(g) => g.userId}
              rowHref={(g) => routePath(userRoute(g))}
              onRowOpen={(g) => navigate(userRoute(g))}
              page={page}
              total={d.games.length}
              pageSize={PAGE}
              onPage={setPage}
              empty={t('admin.daily.empty')}
              loading={false}
            />
          </section>
        </>
      )}
    </>
  );
}

function LeaderboardView({ navigate }: { navigate: AdminProps['navigate'] }) {
  const { t } = useI18n();
  const { data, error, reload } = useLoad(() => api.adminDailyLeaderboard(), []);
  const [page, setPage] = useState(1);
  const [armed, setArmed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rowErr, setRowErr] = useState<string | null>(null);

  const clear = async (r: AdminDailyLbRow) => {
    if (armed !== r.userId) return setArmed(r.userId);
    setBusy(true);
    setRowErr(null);
    try {
      await api.adminDailyClearUsername(r.userId);
      setArmed(null);
      await reload();
    } catch (x) {
      setRowErr(errorText(x, t));
    } finally {
      setBusy(false);
    }
  };

  const userRoute = (r: AdminDailyLbRow) => adminRoute('user', { userId: r.userId });
  const columns: Column<AdminDailyLbRow>[] = [
    { key: 'rank', label: t('daily.lb.rank'), num: true, render: (r) => r.rank },
    { key: 'username', label: t('admin.daily.user'), render: (r) => r.username ?? <span className="muted">—</span> },
    { key: 'email', label: t('admin.users.col.email'), primary: true, render: (r) => r.email || r.userId },
    { key: 'wins', label: t('daily.lb.wins'), num: true, render: (r) => r.wins },
    { key: 'played', label: t('admin.daily.finished'), num: true, render: (r) => r.played },
    { key: 'winPct', label: t('admin.daily.winPct'), num: true, render: (r) => `${r.winPct}%` },
    { key: 'avg', label: t('daily.lb.avg'), num: true, render: (r) => (r.avgGuesses === null ? '—' : r.avgGuesses.toFixed(2)) },
    { key: 'streak', label: t('daily.lb.streak'), num: true, render: (r) => r.streak },
    { key: 'hidden', label: '', render: (r) => (r.hidden ? <span className="adm-badge">{t('admin.daily.hidden')}</span> : null) },
    {
      key: 'actions', label: '', render: (r) =>
        r.username === null ? null : (
          <button type="button" className="ghost adm-daily-clear" disabled={busy} onBlur={() => armed === r.userId && setArmed(null)} onClick={() => void clear(r)}>
            {armed === r.userId ? t('admin.daily.clearConfirm') : t('admin.daily.clear')}
          </button>
        ),
    },
  ];

  const rows = data?.rows ?? null;
  return (
    <>
      {(error || rowErr) && <p className="signin-error" role="alert">{error ?? rowErr}</p>}
      <DataTable
        caption={t('admin.daily.viewLb')}
        columns={columns}
        rows={rows ? rows.slice((page - 1) * PAGE, page * PAGE) : null}
        rowKey={(r) => r.userId}
        rowHref={(r) => routePath(userRoute(r))}
        onRowOpen={(r) => navigate(userRoute(r))}
        page={page}
        total={rows?.length ?? 0}
        pageSize={PAGE}
        onPage={setPage}
        empty={t('daily.lb.empty')}
        loading={!data}
      />
    </>
  );
}
