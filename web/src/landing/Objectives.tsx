// "Objectives" (Premium): three objective rows tick one after another, then the demo squad's real cards
// light up where they cover one (Ronaldo scores for Portugal, Lamine Yamal and Pau Cubarsí are the two LALIGA
// starters, Kelly assists for England). Each row and its players carry the same number, so the link is never
// colour alone; the other cards (Messi, Dybala, Carnesecchi) meet no row and stay dimmed. Everything is visible by default; `is-in` only replays the motion once the
// demo scrolls in (reduced motion: the final state only).
import { useRef, type CSSProperties } from 'react';
import { Check, Crown } from '@phosphor-icons/react';
import { Card } from '../components/Card';
import { useI18n } from '../i18n';
import { DEMO_META, DEMO_SQUAD } from './demo';
import { useInView } from './motion';

// i18n: landing.obj.card.<key>; `players` = indexes into DEMO_SQUAD of the cards that cover it (and only they:
// no dimmed card may match a row's nation / league / position)
const ROWS: { key: 'score' | 'xi' | 'assist'; players: number[] }[] = [
  { key: 'score', players: [0] }, // Ronaldo, Portugal (ST)
  { key: 'xi', players: [1, 5] }, // Lamine Yamal + Pau Cubarsí, LALIGA EA SPORTS
  { key: 'assist', players: [2] }, // Kelly, England (LM / LW)
];

// where each DEMO_SQUAD card stands (ST, RW, LW, CAM, CAM, CB, GK), in % of a flat pitch, attack at the top
const SPOTS: [number, number][] = [[50, 15], [82, 25], [18, 25], [35, 47], [65, 47], [50, 67], [50, 89]];

export function Objectives() {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  return (
    <section id="objectives" className="lp-section lp-obj" aria-labelledby="lp-obj-title">
      <div className="lp-obj-copy">
        <p className="lp-obj-badge">
          <Crown weight="fill" aria-hidden="true" />
          {t('landing.obj.badge')}
        </p>
        <h2 id="lp-obj-title" className="lp-h2">{t('landing.obj.title')}</h2>
        <p className="lp-lede">{t('landing.obj.lede')}</p>
      </div>
      <div ref={ref} className={`lp-obj-demo${seen ? ' is-in' : ''}`} aria-hidden="true">
        <ol className="lp-obj-rows">
          {ROWS.map(({ key }, n) => (
            <li key={key} style={{ '--i': n } as CSSProperties}>
              <span className="lp-obj-num">{n + 1}</span>
              <span>{t(`landing.obj.card.${key}`)}</span>
              <span className="lp-obj-box">
                <span className="lp-obj-tick">
                  <Check weight="bold" />
                </span>
              </span>
            </li>
          ))}
        </ol>
        <div className="lp-obj-pitch">
          {DEMO_SQUAD.map((p, n) => {
            const hit = ROWS.findIndex((r) => r.players.includes(n));
            return (
              <div
                key={p.id}
                className={`lp-obj-spot${hit < 0 ? '' : ' is-hit'}`}
                style={{ left: `${SPOTS[n][0]}%`, top: `${SPOTS[n][1]}%`, '--i': Math.max(hit, 0) } as CSSProperties}
              >
                <Card player={p} meta={DEMO_META} selected={hit >= 0} />
                {hit >= 0 && <span className="lp-obj-num">{hit + 1}</span>}
              </div>
            );
          })}
        </div>
      </div>
      <p className="sr-only">{t('landing.obj.demoAlt')}</p>
    </section>
  );
}
