import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { useI18n } from '../i18n';

/** Page numbers to show: first, last, and a window around the current page. */
function pages(current: number, count: number): (number | '…')[] {
  const keep = [...new Set([1, current - 1, current, current + 1, count])].filter((p) => p >= 1 && p <= count).sort((a, b) => a - b);
  const out: (number | '…')[] = [];
  for (const p of keep) {
    const prev = out[out.length - 1];
    // an ellipsis would hide a single page: show that page instead
    if (typeof prev === 'number' && p - prev === 2) out.push(prev + 1);
    else if (typeof prev === 'number' && p - prev > 2) out.push('…');
    out.push(p);
  }
  return out;
}

interface Props {
  page: number; // 1-based
  total: number; // items
  perPage: number;
  onPage: (page: number) => void;
  label: string;
}

export function Pager({ page, total, perPage, onPage, label }: Props) {
  const { t } = useI18n();
  const count = Math.max(1, Math.ceil(total / perPage));
  if (count <= 1) return null;
  const from = (page - 1) * perPage + 1;
  const to = Math.min(total, page * perPage);
  return (
    <nav className="pager" aria-label={label}>
      <span className="pager-range">
        {t('pager.range', { from, to, total })}
      </span>
      <button type="button" className="icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label={t('pager.prev')}>
        <CaretLeft weight="bold" />
      </button>
      {pages(page, count).map((p, i) =>
        p === '…' ? (
          <span key={`gap${i}`} className="pager-gap">…</span>
        ) : (
          <button key={p} type="button" className="pager-num" aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>
            {p}
          </button>
        ),
      )}
      <button type="button" className="icon" disabled={page >= count} onClick={() => onPage(page + 1)} aria-label={t('pager.next')}>
        <CaretRight weight="bold" />
      </button>
    </nav>
  );
}

/** Clamp a page after the list shrank (filter, search, items removed). */
export const clampPage = (page: number, total: number, perPage: number) => Math.min(page, Math.max(1, Math.ceil(total / perPage)));
