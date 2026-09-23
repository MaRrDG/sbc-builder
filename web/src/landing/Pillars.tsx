// "Why FC Solver": three advantages, each a display statement with its proof drawn in the app's own
// UI (club cards, requirement rows, the one-way data path) straight on the page background.
// Everything is visible by default; `is-in` only replays a short motion once the proof scrolls in.
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { ArrowRight, CaretRight, Check, Coins, X } from '@phosphor-icons/react';
import { Card } from '../components/Card';
import { useI18n } from '../i18n';
import { DEMO_META, DEMO_SQUAD } from './demo';
import { useInView } from './motion';

const i = (n: number) => ({ '--i': n }) as CSSProperties;

function Advantage({ id, title, body, children }: { id: string; title: string; body: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  return (
    <article className={`lp-adv lp-adv-${id}`} aria-labelledby={`lp-adv-${id}`}>
      <h3 id={`lp-adv-${id}`} className="lp-say">{title}</h3>
      <p className="lp-adv-body">{body}</p>
      <div ref={ref} className={`lp-proof${seen ? ' is-in' : ''}`}>
        {children}
      </div>
    </article>
  );
}

// DEMO_SQUAD index + an example market price
const OWNED: [number, number][] = [[1, 61000], [2, 52500], [4, 44000], [5, 38500], [6, 21000]];

function ClubProof() {
  const { t, lang } = useI18n();
  const fmt = new Intl.NumberFormat(lang);
  return (
    <>
      <ul className="lp-owned-row">
        {OWNED.map(([idx, price], k) => (
          <li key={idx} style={i(k)}>
            <Card player={DEMO_SQUAD[idx]} meta={DEMO_META} />
            <span className="lp-price">
              <Coins weight="fill" aria-hidden="true" />
              <span className="sr-only">{t('landing.club.market')}: </span>
              <s>{fmt.format(price)}</s>
            </span>
            <span className="lp-owned">
              <Check weight="bold" aria-hidden="true" />
              {t('landing.club.owned')}
            </span>
          </li>
        ))}
      </ul>
      <p className="lp-note">{t('landing.club.example')}</p>
    </>
  );
}

function OptimalProof() {
  const { t, lang } = useI18n();
  const fmt = new Intl.NumberFormat(lang);
  return (
    <div className="lp-optimal">
      <ul className="lp-req-rows">
        {(['r1', 'r2', 'r3', 'r4'] as const).map((k, n) => (
          <li key={k} style={i(n)}>
            <Check className="lp-ok" weight="bold" aria-hidden="true" />
            <span>{t(`landing.optimal.${k}`)}</span>
            <span className="sr-only"> ({t('landing.met')})</span>
          </li>
        ))}
      </ul>
      <div className="lp-cost">
        <dl>
          <div className="lp-cost-first">
            <dt>{t('landing.optimal.first')}</dt>
            <dd><s>{fmt.format(41200)}</s></dd>
          </div>
          <div className="lp-cost-best">
            <dt>{t('landing.optimal.best')}</dt>
            <dd>
              <ArrowRight className="lp-cost-arrow" weight="bold" aria-hidden="true" />
              {fmt.format(12800)}
            </dd>
          </div>
        </dl>
        <p className="lp-note">{t('landing.optimal.unit')}</p>
      </div>
    </div>
  );
}

function SafeProof() {
  const { t } = useI18n();
  const nodes = ['webApp', 'ext', 'site'] as const; // i18n: landing.safe.<k> + landing.safe.<k>Sub
  return (
    <>
      <ol className="lp-path" aria-label={t('landing.safe.diagram')}>
        {nodes.map((k, n) => (
          <li key={k}>
            <i className="lp-node" aria-hidden="true" />
            <strong>{t(`landing.safe.${k}`)}</strong>
            <span>{t(`landing.safe.${k}Sub`)}</span>
            {n < nodes.length - 1 && <CaretRight className="lp-path-dir" weight="bold" aria-hidden="true" />}
          </li>
        ))}
      </ol>
      <div className="lp-never">
        <p>{t('landing.safe.never')}</p>
        <ul>
          {(['n1', 'n2', 'n3', 'n4'] as const).map((k) => (
            <li key={k}>
              <X weight="bold" aria-hidden="true" />
              {t(`landing.safe.${k}`)}
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

export function Pillars() {
  const { t } = useI18n();
  return (
    <section id="why" className="lp-section lp-why" aria-labelledby="lp-why-title">
      <h2 id="lp-why-title" className="lp-h2">{t('landing.why.title')}</h2>
      <Advantage id="club" title={t('landing.club.title')} body={t('landing.club.body')}><ClubProof /></Advantage>
      <Advantage id="optimal" title={t('landing.optimal.title')} body={t('landing.optimal.body')}><OptimalProof /></Advantage>
      <Advantage id="safe" title={t('landing.safe.title')} body={t('landing.safe.body')}><SafeProof /></Advantage>
    </section>
  );
}
