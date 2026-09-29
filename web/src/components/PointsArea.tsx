// A points SBC ("Player SBC"): EA asks for a points total, not a squad. Shows the chosen cards in the
// pitch frame like the web app's Work Area, sorted the same way so they are easy to add there.
import { CheckCircle, Diamond, Prohibit, SealCheck } from '@phosphor-icons/react';
import type { Challenge, Meta, SolveResult } from '../api';
import { useI18n } from '../i18n';
import { Card } from './Card';
import { PitchCorners, SolveLoader } from './Pitch';

interface Props {
  meta: Meta;
  challenge: Challenge;
  result: SolveResult | null;
  solving: boolean;
  onSolve: (deep?: boolean) => void;
  onToggleOptions: () => void;
  lock: { title: string; text: string } | null;
  localOptions: boolean;
  selectedId: number | null;
  onPlayerClick: (playerId: number) => void;
  outOfSolves: boolean;
  /** players marked to keep out (⊘ badge) */
  marked: Set<number>;
}

export function PointsArea({ meta, challenge, result, solving, onSolve, onToggleOptions, lock, localOptions, selectedId, onPlayerClick, outOfSolves, marked }: Props) {
  const { t, lang } = useI18n();
  const n = (v: number) => v.toLocaleString(lang);
  const pts = result?.points;
  const target = pts?.target ?? Math.max(0, (challenge.scoreRequirement ?? 0) - (challenge.submittedScore ?? 0));
  const cards = solving ? [] : (pts?.cards ?? []);
  const total = solving ? 0 : (pts?.total ?? 0);
  const reached = !solving && !!pts && pts.total >= pts.target;
  // nothing missing (submitted >= required) but EA has not marked it COMPLETED yet: nothing to solve
  const shownLock = lock ?? (target === 0 ? { title: t('points.done'), text: t('points.doneText') } : null);

  return (
    <div className="pitch-wrap points-wrap">
      <div className="pitch-header points-header">
        <div className="points-top">
          <span className="hdr-label">{t('points.label')}</span>
          <span className="points-num">
            <b>{n(total)}</b> / {n(target)} <Diamond weight="bold" aria-hidden="true" />
          </span>
        </div>
        <div className="points-bar" role="progressbar" aria-label={t('points.label')} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(total, target)}>
          <span className={reached ? 'met' : ''} style={{ width: `${target ? Math.min(100, (total / target) * 100) : 0}%` }} />
        </div>
        {pts && !solving && (
          <p className="points-status">
            <span className={reached ? 'met' : 'unmet'}>
              {reached && <CheckCircle weight="fill" aria-hidden="true" />} {reached ? t('points.reached') : t('points.notReached')}
            </span>
            <span>{t('points.overshoot', { n: n(pts.overshoot) })}</span>
            <span>{t('points.cards', { count: cards.length })}</span>
          </p>
        )}
      </div>

      <div className="points-area">
        {cards.length === 0 && !solving && !shownLock && <p className="points-empty">{t('points.empty', { n: n(target), count: target })}</p>}
        <div className="points-grid">
          {cards.map((p, i) => (
            <div key={p.id} className="points-slot" style={{ ['--i' as string]: i }}>
              {marked.has(p.id) && (
                <span className="slot-marked" title={t('pitch.marked')}>
                  <Prohibit weight="bold" aria-label={t('pitch.marked')} />
                </span>
              )}
              <Card player={p} meta={meta} selected={p.id === selectedId} onClick={() => onPlayerClick(p.id)} />
              <span className="points-value">
                <Diamond weight="fill" aria-hidden="true" /> {n(p.points ?? 0)}
              </span>
            </div>
          ))}
        </div>
        {solving && <SolveLoader />}
        {shownLock && (
          <div className="pitch-done">
            <SealCheck weight="fill" aria-hidden="true" />
            <strong>{shownLock.title}</strong>
            <span>{shownLock.text}</span>
          </div>
        )}
      </div>

      <PitchCorners
        lock={shownLock} solving={solving} outOfSolves={outOfSolves} hasResult={!!result} localOptions={localOptions}
        onSolve={onSolve} onToggleOptions={onToggleOptions} cheaper={false}
      />
    </div>
  );
}
