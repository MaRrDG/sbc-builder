// All EA accounts on this server (linked or not): filter / sort / page in the URL; unlinked rows expand in place.
import { useEffect, useRef, useState } from 'react';
import { Circle, ShieldCheck } from '@phosphor-icons/react';
import { api, type AdminAccountRow } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { adminRoute, routePath } from '../../route';
import { AccountCard } from './AccountCard';
import type { AdminProps } from './AdminLayout';
import { DataTable, type Column } from './DataTable';
import { getQuery, setQuery } from './format';
import { useLoad } from './useLoad';

const STATES = ['all', 'online', 'problem', 'outdated', 'unlinked', 'trusted'] as const;

export function AccountsTable({ route, navigate }: AdminProps) {
  const { t } = useI18n();
  const ago = useAgo();
  const q = getQuery(route.query);
  const go = (patch: Record<string, string | number | null>) => navigate(adminRoute('accounts', { query: setQuery(route.query, patch) }), true);
  const { data, error, reload } = useLoad(() => api.adminAccounts(route.query), [route.query], 30000);
  const [open, setOpen] = useState<number | null>(null);

  // latest URL query, for the debounced commit below (its timeout must not close over a stale query)
  const queryRef = useRef(route.query);
  useEffect(() => {
    queryRef.current = route.query;
  });

  // search box: typed text is local, the URL follows 300 ms after typing stops
  const [text, setText] = useState(q.q ?? '');
  useEffect(() => setText(q.q ?? ''), [q.q]);
  useEffect(() => {
    if (text === (q.q ?? '')) return;
    const id = setTimeout(() => navigate(adminRoute('accounts', { query: setQuery(queryRef.current, { q: text.trim() || null }) }), true), 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const sort = { key: q.sort ?? 'name', dir: (q.dir as 'asc' | 'desc') ?? 'asc' };
  const onSort = (key: string) => go({ sort: key === 'name' ? null : key, dir: sort.key === key && sort.dir === 'asc' ? 'desc' : 'asc' });
  const openRow = (a: AdminAccountRow) => (a.ownerId ? navigate(adminRoute('user', { userId: a.ownerId })) : setOpen(open === a.personaId ? null : a.personaId));

  const columns: Column<AdminAccountRow>[] = [
    { key: 'name', label: t('admin.accounts.col.persona'), sortable: true, primary: true, render: (a) => a.personaName },
    { key: 'club', label: t('admin.accounts.col.club'), hideSm: true, render: (a) => a.clubName },
    { key: 'owner', label: t('admin.accounts.col.owner'), render: (a) => a.ownerEmail ?? <span className="adm-badge">{t('admin.accounts.unlinked')}</span> },
    { key: 'mode', label: t('admin.account.mode'), hideSm: true, render: (a) => t(`admin.accounts.mode.${a.mode}`) },
    { key: 'ext', label: t('admin.account.ext'), hideSm: true, render: (a) => a.extVersion ?? '?' },
    { key: 'online', label: t('admin.accounts.col.state'), render: (a) => (
      <span className="adm-dot"><Circle weight={a.online ? 'fill' : 'regular'} aria-hidden="true" />{a.online ? t('admin.account.online') : t('admin.account.offline')}{a.error && <span className="adm-badge bad">{t('admin.accounts.error')}</span>}</span>
    ) },
    { key: 'clubAt', label: t('admin.account.club'), sortable: true, hideSm: true, render: (a) => ago(a.clubAt) },
    { key: 'sbcAt', label: t('admin.account.sbcs'), sortable: true, hideSm: true, render: (a) => ago(a.sbcAt) },
    { key: 'eaToday', label: t('admin.account.ea'), sortable: true, num: true, render: (a) => `${a.ea.today}/${a.ea.limit}` },
    { key: 'trusted', label: t('admin.accounts.col.trusted'), hideSm: true, render: (a) => (a.trusted ? <span className="adm-badge"><ShieldCheck aria-hidden="true" /> {t('admin.trusted')}</span> : '—') },
  ];

  const expanded = data?.rows.find((a) => a.personaId === open && !a.ownerId);
  useEffect(() => {
    if (expanded) document.getElementById(`acc-${expanded.personaId}`)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [expanded?.personaId]);

  return (
    <>
      <div className="adm-toolbar" role="search">
        <label className="sr-only" htmlFor="adm-acc-q">{t('admin.accounts.search')}</label>
        <input id="adm-acc-q" type="search" placeholder={t('admin.accounts.search')} value={text} onChange={(e) => setText(e.target.value)} />
        <label>
          <span className="sr-only">{t('admin.accounts.filter')}</span>
          <select value={q.state ?? 'all'} onChange={(e) => go({ state: e.target.value })}>
            {STATES.map((s) => <option key={s} value={s}>{t(`admin.accounts.state.${s}`)}</option>)}
          </select>
        </label>
        {route.query && <button type="button" className="ghost" onClick={() => navigate(adminRoute('accounts'), true)}>{t('admin.users.clear')}</button>}
      </div>
      {error && <p className="signin-error" role="alert">{error}</p>}
      <DataTable caption={t('admin.tab.accounts')} columns={columns} rows={data?.rows ?? null} rowKey={(a) => a.personaId}
        rowHref={(a) => (a.ownerId ? routePath(adminRoute('user', { userId: a.ownerId })) : `#acc-${a.personaId}`)}
        onRowOpen={openRow} sort={sort} onSort={onSort}
        page={data?.page ?? 1} total={data?.total ?? 0} pageSize={data?.pageSize ?? 25} onPage={(p) => go({ page: p })}
        empty={t('admin.accounts.empty')} loading={!data} />
      {expanded && data && (
        <div id={`acc-${expanded.personaId}`}>
          <AccountCard acc={expanded} latest={data.latestExtension} onChanged={() => void reload()} />
        </div>
      )}
    </>
  );
}
