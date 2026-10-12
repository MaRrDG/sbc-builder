// A Premium screen for a Free user: the real UI with example data, blurred and inert, with the offer on top.
// The buy button opens /dashboard/upgrade; while billing is off it stays disabled ("coming soon").
import type { ReactNode } from 'react';
import { Crown } from '@phosphor-icons/react';
import { useUpgrade } from '../billing/upgrade';
import { useI18n } from '../i18n';

export function PremiumPreview({ title, body, children }: { title: string; body: string; children: ReactNode }) {
  const { t } = useI18n();
  const upgrade = useUpgrade();
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
        <button type="button" className="premium-preview-buy" disabled={!upgrade} onClick={upgrade ?? undefined}>
          {upgrade ? t('billing.goPremium') : t('premium.buy')}
        </button>
        {!upgrade && <p className="premium-preview-soon">{t('premium.soon')}</p>}
      </section>
    </div>
  );
}
