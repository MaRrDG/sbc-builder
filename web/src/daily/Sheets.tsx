// Bottom sheets of the Daily page: one modal shell (native <dialog>: focus trap, Esc, inert page)
// with the "How to play" and "Stats" bodies.
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';
import type { DailyStats } from '../api';
import { useI18n } from '../i18n';
import { GLYPH } from './Grid';

export function Sheet({ open, title, onClose, children }: { open: boolean; title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="dg-sheet"
      aria-modal="true"
      aria-labelledby={titleId}
      onClose={onClose}
      // a click on the backdrop (the dialog box itself, outside the panel) closes it
      onClick={(e) => e.target === e.currentTarget && ref.current?.close()}
    >
      {open && (
        <div className="dg-sheet-in">
          <div className="dg-sheet-head">
            <h2 id={titleId}>{title}</h2>
            <button type="button" className="dg-icon-btn" aria-label={t('daily.close')} onClick={() => ref.current?.close()}>
              <X weight="bold" aria-hidden="true" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function HowTo() {
  const { t } = useI18n();
  // the leading glyph of each tile line is drawn as a sample tile instead
  const rest = (text: string) => text.replace(/^[✓≈✕]\s*/, '');
  const lines = { hit: t('daily.how.hit'), near: t('daily.how.near'), miss: t('daily.how.miss') };
  return (
    <div className="dg-how">
      <p>{t('daily.how.goal')}</p>
      <p>{t('daily.how.tiles')}</p>
      <ul className="dg-how-tiles">
        {(['hit', 'near', 'miss'] as const).map((s) => (
          <li key={s}>
            <span className={`dg-sample is-${s}`} aria-hidden="true">
              {GLYPH[s]}
            </span>
            <span>{rest(lines[s])}</span>
          </li>
        ))}
      </ul>
      <p>{t('daily.how.silhouette')}</p>
      <p>{t('daily.how.reset')}</p>
      <p>{t('daily.how.practice')}</p>
      <p>{t('daily.how.points')}</p>
      <p className="dg-how-src">{t('daily.how.source')}</p>
    </div>
  );
}

interface StatsProps {
  stats: DailyStats | null;
  signedIn: boolean;
  /** today's winning guess count, highlighted in the distribution */
  today: number | null;
  points: { added: number; streak: number } | null;
}

export function StatsBody({ stats, signedIn, today, points }: StatsProps) {
  const { t } = useI18n();
  const s = stats ?? { played: 0, won: 0, current: 0, best: 0, dist: [0, 0, 0, 0, 0], next: { target: 7, points: 1 } };
  const pct = s.played ? Math.round((s.won / s.played) * 100) : 0;
  const top = Math.max(1, ...s.dist);
  const nums: [string, number][] = [
    [t('daily.stats.played'), s.played],
    [t('daily.stats.winPct'), pct],
    [t('daily.stats.current'), s.current],
    [t('daily.stats.best'), s.best],
  ];
  return (
    <div className="dg-stats">
      {points && points.added > 0 && (
        <p className="dg-points" role="status">
          <span className="dg-burst" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ '--a': `${i * 45}deg` } as CSSProperties} />
            ))}
          </span>
          {t('daily.points.won', { count: points.added, streak: points.streak })}
        </p>
      )}
      <dl className="dg-nums">
        {nums.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      <h3>{t('daily.stats.dist')}</h3>
      <ol className="dg-dist">
        {s.dist.map((n, i) => (
          <li key={i} className={today === i + 1 ? 'today' : undefined}>
            <span className="dg-dist-k">{i + 1}</span>
            <span className="dg-dist-t">
              <span className="dg-dist-bar" style={{ width: `${(n / top) * 100}%` }}>
                {n}
              </span>
            </span>
          </li>
        ))}
      </ol>
      {signedIn && s.next.points > 0 && <p className="dg-next">{t('daily.stats.next', { points: s.next.points, target: s.next.target })}</p>}
    </div>
  );
}
