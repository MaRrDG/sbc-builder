import { CheckCircle, Infinity as InfinityIcon, ArrowsClockwise } from '@phosphor-icons/react';
import type { SbcSet } from '../api';
import { useI18n } from '../i18n';
import { repeatOf, untilText } from '../repeat';

type T = (key: string, params?: Record<string, string | number>) => string;

const perText = (set: SbcSet, t: T) => {
  const hours = Math.round((set.repeatRefreshInterval ?? 86400) / 3600);
  return hours === 24 ? t('repeat.perDay') : t('repeat.perHours', { h: hours });
};

/** Progress of a set as the web app shows it: x/y, ∞ ×n, or n/limit per refresh window. */
export function SetBadge({ set, now }: { set: SbcSet; now: number }) {
  const { t } = useI18n();
  const r = repeatOf(set, now);
  if (r.kind === 'unlimited')
    return (
      <span className="set-progress" title={t('repeat.unlimitedTitle', { count: r.done })}>
        <InfinityIcon weight="bold" aria-label={t('repeat.unlimited')} />
        {r.done > 0 && <span>×{r.done}</span>}
      </span>
    );
  if (r.kind === 'limited') {
    const title = r.available
      ? t('repeat.limitedLeft', { limit: r.limit!, per: perText(set, t), left: r.limit! - r.done })
      : t('repeat.limitedReset', { limit: r.limit!, per: perText(set, t), until: untilText(t, r.resetAt!, now) });
    return (
      <span className={`set-progress${r.available ? '' : ' spent'}`} title={title}>
        <ArrowsClockwise weight="bold" aria-hidden="true" />
        {r.done}/{r.limit}
      </span>
    );
  }
  if (!r.available)
    return (
      <span className="set-progress">
        <CheckCircle weight="fill" aria-label={t('repeat.completed')} />
      </span>
    );
  return <span className="set-progress">{r.done}/{r.limit}</span>;
}

/** One line under the set title explaining how often it can still be done. */
export function repeatLine(set: SbcSet, now: number, t: T): string | null {
  const r = repeatOf(set, now);
  if (r.kind === 'unlimited') return t('repeat.lineUnlimited', { count: r.done });
  if (r.kind === 'limited') {
    const hours = Math.round((set.repeatRefreshInterval ?? 86400) / 3600);
    const when = hours === 24 ? t('repeat.today') : t('repeat.inWindow', { h: hours });
    return r.available
      ? t('repeat.lineLimited', { limit: r.limit!, done: r.done, when })
      : t('repeat.lineSpent', { limit: r.limit!, when, until: untilText(t, r.resetAt!, now) });
  }
  return null;
}
