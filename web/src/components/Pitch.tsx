import { useState } from 'react';
import type { Challenge, Meta, Player, SolveResult } from '../api';
import { CaretDown, Wrench, Lightning, Star, StarHalf, CheckCircle, XCircle, Circle, SealCheck, PushPin } from '@phosphor-icons/react';
import { BrickCard, Card, EmptyCard } from './Card';
import { useI18n } from '../i18n';

// Base x (%) per position uniqueId; left side of the screen = left positions.
const BASE_X: Record<number, number> = {
  0: 50, 2: 89, 3: 86, 4: 67, 5: 50, 6: 33, 7: 14, 8: 11, 9: 63, 10: 50, 11: 37,
  12: 86, 13: 66, 14: 50, 15: 34, 16: 14, 17: 67, 18: 50, 19: 33, 20: 66, 21: 50, 22: 34,
  23: 84, 24: 64, 25: 50, 26: 36, 27: 16,
};

// Lines of the formation from the goal upwards.
const LINE_OF = (u: number) =>
  u === 0 ? 0 : u <= 8 ? 1 : u <= 11 ? 2 : u <= 16 ? 3 : u <= 19 ? 4 : 5;

const MIN_GAP = 15; // % between card centres on one line

/** Places every slot on its line; lines share the height evenly, cards never overlap. */
export function layout(uniqueIds: number[]) {
  const lines = [...new Set(uniqueIds.map(LINE_OF))].sort((a, b) => a - b);
  // the header strip overlaps the pitch top; fewer lines leave room to clear it fully
  const top = lines.length >= 5 ? 15 : 18;
  const bottom = 87;
  const step = lines.length > 1 ? (bottom - top) / (lines.length - 1) : 0;
  const yOfLine = new Map(lines.map((l, i) => [l, bottom - i * step]));

  const pos: { x: number; y: number }[] = uniqueIds.map(() => ({ x: 50, y: 50 }));
  for (const line of lines) {
    const idx = uniqueIds.map((u, i) => [u, i] as const).filter(([u]) => LINE_OF(u) === line);
    idx.sort((a, b) => BASE_X[a[0]] - BASE_X[b[0]]);
    let xs = idx.map(([u]) => BASE_X[u] ?? 50);
    const cramped = xs.some((x, i) => i > 0 && x - xs[i - 1] < MIN_GAP);
    if (cramped) {
      const gap = Math.min(19, 84 / Math.max(1, xs.length - 1));
      const start = 50 - (gap * (xs.length - 1)) / 2;
      xs = xs.map((_, i) => start + i * gap);
    }
    idx.forEach(([, i], k) => (pos[i] = { x: xs[k], y: yOfLine.get(line)! }));
  }
  return { pos, lines: lines.length };
}

const POSITION_NAMES = ['GK', 'SW', 'RWB', 'RB', 'RCB', 'CB', 'LCB', 'LB', 'LWB', 'RDM', 'CDM', 'LDM', 'RM', 'RCM', 'CM', 'LCM', 'LM', 'RAM', 'CAM', 'LAM', 'RF', 'CF', 'LF', 'RW', 'RS', 'ST', 'LS', 'LW'];

const STAR_T = [0, 59, 62, 64, 66, 68, 70, 74, 78, 82, 99];
const stars = (rating: number) => {
  for (let e = 0; e < STAR_T.length; e++) if (rating <= STAR_T[e]) return e / 2;
  return 5;
};

function Stars({ value }: { value: number }) {
  const { t } = useI18n();
  return (
    <span className="stars" aria-label={t('pitch.stars', { n: value })}>
      {[0, 1, 2, 3, 4].map((i) => (
        value >= i + 1 ? <Star key={i} weight="fill" className="on" />
        : value >= i + 0.5 ? <StarHalf key={i} weight="fill" className="on" />
        : <Star key={i} weight="fill" />
      ))}
    </span>
  );
}

export function ReqTick({ met }: { met?: boolean }) {
  const { t } = useI18n();
  if (met === undefined) return <Circle className="tick" weight="bold" aria-hidden="true" />;
  return met ? <CheckCircle className="tick" weight="fill" aria-label={t('pitch.met')} /> : <XCircle className="tick" weight="fill" aria-label={t('pitch.notMet')} />;
}

function ChemDots({ value }: { value: number }) {
  const { t } = useI18n();
  return (
    <span className="chem-dots" aria-label={t('pitch.chem', { n: value })}>
      {[0, 1, 2].map((i) => (
        <i key={i} className={i < value ? 'on' : ''} />
      ))}
    </span>
  );
}

interface Props {
  meta: Meta;
  challenge: Challenge;
  result: SolveResult | null;
  solving: boolean;
  onSolve: (deep?: boolean) => void;
  onToggleOptions: () => void;
  /** Why this challenge cannot be solved right now (done once, daily limit reached). */
  lock: { title: string; text: string } | null;
  localOptions: boolean;
  /** players already placed in the web app, by slot index; shown until a solve replaces them */
  placed: Map<number, Player>;
  selectedId: number | null;
  onPlayerClick: (playerId: number) => void;
}

export function Pitch({ meta, challenge, result, solving, onSolve, onToggleOptions, lock, localOptions, placed, selectedId, onPlayerClick }: Props) {
  const { t } = useI18n();
  const [showReqs, setShowReqs] = useState(false);
  const positions = meta.formations[challenge.formation] ?? [];
  const { pos: coords, lines } = layout(positions.map((p) => p.uniqueId));
  const locked = !!lock;
  const rating = result?.eval.rating ?? 0;
  const chem = result?.eval.chemistry ?? 0;
  const met = result?.eval.results.filter((r) => r.met).length ?? 0;
  const total = challenge.requirements.length;

  return (
    <div className="pitch-wrap">
      <div className="pitch-header">
        <button className="hdr-item" type="button" onClick={() => setShowReqs((v) => !v)} aria-expanded={showReqs}>
          <span className="hdr-label">{t('pitch.requirements')}</span>
          <span className="hdr-value">
            <span className="req-bar"><span style={{ width: `${total ? (met / total) * 100 : 0}%` }} /></span>
            {met}/{total} <CaretDown weight="bold" className={`chev${showReqs ? ' open' : ''}`} />
          </span>
        </button>
        <div className="hdr-item">
          <span className="hdr-label">{t('pitch.rating')}</span>
          <span className="hdr-value"><Stars value={stars(rating)} /> {rating || 0}</span>
        </div>
        <div className="hdr-item">
          <span className="hdr-label">{t('pitch.chemistry')}</span>
          <span className="hdr-value">{chem}/33</span>
        </div>
        {showReqs && (
          <ul className="req-dropdown">
            {challenge.requirements.map((r, i) => {
              const res = result?.eval.results[i];
              return (
                <li key={r.slot} className={res ? (res.met ? 'met' : 'unmet') : ''}>
                  <ReqTick met={res?.met} />
                  {r.text}
                  {res && <span className="actual">{String(res.actual)}</span>}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="pitch" data-lines={lines}>
        <svg className="pitch-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <rect x="18" y="0" width="64" height="15" />
          <rect x="35" y="0" width="30" height="6" />
          <line x1="0" y1="45" x2="100" y2="45" />
          <ellipse cx="50" cy="45" rx="14" ry="10" />
          <rect x="18" y="80" width="64" height="20" />
          <rect x="35" y="92" width="30" height="8" />
        </svg>
        {positions.map((pos, i) => {
          const { x, y } = coords[i];
          const slot = result?.slots[i];
          const player = solving ? null : result ? slot?.player ?? null : placed.get(i) ?? null;
          const kept = result ? !!slot?.fixed : placed.has(i);
          // locked slots are known before solving, from the squad the web app loaded
          const brick = slot?.brick ?? challenge.layout?.bricks.find((b) => b.index === i) ?? null;
          return (
            <div key={i} className="slot" style={{ left: `${x}%`, top: `${y}%`, ['--i' as string]: i }}>
              {kept && player && (
                <span className="slot-fixed" title={t('pitch.keptTitle')}>
                  <PushPin weight="fill" aria-label={t('pitch.kept')} />
                </span>
              )}
              {brick ? (
                <BrickCard brick={brick} meta={meta} />
              ) : player ? (
                <Card
                  player={player}
                  meta={meta}
                  position={POSITION_NAMES[pos.typeId]}
                  selected={player.id === selectedId}
                  onClick={() => onPlayerClick(player.id)}
                />
              ) : (
                <EmptyCard loading={solving} />
              )}
              <div className="slot-foot">
                {(player || brick?.custom) && result && !solving && <ChemDots value={slot?.chem ?? 0} />}
                <span className="slot-pos">{pos.name}</span>
              </div>
            </div>
          );
        })}
        {solving && <div className="pitch-status" role="status">{t('pitch.searching')}</div>}
        {lock && (
          <div className="pitch-done">
            <SealCheck weight="fill" aria-hidden="true" />
            <strong>{lock.title}</strong>
            <span>{lock.text}</span>
          </div>
        )}
      </div>

      <button className="corner corner-left" type="button" onClick={onToggleOptions}>
        <Wrench weight="fill" aria-hidden="true" /> {t('pitch.options')}
        {localOptions && <em className="badge">{t('pitch.local')}</em>}
      </button>
      <div className="corner corner-right">
        {lock ? (
          <span className="solve done">
            <SealCheck weight="fill" aria-hidden="true" /> {lock.title}
          </span>
        ) : (
          <button className="solve" type="button" disabled={solving} onClick={() => onSolve(false)}>
            <Lightning weight="fill" aria-hidden="true" /> {result ? t('pitch.resolve') : t('pitch.solve')}
          </button>
        )}
        {result && !locked && (
          <button className="solve-deep" type="button" disabled={solving} onClick={() => onSolve(true)} title={t('pitch.cheaperTitle')}>
            {t('pitch.cheaper')}
          </button>
        )}
      </div>
    </div>
  );
}
