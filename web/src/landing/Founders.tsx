// Founding 50: the first users who link an EA account get Premium for life. The spots come from
// /api/founders; nothing shows while it loads, when it fails, or once every spot is taken.
import { useEffect, useState, type CSSProperties } from 'react';
import { useI18n } from '../i18n';

export interface Founders {
  limit: number;
  taken: number;
  left: number;
}

/** undefined while /api/founders loads, null when there is nothing to show. */
export function useFounders(): Founders | null | undefined {
  const [state, setState] = useState<Founders | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    fetch('/api/founders')
      .then((r) => (r.ok ? r.json() : null))
      .then((f: Founders | null) => {
        if (live) setState(f && Number.isInteger(f.left) && f.left > 0 ? f : null);
      })
      .catch(() => live && setState(null));
    return () => {
      live = false;
    };
  }, []);
  return state;
}

// what the board looks like before /api/founders answers: drawn invisibly so the hero keeps its height
// and nothing below it jumps when the real numbers arrive
const PLACEHOLDER: Founders = { limit: 50, taken: 0, left: 50 };

/** The hero block: one slot per spot, like empty card slots, the taken ones filled in. */
export function FoundersBoard({ founders }: { founders: Founders | undefined }) {
  if (!founders) return <div className="lp-founders-wait" aria-hidden="true"><FoundersBoard founders={PLACEHOLDER} /></div>;
  const { t } = useI18n();
  const { limit, taken, left } = founders;
  const n = (count: number) => ({ count, limit });
  return (
    <aside className="lp-founders" aria-labelledby="lp-founders-title">
      <div className="lp-founders-top">
        <h2 id="lp-founders-title">{t('landing.founders.title', { limit })}</h2>
        <span>{t('landing.founders.left', n(left))}</span>
      </div>
      <div className="lp-slots" role="img" aria-label={t('landing.founders.label', n(left))} style={{ '--cols': Math.min(25, Math.ceil(limit / 2)) } as CSSProperties}>
        {Array.from({ length: limit }, (_, k) => (
          <i key={k} className={k < taken ? 'taken' : ''} style={{ '--k': k } as CSSProperties} />
        ))}
      </div>
      <p>{t('landing.founders.body', { limit })}</p>
    </aside>
  );
}
