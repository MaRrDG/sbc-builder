// Free vs Pro. Display only until billing exists: the Pro button is disabled ("Coming soon").
import { useState, type ReactNode } from 'react';
import { Check } from '@phosphor-icons/react';
import { useI18n } from '../i18n';
import { formatEur, proPrice, yearlySaving, type Billing } from './pricing';

export function Pricing({ cta }: { cta: ReactNode }) {
  const { t, lang } = useI18n();
  const [billing, setBilling] = useState<Billing>('yearly');
  const pro = proPrice(billing);
  const eur = (n: number) => formatEur(n, lang);
  const list = (items: string[]) => (
    <ul className="lp-feats">
      {items.map((text) => (
        <li key={text}>
          <Check weight="bold" aria-hidden="true" /> {text}
        </li>
      ))}
    </ul>
  );
  return (
    <section id="pricing" className="lp-section" aria-labelledby="lp-price-title">
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
          {list([t('landing.price.free.f1'), t('landing.price.free.f2'), t('landing.price.free.f3')])}
          {cta}
        </article>
        <article className="lp-plan lp-plan-pro">
          <h3>{t('landing.price.pro.name')}</h3>
          <p className="lp-amount">
            {eur(pro.perMonth)} <small>{t('landing.price.perMonth')}</small>
          </p>
          <p className="lp-billed">
            {billing === 'monthly' ? t('landing.price.pro.billedMonthly') : t('landing.price.pro.billedYearly', { amount: eur(pro.billed) })}
          </p>
          {list([t('landing.price.pro.f1'), t('landing.price.pro.f2')])}
          <button type="button" className="lp-btn" disabled>
            {t('landing.price.pro.soon')}
          </button>
        </article>
      </div>
    </section>
  );
}
