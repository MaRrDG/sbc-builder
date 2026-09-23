// Landing hero: a pitch in perspective with real card art. Cards float above their spots and land
// as you scroll (CSS scroll-driven animation; on load where unsupported), requirements tick as they do.
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { Check } from '@phosphor-icons/react';
import { Card } from '../components/Card';
import { useI18n } from '../i18n';
import { DEMO_META, DEMO_SQUAD } from './demo';
import { useTilt } from './motion';

// where each DEMO_SQUAD card stands, in % of the pitch (attack at the top, as in the web app)
const SPOTS: [number, number][] = [[50, 13], [83, 25], [17, 25], [33, 47], [67, 47], [50, 68], [50, 88]];
const REQS = ['req1', 'req2', 'req3'] as const;

const PitchLines = () => (
  <svg className="lp-lines" viewBox="0 0 100 130" preserveAspectRatio="none" aria-hidden="true">
    <rect x="3" y="3" width="94" height="124" />
    <line x1="3" y1="65" x2="97" y2="65" />
    <circle cx="50" cy="65" r="11" />
    <rect x="25" y="3" width="50" height="18" />
    <rect x="25" y="109" width="50" height="18" />
  </svg>
);

export function Hero({ cta }: { cta: ReactNode }) {
  const { t } = useI18n();
  const stage = useRef<HTMLDivElement>(null);
  useTilt(stage);
  return (
    <section className="lp-hero" aria-labelledby="lp-hero-title">
      <div className="lp-hero-copy">
        <p className="lp-kicker">{t('landing.hero.kicker')}</p>
        <h1 id="lp-hero-title">{t('landing.hero.title')}</h1>
        <p className="lp-lede">{t('landing.hero.lede')}</p>
        <div className="lp-actions">
          {cta}
          <a className="lp-link" href="#how">
            {t('landing.hero.how')}
          </a>
        </div>
      </div>

      <div className="lp-stage" ref={stage} role="img" aria-label={t('landing.hero.stage')}>
        <div className="lp-tilt">
          <div className="lp-pitch">
            <PitchLines />
            {DEMO_SQUAD.map((p, i) => (
              <div key={p.id} className="lp-spot" style={{ left: `${SPOTS[i][0]}%`, top: `${SPOTS[i][1]}%`, '--i': i } as CSSProperties}>
                <span className="lp-shadow" />
                <div className="lp-stand">
                  <div className="lp-float">
                    <Card player={p} meta={DEMO_META} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <ul className="lp-reqs">
          {REQS.map((k, i) => (
            <li key={k} style={{ '--i': i } as CSSProperties}>
              <Check className="lp-tick" weight="bold" />
              {t(`landing.hero.${k}`)}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
