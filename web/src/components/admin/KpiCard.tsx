import type { ReactNode } from 'react';

interface Props { label: string; value: ReactNode; sub?: ReactNode; href?: string; onOpen?: () => void; tone?: 'bad' }

export function KpiCard({ label, value, sub, href, onOpen, tone }: Props) {
  const body = (
    <>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </>
  );
  const cls = `adm-kpi${tone ? ` ${tone}` : ''}`;
  return href && onOpen ? (
    <a className={cls} href={href} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); onOpen(); }}>{body}</a>
  ) : (
    <div className={cls}>{body}</div>
  );
}
