// "How it works": the three steps from nothing to a solved SBC.
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import type { Route } from '../route';
import { useInView } from './motion';

interface Props {
  link: (r: Route, className: string, children: ReactNode) => ReactNode;
}

export function Steps({ link }: Props) {
  const { t } = useI18n();
  const ref = useRef<HTMLOListElement>(null);
  const seen = useInView(ref);
  return (
    <section id="how" className="lp-section" aria-labelledby="lp-how-title">
      <p className="lp-kicker">{t('landing.how.kicker')}</p>
      <h2 id="lp-how-title" className="lp-h2">{t('landing.how.title')}</h2>
      <ol ref={ref} className={`lp-steps${seen ? ' is-in' : ''}`}>
        {(['s1', 's2', 's3'] as const).map((k, n) => (
          <li key={k} style={{ '--i': n } as CSSProperties}>
            <span className="lp-step-n" aria-hidden="true">{n + 1}</span>
            <h3>{t(`landing.how.${k}.title`)}</h3>
            <p>{t(`landing.how.${k}.body`)}</p>
            {k === 's1' && link({ view: 'setup' }, 'lp-link', t('landing.how.setup'))}
          </li>
        ))}
      </ol>
      <p className="lp-more">{link({ view: 'guide' }, 'lp-link', t('landing.how.more'))}</p>
    </section>
  );
}
