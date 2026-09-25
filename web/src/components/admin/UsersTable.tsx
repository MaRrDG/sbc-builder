// Users: server-side filter / sort / paging, all in the URL query (?q&plan&activity&ea&sort&dir&page).
import { useEffect, useState } from 'react';
import { Circle, Crown } from '@phosphor-icons/react';
import { api, type AdminUserRow, type PlanInfo } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { adminRoute, routePath } from '../../route';
import type { AdminProps } from './AdminLayout';
import { DataTable, type Column } from './DataTable';
import { getQuery, setQuery } from './format';
import { useLoad } from './useLoad';

export function PlanBadge({ plan }: { plan: PlanInfo }) {
  const { t } = useI18n();
  return plan.tier === 'premium' ? (
    <span className="adm-badge premium">
      <Crown aria-hidden="true" /> {t('admin.plan.premium')}
      {plan.premiumUntil && <small>· {new Date(plan.premiumUntil).toLocaleDateString()}</small>}
    </span>
  ) : (
    <span className="adm-badge">{t('admin.plan.free')}</span>
  );
}

const FILTERS = {
  plan: ['all', 'free', 'premium', 'expiring'],
  activity: ['all', '24h', '7d', 'inactive30'],
  ea: ['all', 'with', 'without', 'problem', 'outdated'],
} as const;

export function UsersTable({ route, navigate }: AdminProps) {
  const { t } = useI18n();
  const ago = useAgo();
  const q = getQuery(route.query);
  const go = (patch: Record<string, string | number | null>) =>
    navigate(adminRoute('users', { query: setQuery(route.query, patch) }), true);
  const { data, error } = useLoad(() => api.adminUsers(route.query), [route.query]);

  // search box: typed text is local, the URL follows 300 ms after typing stops
  const [text, setText] = useState(q.q ?? '');
  useEffect(() => setText(q.q ?? ''), [q.q]);
  useEffect(() => {
    if (text === (q.q ?? '')) return;
    const id = setTimeout(() => go({ q: text.trim() || null }), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const sort = { key: q.sort ?? 'lastSeen', dir: (q.dir as 'asc' | 'desc') ?? (q.sort === 'email' ? 'asc' : 'desc') };
  const onSort = (key: string) =>
    go({ sort: key === 'lastSeen' ? null : key, dir: sort.key === key ? (sort.dir === 'asc' ? 'desc' : 'asc') : key === 'email' ? 'asc' : 'desc' });

  const userRoute = (u: AdminUserRow) => adminRoute('user', { userId: u.id });
  const columns: Column<AdminUserRow>[] = [
    { key: 'email', label: t('admin.users.col.email'), sortable: true, primary: true, render: (u) => u.email || u.id },
    { key: 'plan', label: t('admin.users.col.plan'), render: (u) => <PlanBadge plan={u.plan} /> },
    { key: 'quota', label: t('admin.users.col.quota'), num: true, hideSm: true, render: (u) => (u.plan.quota ? `${u.plan.quota.used}/${u.plan.quota.limit}` : '—') },
    {
      key: 'accounts', label: t('admin.users.col.accounts'), render: (u) =>
        u.accounts === 0 ? <span className="muted">—</span> : (
          <span className="adm-dot">
            <Circle weight={u.online ? 'fill' : 'regular'} aria-hidden="true" />
            {t('admin.users.accounts', { count: u.accounts, n: u.accounts, online: u.online })}
          </span>
        ),
    },
    { key: 'solves7d', label: t('admin.users.col.solves'), sortable: true, num: true, hideSm: true, render: (u) => u.solves7d },
    { key: 'lastSeen', label: t('admin.users.col.seen'), sortable: true, render: (u) => ago(u.lastSeenAt) },
    { key: 'createdAt', label: t('admin.users.col.joined'), sortable: true, hideSm: true, render: (u) => new Date(u.createdAt).toLocaleDateString() },
  ];

  return (
    <>
      <div className="adm-toolbar" role="search">
        <label className="sr-only" htmlFor="adm-users-q">{t('admin.users.search')}</label>
        <input id="adm-users-q" type="search" placeholder={t('admin.users.search')} value={text} onChange={(e) => setText(e.target.value)} />
        {(Object.keys(FILTERS) as (keyof typeof FILTERS)[]).map((f) => (
          <label key={f}>
            <span className="sr-only">{t(`admin.users.filter.${f}`)}</span>
            <select value={q[f] ?? 'all'} onChange={(e) => go({ [f]: e.target.value })}>
              {FILTERS[f].map((v) => <option key={v} value={v}>{t(`admin.users.${f}.${v}`)}</option>)}
            </select>
          </label>
        ))}
        {route.query && <button type="button" className="ghost" onClick={() => navigate(adminRoute('users'), true)}>{t('admin.users.clear')}</button>}
      </div>
      {error && <p className="signin-error" role="alert">{error}</p>}
      <DataTable
        caption={t('admin.tab.users')}
        columns={columns}
        rows={data?.rows ?? null}
        rowKey={(u) => u.id}
        rowHref={(u) => routePath(userRoute(u))}
        onRowOpen={(u) => navigate(userRoute(u))}
        sort={sort}
        onSort={onSort}
        page={data?.page ?? 1}
        total={data?.total ?? 0}
        pageSize={data?.pageSize ?? 25}
        onPage={(p) => go({ page: p })}
        empty={t('admin.users.empty')}
        loading={!data}
      />
    </>
  );
}
