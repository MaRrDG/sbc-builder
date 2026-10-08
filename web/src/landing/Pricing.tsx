// Free vs Premium. Display only until billing exists: the Premium button is disabled ("Coming soon").
import { useState, type ReactNode } from 'react';
import { Check, SoccerBall } from '@phosphor-icons/react';
import type { Route } from '../route';
import { useI18n } from '../i18n';
import { formatEur, proPrice, yearlySaving, FREE_WEEKLY_SOLVES, type Billing } from './pricing';
import { Backdrop } from './Backdrop';
import type { Founders } from './Founders';

interface Props {
  cta: ReactNode;
  founders: Founders | null;
  link: (r: Route, className: string, children: ReactNode) => ReactNode;
}

export function Pricing({ cta, founders, link }: Props) {
  const { t, lang } = useI18n();
  const [billing, setBilling] = useState<Billing>('yearly');
  const pro = proPrice(billing);
  const eur = (n: number) => formatEur(n, lang);
  const list = (items: string[], extra?: ReactNode) => (
    <ul className="lp-feats">
      {items.map((text) => (
        <li key={text}>
          <Check weight="bold" aria-hidden="true" /> {text}
        </li>
      ))}
      {extra}
    </ul>
  );
  // "Play {link}: …": the game's name is the link (a brand, so not translated)
  const [before, after = ''] = t('landing.price.free.daily').split('{link}');
  const daily = (
    <li className="lp-feat-daily">
      <SoccerBall weight="bold" aria-hidden="true" />
      <span>
        {before}
        {link({ view: 'daily', practice: false }, 'lp-link', 'FC Solver Daily')}
        {after}
      </span>
    </li>
  );
  return (
    <section id="pricing" className="lp-section" aria-labelledby="lp-price-title">
      <Backdrop zone="pricing" />
      <h2 id="lp-price-title" className="lp-h2">{t('landing.price.title')}</h2>

      <fieldset className="lp-toggle">
        <legend className="sr-only">{t('landing.price.period')}</legend>
        {(['monthly', 'yearly'] as const).map((b) => (
          <label key={b} className={billing === b ? 'on' : ''}>
            <input type="radio" name="billing" value={b} checked={billing === b} onChange={() => setBilling(b)} />
            {t(`landing.price.${b}`)}
          </label>
        ))}
        <span className="lp-save">{t('landing.price.save', { amount: eur(yearlySaving()) })}</span>
      </fieldset>

      <div className="lp-plans">
        <article className="lp-plan">
          <h3>{t('landing.price.free.name')}</h3>
          <p className="lp-amount">{eur(0)}</p>
          <p className="lp-billed">{t('landing.price.free.note')}</p>
          {list([t('landing.price.free.f1'), t('landing.price.free.f2'), t('landing.price.free.f3', { limit: FREE_WEEKLY_SOLVES }), t('landing.price.free.f4')], daily)}
          {cta}
        </article>
        <article className="lp-plan lp-plan-pro">
          {founders && <span className="lp-ribbon">{t('landing.founders.ribbon', { limit: founders.limit })}</span>}
          <h3>{t('landing.price.pro.name')}</h3>
          <p className="lp-amount">
            {eur(pro.perMonth)} <small>{t('landing.price.perMonth')}</small>
          </p>
          <p className="lp-billed">
            {billing === 'monthly' ? t('landing.price.pro.billedMonthly') : t('landing.price.pro.billedYearly', { amount: eur(pro.billed) })}
          </p>
          {list([t('landing.price.pro.f1'), t('landing.price.pro.f2'), t('landing.price.pro.f4'), t('landing.price.pro.f5'), t('landing.price.pro.f3')])}
          {founders && <p className="lp-founders-note">{t('landing.founders.planNote', { count: founders.left, limit: founders.limit })}</p>}
          <button type="button" className="lp-btn" disabled>
            {t('landing.price.pro.soon')}
          </button>
        </article>
      </div>
    </section>
  );
}
