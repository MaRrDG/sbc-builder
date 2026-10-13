import type { ReactNode } from 'react';

interface Props { label: string; value: ReactNode; sub?: ReactNode; href?: string; onOpen?: () => void; tone?: 'bad'; title?: string }

export function KpiCard({ label, value, sub, href, onOpen, tone, title }: Props) {
  const body = (
    <>
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </>
  );
  const cls = `adm-kpi${tone ? ` ${tone}` : ''}`;
  return href && onOpen ? (
    <a className={cls} title={title} href={href} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); onOpen(); }}>{body}</a>
  ) : (
    <div className={cls} title={title}>{body}</div>
  );
}
