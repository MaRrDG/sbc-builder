// Settings "Plan" section: the plan, the weekly solves left, the subscription, and the ways to get (more) Premium.
import { useState } from 'react';
import { ArrowSquareOut, Crown, LinkSimple, UserPlus } from '@phosphor-icons/react';
import { api, type BillingState, type PlanInfo } from '../api';
import { errorText } from '../messages';
import { useI18n } from '../i18n';
import { untilText } from '../repeat';
import { DiscordIcon } from './DiscordIcon';
import { Row, Section } from './SettingsRows';

export function PlanCard({ plan, billing, onUpgrade, now, discordInvite, onInvite, onAccounts }: {
  plan: PlanInfo | null;
  billing: BillingState | null;
  onUpgrade: (() => void) | null; // null: billing off or nothing to buy

  now: number;
  discordInvite: string | null;
  onInvite: () => void;
  onAccounts: () => void;
}) {
  const { t } = useI18n();
  const [portalError, setPortalError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  if (!plan) return null;
  const q = plan.quota;
  const left = q ? Math.max(0, q.limit - q.used) : 0;
  const lifetime = (plan.source === 'admin' || plan.source === 'paid') && plan.premiumUntil === null;
  const date = (ms: number) => new Date(ms).toLocaleDateString();
  const name = plan.tier === 'premium' ? (lifetime ? t('plan.lifetime') : t('plan.premium')) : t('plan.free');

  // the portal link is made on demand; the tab opens first so the popup blocker lets it through
  const manage = async () => {
    setPortalError(null);
    setOpening(true);
    const tab = window.open('', '_blank');
    try {
      const { url } = await api.billingPortal();
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else window.location.href = url;
    } catch (e) {
      tab?.close();
      setPortalError(errorText(e, t));
    } finally {
      setOpening(false);
    }
  };
  const sub = billing && (billing.subscribed || billing.status !== 'canceled') ? billing : null;
  const subLine = !sub ? null
    : sub.status === 'past_due' ? t('billing.pastDue')
    : sub.cancelAt ? t('billing.endsOn', { date: date(sub.cancelAt) })
    : !sub.subscribed ? t('billing.ended', { date: date(sub.periodEnd) })
    : sub.interval === 'year' ? t('billing.renewsYearly', { date: date(sub.periodEnd) })
    : t('billing.renewsMonthly', { date: date(sub.periodEnd) });

  const invite = (
    <button type="button" className="ghost bordered" onClick={onInvite}>
      <UserPlus weight="bold" aria-hidden="true" /> {t('nav.invite')}
    </button>
  );

  return (
    <Section title={t('settings.section.plan')}>
      <div className="plan-sum">
        <p className="plan-name">
          {plan.tier === 'premium' && <Crown weight="fill" aria-hidden="true" />}
          <span>{name}</span>
          {plan.founder && <span className="founder-badge">{t('plan.founder')}</span>}
        </p>
        {subLine && <p className={sub?.status === 'past_due' ? 'plan-state plan-warn' : 'plan-state'}>{subLine}</p>}
        {q ? (
          <>
            <p className="plan-left">{t('quota.left', { count: left, limit: q.limit })}</p>
            <span className="req-bar plan-bar" aria-hidden="true">
              <span style={{ width: `${Math.min(100, (left / q.limit) * 100)}%` }} />
            </span>
            <p className="plan-note">
              {q.resetsAt ? t('plan.resetsIn', { until: untilText(t, q.resetsAt, now) }) : t('plan.windowIdle')} {t('plan.foundOnly')}
            </p>
          </>
        ) : (
          <>
            <p className="plan-note">{t('plan.unlimited')}</p>
            {plan.source !== 'boost' && plan.premiumUntil && (
              <p className="plan-state">{t('plan.untilLine', { date: new Date(plan.premiumUntil).toLocaleDateString() })}</p>
            )}
            {plan.source === 'boost' && plan.boost?.since && <p className="plan-state">{t('plan.boost')}</p>}
            {plan.source === 'boost' && plan.boost?.graceUntil && (
              <p className="plan-state">{t('plan.boostGrace', { until: untilText(t, plan.boost.graceUntil, now) })}</p>
            )}
          </>
        )}
      </div>
      {sub && (
        <Row title={t('billing.manageTitle')} hint={t('billing.manageHint')}>
          <button type="button" className="ghost bordered" disabled={opening} onClick={() => void manage()}>
            {t('billing.manage')} <ArrowSquareOut aria-hidden="true" />
            <span className="sr-only"> {t('nav.newTab')}</span>
          </button>
        </Row>
      )}
      {portalError && <p className="signin-error" role="alert">{portalError}</p>}
      {onUpgrade && (
        <Row title={t('billing.goTitle')} hint={t('billing.goHint')}>
          <button type="button" className="solve-sm" onClick={onUpgrade}>
            <Crown weight="fill" aria-hidden="true" /> {t('billing.goPremium')}
          </button>
        </Row>
      )}
      {q && (
        <>
          <Row title={t('plan.inviteTitle')} hint={t('plan.inviteText')}>{invite}</Row>
          <Row title={t('plan.boostTitle')} hint={t('plan.boostText')}>
            {discordInvite && (
              <a className="ghost bordered" href={discordInvite} target="_blank" rel="noopener noreferrer">
                <DiscordIcon /> {t('plan.discordServer')}
                <ArrowSquareOut aria-hidden="true" />
                <span className="sr-only"> {t('nav.newTab')}</span>
              </a>
            )}
            <button type="button" className="ghost bordered" onClick={onAccounts}>
              <LinkSimple weight="bold" aria-hidden="true" /> {t('plan.linkDiscord')}
            </button>
          </Row>
          <p className="plan-adds">
            {t('plan.premiumAdds')} {t('plan.premiumList')}
          </p>
        </>
      )}
      {!q && !lifetime && <Row title={t('plan.inviteTitle')} hint={t('plan.inviteMore')}>{invite}</Row>}
    </Section>
  );
}
