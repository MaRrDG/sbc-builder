// Next to the Solve button: weekly solves left on Free (with the rules one tap away), "unlimited" on Premium.
import { useState } from 'react';
import { Info } from '@phosphor-icons/react';
import type { PlanInfo } from '../api';
import { useI18n } from '../i18n';
import { untilText } from '../repeat';

export function QuotaMeter({ plan, now }: { plan: PlanInfo | null; now: number }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  if (!plan) return null;
  const q = plan.quota;
  if (!q) return <p className="quota-meter">{t('quota.premium')}</p>;
  const left = Math.max(0, q.limit - q.used);
  return (
    <div className={`quota-meter${left === 0 ? ' empty' : ''}`}>
      <p>
        <span role="status">{t('quota.left', { count: left, limit: q.limit })}</span>
        {q.resetsAt && <> · {t('quota.resets', { until: untilText(t, q.resetsAt, now) })}</>}
        <button type="button" className="icon" aria-expanded={open} aria-label={t('quota.what')} onClick={() => setOpen((v) => !v)}>
          <Info weight="bold" aria-hidden="true" />
        </button>
      </p>
      {open && <p className="quota-help muted">{t('plan.howFree', { limit: q.limit })} {t('plan.premiumAdds')} {t('plan.premiumList')}</p>}
    </div>
  );
}
