// Settings "Plan" section: the plan, the weekly solves left, and the ways to get (more) Premium.
import { ArrowSquareOut, Crown, LinkSimple, UserPlus } from '@phosphor-icons/react';
import type { PlanInfo } from '../api';
import { useI18n } from '../i18n';
import { untilText } from '../repeat';
import { DiscordIcon } from './DiscordIcon';
import { Row, Section } from './SettingsRows';

export function PlanCard({ plan, now, discordInvite, onInvite, onAccounts }: {
  plan: PlanInfo | null;
  now: number;
  discordInvite: string | null;
  onInvite: () => void;
  onAccounts: () => void;
}) {
  const { t } = useI18n();
  if (!plan) return null;
  const q = plan.quota;
  const left = q ? Math.max(0, q.limit - q.used) : 0;
  const lifetime = plan.tier === 'premium' && plan.source !== 'boost' && plan.premiumUntil === null;
  const name = plan.tier === 'premium' ? (lifetime ? t('plan.lifetime') : t('plan.premium')) : t('plan.free');

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
