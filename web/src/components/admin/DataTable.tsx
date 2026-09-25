// Admin table: sortable headers (aria-sort), row opens a detail, server-side paging.
// Under 860px rows become stacked cards (CSS), cells carry data-label.
import type { MouseEvent, ReactNode } from 'react';
import { CaretDown, CaretLeft, CaretRight, CaretUp } from '@phosphor-icons/react';
import { useI18n } from '../../i18n';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render: (r: T) => ReactNode;
  primary?: boolean; // holds the row link
  hideSm?: boolean;
  num?: boolean;
}

interface Props<T> {
  caption: string;
  columns: Column<T>[];
  rows: T[] | null;
  rowKey: (r: T) => string | number;
  rowHref?: (r: T) => string;
  onRowOpen?: (r: T) => void;
  sort?: { key: string; dir: 'asc' | 'desc' };
  onSort?: (key: string) => void;
  page: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  empty: string;
  loading: boolean;
}

export function DataTable<T>(p: Props<T>) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(p.total / p.pageSize));
  const from = p.total ? (p.page - 1) * p.pageSize + 1 : 0;
  const to = Math.min(p.page * p.pageSize, p.total);
  const open = (e: MouseEvent, r: T) => {
    if (!p.onRowOpen || e.metaKey || e.ctrlKey || e.button !== 0) return; // new tab keeps working
    e.preventDefault();
    p.onRowOpen(r);
  };
  return (
    <div className="adm-table-wrap" aria-busy={p.loading}>
      <table className="adm-table">
        <caption className="sr-only">{p.caption}</caption>
        <thead>
          <tr>
            {p.columns.map((c) => {
              const active = p.sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={[c.num && 'num', c.hideSm && 'hide-sm'].filter(Boolean).join(' ') || undefined}
                  aria-sort={active ? (p.sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                >
                  {c.sortable && p.onSort ? (
                    <button type="button" className="adm-sort" onClick={() => p.onSort!(c.key)}>
                      {c.label}
                      {active ? p.sort!.dir === 'asc' ? <CaretUp aria-hidden="true" /> : <CaretDown aria-hidden="true" /> : null}
                    </button>
                  ) : (
                    c.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {p.rows === null
            ? Array.from({ length: 6 }, (_, i) => (
                <tr key={i} className="adm-skel" aria-hidden="true">
                  {p.columns.map((c) => <td key={c.key} className={c.hideSm ? 'hide-sm' : undefined}><span /></td>)}
                </tr>
              ))
            : p.rows.map((r) => (
                <tr key={p.rowKey(r)} className={p.onRowOpen ? 'adm-row-link' : undefined} onClick={p.onRowOpen ? (e) => { if ((e.target as HTMLElement).closest('a,button,select,input')) return; p.onRowOpen!(r); } : undefined}>
                  {p.columns.map((c) => (
                    <td key={c.key} data-label={c.label} className={[c.num && 'num', c.hideSm && 'hide-sm', c.primary && 'primary'].filter(Boolean).join(' ') || undefined}>
                      {c.primary && p.rowHref ? <a href={p.rowHref(r)} onClick={(e) => open(e, r)}>{c.render(r)}</a> : c.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {p.rows && p.rows.length === 0 && <p className="adm-empty">{p.empty}</p>}
      <nav className="adm-pager" aria-label={t('admin.table.pages')}>
        <span className="muted" role="status">{t('admin.table.range', { from, to, total: p.total })}</span>
        <button type="button" className="ghost" disabled={p.page <= 1} onClick={() => p.onPage(p.page - 1)} aria-label={t('admin.table.prev')}>
          <CaretLeft aria-hidden="true" />
        </button>
        <span aria-current="page">{t('admin.table.page', { page: p.page, pages })}</span>
        <button type="button" className="ghost" disabled={p.page >= pages} onClick={() => p.onPage(p.page + 1)} aria-label={t('admin.table.next')}>
          <CaretRight aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}
