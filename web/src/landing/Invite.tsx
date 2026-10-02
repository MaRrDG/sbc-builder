// "Bring a mate": the invite program as a pack opening. When the stage scrolls in, a gold pack
// tears open and walks out a reward card (7 days of Premium), and a +1 point drops into the
// inviter's counter. Spending points is shown as the web app's own SBC tiles: points in, Premium out.
// One orchestrated moment, played once; reduced motion shows the opened pack at once.
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Crown, Gift } from '@phosphor-icons/react';
import { useI18n } from '../i18n';
import { useInView } from './motion';

const GOLD_BG = '/landing/items/images/backgrounds/itemBGs/929f3299-a61e-4ff1-abda-7663f1c835db/cards_bg_e_1_0_3.png';
const STEPS = ['s1', 's2', 's3'] as const;
const OFFERS = [
  { days: 7, price: 2 },
  { days: 14, price: 3 },
  { days: 30, price: 5 },
] as const;
const MAX_PRICE = 5;
const i = (n: number) => ({ '--i': n }) as CSSProperties;

export function Invite({ cta }: { cta: ReactNode }) {
  const { t } = useI18n();
  const stage = useRef<HTMLDivElement>(null);
  const live = useInView(stage);
  // opened in a background tab: useInView never fires there, so show the opened pack instead of a closed one
  const [hidden] = useState(() => document.visibilityState === 'hidden');
  return (
    <section id="invite" className="lp-section lp-invite" aria-labelledby="lp-invite-title">
      <div className="lp-invite-grid">
        <div className="lp-invite-copy">
          <h2 id="lp-invite-title" className="lp-h2">{t('landing.invite.title')}</h2>
          <p className="lp-invite-lede">{t('landing.invite.lede')}</p>
          <ol className="lp-invite-steps">
            {STEPS.map((k, n) => (
              <li key={k}>
                <span className="lp-step-n" aria-hidden="true">{n + 1}</span>
                <span>
                  <b>{t(`landing.invite.${k}.title`)}</b>
                  {t(`landing.invite.${k}.body`)}
                </span>
              </li>
            ))}
          </ol>
          {cta}
        </div>

        <div ref={stage} className={`lp-pack-stage${live ? ' is-live' : hidden ? ' is-open' : ''}`} aria-hidden="true">
          <div className="lp-pack-rays" />
          <div className="lp-pack">
            <span className="lp-pack-top" />
            <span className="lp-pack-body">
              <img src="/brand/icon-green.svg" alt="" width="44" height="44" />
            </span>
          </div>
          <div className="lp-reward" style={{ backgroundImage: `url(${GOLD_BG})` }}>
            <span className="lp-reward-ovr">7</span>
            <span className="lp-reward-pos">{t('landing.invite.card.days')}</span>
            <Crown className="lp-reward-face" weight="fill" />
            <span className="lp-reward-name">Premium</span>
            <span className="lp-reward-sub">{t('landing.invite.card.for')}</span>
          </div>
          <div className="lp-pts">
            <span className="lp-pts-drop">+1</span>
            <span className="lp-pts-label">{t('landing.invite.points')}</span>
            <span className="lp-pts-num">
              <span>0</span>
              <span>1</span>
            </span>
          </div>
        </div>
      </div>

      <div className="lp-xchg">
        <h3 className="lp-xchg-title">{t('landing.invite.spend')}</h3>
        <ul className="lp-xchg-list">
          {OFFERS.map((o, n) => (
            <li key={o.days} className="lp-sbc" style={i(n)}>
              <span className="lp-sbc-head">
                <b>{t('landing.invite.offer', { count: o.days })}</b>
                <Crown weight="fill" aria-hidden="true" />
              </span>
              <span className="lp-sbc-req">{t('landing.invite.req', { count: o.price })}</span>
              <span className="lp-sbc-pips" aria-hidden="true">
                {Array.from({ length: MAX_PRICE }, (_, k) => (
                  <i key={k} className={k < o.price ? 'on' : undefined} />
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="lp-xchg-gift">
          <Gift weight="fill" aria-hidden="true" />
          {t('landing.invite.gift')}
        </p>
      </div>
    </section>
  );
}
