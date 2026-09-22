import { CheckCircle, Infinity as InfinityIcon, ArrowsClockwise } from '@phosphor-icons/react';
import type { SbcSet } from '../api';
import { repeatOf, untilText } from '../repeat';

/** Progress of a set as the web app shows it: x/y, ∞ ×n, or n/limit per refresh window. */
export function SetBadge({ set, now }: { set: SbcSet; now: number }) {
  const r = repeatOf(set, now);
  if (r.kind === 'unlimited')
    return (
      <span className="set-progress" title={`Repeatable without limit. Done ${r.done} time${r.done === 1 ? '' : 's'}.`}>
        <InfinityIcon weight="bold" aria-label="Unlimited" />
        {r.done > 0 && <span>×{r.done}</span>}
      </span>
    );
  if (r.kind === 'limited') {
    const hours = Math.round((set.repeatRefreshInterval ?? 86400) / 3600);
    const per = hours === 24 ? 'a day' : `every ${hours}h`;
    return (
      <span
        className={`set-progress${r.available ? '' : ' spent'}`}
        title={`Can be done ${r.limit} times ${per}. ${r.available ? `${r.limit! - r.done} left.` : `Resets in ${untilText(r.resetAt!, now)}.`}`}
      >
        <ArrowsClockwise weight="bold" aria-hidden="true" />
        {r.done}/{r.limit}
      </span>
    );
  }
  if (!r.available)
    return (
      <span className="set-progress">
        <CheckCircle weight="fill" aria-label="completed" />
      </span>
    );
  return <span className="set-progress">{r.done}/{r.limit}</span>;
}

/** One line under the set title explaining how often it can still be done. */
export function repeatLine(set: SbcSet, now: number): string | null {
  const r = repeatOf(set, now);
  if (r.kind === 'unlimited') return `Repeatable without limit · done ${r.done} time${r.done === 1 ? '' : 's'}`;
  if (r.kind === 'limited') {
    const hours = Math.round((set.repeatRefreshInterval ?? 86400) / 3600);
    const per = hours === 24 ? 'today' : `in this ${hours}h window`;
    return r.available
      ? `Repeatable ${r.limit}× · ${r.done}/${r.limit} done ${per}`
      : `Limit reached (${r.limit}/${r.limit} ${per}) · available again in ${untilText(r.resetAt!, now)}`;
  }
  return null;
}
