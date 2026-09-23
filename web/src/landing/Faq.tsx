// Short FAQ on native <details>, so it works without JS and with the keyboard.
import { CaretDown } from '@phosphor-icons/react';
import { useI18n } from '../i18n';
import { Backdrop } from './Backdrop';

const ITEMS = ['ban', 'data', 'ext', 'coins'] as const;

export function Faq() {
  const { t } = useI18n();
  return (
    <section id="faq" className="lp-section lp-faq" aria-labelledby="lp-faq-title">
      <Backdrop zone="end" />
      <h2 id="lp-faq-title" className="lp-h2">{t('landing.faq.title')}</h2>
      <div className="lp-faq-list">
        {ITEMS.map((k) => (
          <details key={k}>
            <summary>
              {t(`landing.faq.${k}.q`)}
              <CaretDown weight="bold" aria-hidden="true" />
            </summary>
            <p>{t(`landing.faq.${k}.a`)}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
