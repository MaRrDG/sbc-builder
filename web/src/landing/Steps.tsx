// "How it works": three plain steps next to one browser window that follows along. On wide screens the
// window is sticky and shows the step in focus; under 860px (and with reduced motion) every step
// carries its own small copy of the window, fixed on that step.
import { useRef, type CSSProperties, type ReactNode } from 'react';
import { Check, Lock, SlidersHorizontal } from '@phosphor-icons/react';
import { Card } from '../components/Card';
import { useI18n } from '../i18n';
import type { Route } from '../route';
import { DEMO_META, DEMO_SETS, DEMO_SQUAD } from './demo';
import { useActiveIndex, useInView } from './motion';

interface Props {
  link: (r: Route, className: string, children: ReactNode) => ReactNode;
}

const STEPS = ['s1', 's2', 's3'] as const;
const EA_URL = 'ea.com/ea-sports-fc/ultimate-team/web-app';
// flat pitch, attack at the top as in the web app (x, y in % of the field between header strip and corners)
const SPOTS: [number, number][] = [[50, 13], [84, 20], [16, 20], [30, 42], [70, 42], [50, 68], [50, 95]];
const REQS = ['req1', 'req2', 'req3'] as const;
const i = (n: number) => ({ '--i': n }) as CSSProperties;

/** The browser window. `step` picks the tab, address and pane; `live` lets the step's motion play. */
function Demo({ step, live }: { step: number; live: boolean }) {
  const { t } = useI18n();
  const on = (n: number) => (step === n ? ' on' : '');
  const ea = step === 1;
  return (
    <div className={`lp-win${live ? ' is-live' : ''}`} data-step={step}>
      <div className="lp-win-tabs">
        <span className={`lp-win-tab${ea ? ' on' : ''}`}>{t('landing.safe.webApp')}</span>
        <span className={`lp-win-tab${ea ? '' : ' on'}`}>
          <img src="/brand/icon-green.svg" alt="" width="14" height="14" />
          {t('landing.safe.site')}
        </span>
      </div>
      <div className="lp-win-bar">
        <span className="lp-win-url">
          <Lock weight="bold" />
          <span>{ea ? EA_URL : window.location.host}</span>
        </span>
        <span className="lp-win-ext">
          <img src="/brand/icon-green.svg" alt="" width="18" height="18" />
          <i className="lp-badge" />
        </span>
      </div>

      <div className="lp-win-view">
        {/* 1: the extension popup, status flips to connected */}
        <div className={`lp-pane lp-pane-ext${on(0)}`}>
          <img className="lp-pane-logo" src="/brand/logo-on-dark.svg" alt="" width="160" height="41" />
          <div className="lp-popup">
            <p className="lp-popup-head">
              <img src="/brand/icon-green.svg" alt="" width="20" height="20" />
              {t('landing.safe.site')}
            </p>
            <div className="lp-status">
              <p className="lp-status-off">
                <i />
                {t('landing.how.scene.off')}
              </p>
              <p className="lp-status-on">
                <Check weight="bold" />
                <span>
                  <b>{t('landing.how.scene.on')}</b>
                  <small>{t('landing.how.scene.onSub')}</small>
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* 2: the EA web app tab, the SBC list fills in while the club syncs */}
        <div className={`lp-pane lp-pane-ea${on(1)}`}>
          <p className="lp-ea-head">{t('sets.title')}</p>
          <ul className="lp-ea-sets">
            {DEMO_SETS.map((name, n) => (
              <li key={name} style={i(n)}>
                {name}
              </li>
            ))}
          </ul>
          <p className="lp-ea-head">{t('club.title')}</p>
          <ul className="lp-ea-club">
            {DEMO_SQUAD.slice(0, 5).map((p, n) => (
              <li key={p.id} style={i(n)}>
                <Card player={p} meta={DEMO_META} />
              </li>
            ))}
          </ul>
          <p className="lp-synced">
            <Check weight="bold" />
            {t('landing.how.scene.synced')}
          </p>
        </div>

        {/* 3: FC Solver, the squad on the pitch and every requirement met */}
        <div className={`lp-pane lp-pane-solve${on(2)}`}>
          <div className="lp-mini-pitch">
            <div className="lp-mini-head">
              <span>
                <b>{t('pitch.requirements')}</b>
                <span className="lp-mini-val"><i className="lp-mini-bar" />3/3</span>
              </span>
            </div>
            <div className="lp-mini-field">
              {DEMO_SQUAD.map((p, n) => (
                <div key={p.id} className="lp-mini-spot" style={{ left: `${SPOTS[n][0]}%`, top: `${SPOTS[n][1]}%`, '--i': n } as CSSProperties}>
                  <Card player={p} meta={DEMO_META} size="md" />
                </div>
              ))}
            </div>
            <span className="lp-mini-opt">
              <SlidersHorizontal weight="bold" />
              {t('pitch.options')}
            </span>
            <span className="lp-mini-solve">{t('pitch.solve')}</span>
          </div>
          <ul className="lp-mini-reqs">
            {REQS.map((k, n) => (
              <li key={k} style={i(n)}>
                <Check className="lp-ok" weight="bold" />
                {t(`landing.hero.${k}`)}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

/** One step's own window (narrow screens, reduced motion); plays once it scrolls in. */
function InlineDemo({ step }: { step: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  return (
    <div ref={ref} className="lp-demo-inline" aria-hidden="true">
      <Demo step={step} live={seen} />
    </div>
  );
}

export function Steps({ link }: Props) {
  const { t } = useI18n();
  const items = useRef<(HTMLLIElement | null)[]>([]);
  const active = useActiveIndex(items);
  const stage = useRef<HTMLDivElement>(null);
  const seen = useInView(stage);
  return (
    <section id="how" className="lp-section lp-how" aria-labelledby="lp-how-title">
      <h2 id="lp-how-title" className="lp-h2">{t('landing.how.title')}</h2>
      <div className="lp-how-grid">
        <ol className="lp-steps">
          {STEPS.map((k, n) => (
            <li key={k} ref={(el) => { items.current[n] = el; }} className={active === n ? 'is-on' : undefined}>
              <h3>
                <span className="lp-step-n" aria-hidden="true">{n + 1}</span>
                {t(`landing.how.${k}.title`)}
              </h3>
              <p>{t(`landing.how.${k}.body`)}</p>
              {k === 's1' && link({ view: 'setup' }, 'lp-link', t('landing.how.setup'))}
              <InlineDemo step={n} />
            </li>
          ))}
        </ol>
        <div ref={stage} className="lp-demo-sticky" aria-hidden="true">
          <Demo step={active} live={seen} />
        </div>
      </div>
      <p className="lp-more">{link({ view: 'guide' }, 'lp-link', t('landing.how.more'))}</p>
    </section>
  );
}
