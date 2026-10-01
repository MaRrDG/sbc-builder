// A Premium screen for a Free user: the real UI with example data, blurred and inert, with the offer on top.
// Billing does not exist yet, so the buy button stays disabled and nothing navigates away.
import type { ReactNode } from 'react';
import { Crown } from '@phosphor-icons/react';
import { useI18n } from '../i18n';

export function PremiumPreview({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="premium-preview">
      <div className="premium-preview-demo" inert aria-hidden="true">
        {children}
      </div>
      <section className="premium-preview-card" aria-labelledby="premium-preview-title">
        <span className="premium-preview-badge">
          <Crown weight="fill" aria-hidden="true" /> {t('premium.badge')}
        </span>
        <h2 id="premium-preview-title">{title}</h2>
        <p>{body}</p>
        <button type="button" className="premium-preview-buy" disabled>
          {t('premium.buy')}
        </button>
        <p className="premium-preview-soon">{t('premium.soon')}</p>
      </section>
    </div>
  );
}
