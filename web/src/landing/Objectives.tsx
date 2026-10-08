// "Objectives" (Premium): three objective rows tick one after another, then a flat pitch lights up
// the players that cover them, each lit card carrying its objective's icon (the link is never colour
// alone). The demo squad's real cards don't fit France / Eredivisie, so the lit players are blank
// cards on the same gold art instead of made-up players. Everything is visible by default; `is-in`
// only replays the motion once the demo scrolls in (reduced motion: the final state only).
import { useRef, type CSSProperties } from 'react';
import { Check, Crown, HandPointing, SoccerBall, UsersThree } from '@phosphor-icons/react';
import { useI18n } from '../i18n';
import { DEMO_META } from './demo';
import { useInView } from './motion';

// i18n: landing.obj.card.<key>
const CARDS = [
  { icon: SoccerBall, key: 'score' },
  { icon: UsersThree, key: 'xi' },
  { icon: HandPointing, key: 'assist' },
] as const;

// 4-3-3, attack at the top as in the web app (x, y in % of the field). `hit` = index into CARDS.
const SPOTS: { pos: string; x: number; y: number; hit?: number }[] = [
  { pos: 'ST', x: 50, y: 12, hit: 2 },
  { pos: 'LW', x: 17, y: 20, hit: 0 },
  { pos: 'RW', x: 83, y: 20 },
  { pos: 'CM', x: 28, y: 46 },
  { pos: 'CM', x: 50, y: 52 },
  { pos: 'CM', x: 72, y: 46, hit: 1 },
  { pos: 'LB', x: 13, y: 72 },
  { pos: 'CB', x: 37, y: 77 },
  { pos: 'CB', x: 63, y: 77 },
  { pos: 'RB', x: 87, y: 72 },
  { pos: 'GK', x: 50, y: 93 },
];

const CARD_BG = `${DEMO_META.contentBase}/items/images/backgrounds/itemBGs/${DEMO_META.rarities[0].guid}/cards_bg_e_1_0_3.png`;

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
          {CARDS.map(({ icon: Icon, key }, n) => (
            <li key={key} style={{ '--i': n } as CSSProperties}>
              <Icon className="lp-obj-icon" weight="bold" />
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
          {SPOTS.map(({ pos, x, y, hit }, n) => {
            const Icon = hit === undefined ? null : CARDS[hit].icon;
            return (
              <div key={n} className="lp-obj-spot" style={{ left: `${x}%`, top: `${y}%`, '--i': hit ?? 0 } as CSSProperties}>
                <span className="lp-obj-dot">{pos}</span>
                {Icon && (
                  <span className="lp-obj-hit">
                    <img src={CARD_BG} alt="" loading="lazy" decoding="async" />
                    <b>{pos}</b>
                    <Icon className="lp-obj-hit-icon" weight="bold" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="sr-only">{t('landing.obj.demoAlt')}</p>
    </section>
  );
}
