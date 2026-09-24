// Settings card: which plan this user is on, the weekly solves left and what Premium adds.
import { Crown } from '@phosphor-icons/react';
import type { PlanInfo } from '../api';
import { useI18n } from '../i18n';
import { untilText } from '../repeat';

export function PlanCard({ plan, now }: { plan: PlanInfo | null; now: number }) {
  const { t } = useI18n();
  if (!plan) return null;
  const q = plan.quota;
  return (
    <section className="settings-card plan-card">
      <h2>
        {plan.tier === 'premium' && <Crown weight="fill" aria-hidden="true" />} {plan.tier === 'premium' ? t('plan.premium') : t('plan.free')}
      </h2>
      {q ? (
        <>
          <p className="ea-count">
            <b>{q.limit - q.used}</b> / {q.limit}
          </p>
          <span className="req-bar ea-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, ((q.limit - q.used) / q.limit) * 100)}%` }} />
          </span>
          <p className="muted">
            {q.resetsAt ? t('plan.resetsIn', { until: untilText(t, q.resetsAt, now) }) : t('plan.windowIdle')}
          </p>
          <p className="muted">{t('plan.howFree', { limit: q.limit })}</p>
          <p>
            <b>{t('plan.premiumAdds')}</b> {t('plan.premiumList')} <em>{t('plan.soon')}</em>
          </p>
        </>
      ) : (
        <p className="muted">
          {t('plan.unlimited')}
          {plan.premiumUntil ? ` · ${t('plan.until', { date: new Date(plan.premiumUntil).toLocaleDateString() })}` : ''}
        </p>
      )}
    </section>
  );
}
