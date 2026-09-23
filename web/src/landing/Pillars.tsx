// "Why FC Solver": one row per advantage, each with a small scene that plays when it scrolls in.
// Prices and values in the scenes are examples, labelled as such.
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, Check, Coins, X } from '@phosphor-icons/react';
import { Card } from '../components/Card';
import { useI18n } from '../i18n';
import { DEMO_META, DEMO_SQUAD } from './demo';
import { useInView } from './motion';

const i = (n: number) => ({ '--i': n }) as CSSProperties;

function Row({ n, title, body, children }: { n: number; title: string; body: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  return (
    <div ref={ref} className={`lp-row${seen ? ' is-in' : ''}`}>
      <div className={`lp-row-copy lp-reveal${seen ? ' is-in' : ''}`}>
        <span className="lp-num" aria-hidden="true">{String(n).padStart(2, '0')}</span>
        <h3>{title}</h3>
        <p>{body}</p>
      </div>
      <div className="lp-scene">{children}</div>
    </div>
  );
}

function ClubScene() {
  const { t, lang } = useI18n();
  const fmt = new Intl.NumberFormat(lang);
  const picks: [number, number][] = [[1, 61000], [5, 44500], [3, 38000]]; // DEMO_SQUAD index, example market price
  return (
    <div className="lp-club">
      <p className="lp-tag">{t('landing.club.example')}</p>
      <ul>
        {picks.map(([idx, price], k) => (
          <li key={idx} style={i(k)}>
            <Card player={DEMO_SQUAD[idx]} meta={DEMO_META} size="sm" />
            <span className="lp-price">
              <Coins weight="fill" aria-hidden="true" />
              <span className="sr-only">{t('landing.club.market')}: </span>
              <s>{fmt.format(price)}</s>
            </span>
            <span className="lp-owned">
              <Check weight="bold" aria-hidden="true" /> {t('landing.club.owned')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OptimalScene() {
  const { t, lang } = useI18n();
  const fmt = new Intl.NumberFormat(lang);
  return (
    <div className="lp-optimal">
      <p className="lp-tag">{t('landing.club.example')}</p>
      <ul className="lp-checks">
        {(['r1', 'r2', 'r3', 'r4'] as const).map((k, n) => (
          <li key={k} style={i(n)}>
            <Check className="lp-tick" weight="bold" aria-hidden="true" />
            <span>{t(`landing.optimal.${k}`)}</span>
            <span className="sr-only"> ({t('landing.met')})</span>
          </li>
        ))}
      </ul>
      <dl className="lp-values">
        <div className="lp-first">
          <dt>{t('landing.optimal.first')}</dt>
          <dd><s>{fmt.format(41200)}</s> <small>{t('landing.optimal.unit')}</small></dd>
        </div>
        <div className="lp-best">
          <dt>{t('landing.optimal.best')}</dt>
          <dd>{fmt.format(12800)} <small>{t('landing.optimal.unit')}</small></dd>
        </div>
      </dl>
    </div>
  );
}

function SafeScene() {
  const { t } = useI18n();
  const nodes = ['webApp', 'ext', 'site'] as const; // i18n: landing.safe.<k> + landing.safe.<k>Sub
  return (
    <div className="lp-safe">
      <ol className="lp-flow" aria-label={t('landing.safe.diagram')}>
        {nodes.map((k, n) => (
          <li key={k} style={i(n)}>
            <strong>{t(`landing.safe.${k}`)}</strong>
            <span>{t(`landing.safe.${k}Sub`)}</span>
            {n < nodes.length - 1 && <ArrowRight className="lp-arrow" weight="bold" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <p className="lp-tag">{t('landing.safe.never')}</p>
      <ul className="lp-never">
        {(['n1', 'n2', 'n3', 'n4'] as const).map((k, n) => (
          <li key={k} style={i(n)}>
            <X weight="bold" aria-hidden="true" /> {t(`landing.safe.${k}`)}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Pillars() {
  const { t } = useI18n();
  return (
    <section id="why" className="lp-section" aria-labelledby="lp-why-title">
      <p className="lp-kicker">{t('landing.why.kicker')}</p>
      <h2 id="lp-why-title" className="lp-h2">{t('landing.why.title')}</h2>
      <Row n={1} title={t('landing.club.title')} body={t('landing.club.body')}><ClubScene /></Row>
      <Row n={2} title={t('landing.optimal.title')} body={t('landing.optimal.body')}><OptimalScene /></Row>
      <Row n={3} title={t('landing.safe.title')} body={t('landing.safe.body')}><SafeScene /></Row>
    </section>
  );
}
