// The hero of the page: the mystery card on a pitch, under the web app's trapezoid header strip
// (guesses used, rating, position). At the end the revealed card shares the pitch with the result,
// the actions and (on wider screens) the stats.
import type { ReactNode } from 'react';
import type { DailyAnswer, DailyInfo, DailyRow, DailySilhouette, DailyStats, Meta } from '../api';
import { useI18n } from '../i18n';
import type { Route } from '../route';
import { EndPanel } from './EndPanel';
import { MysteryCard } from './MysteryCard';

interface Props {
  game: { rows: DailyRow[]; finished: boolean; won: boolean; silhouette?: DailySilhouette; answer?: DailyAnswer };
  info: DailyInfo | null;
  meta: Meta | null;
  max: number;
  reveal: boolean;
  practice: boolean;
  signedIn: boolean;
  stats: DailyStats | null;
  points: { added: number; streak: number } | null;
  link: (r: Route, className: string, children: ReactNode) => ReactNode;
  onAnother: () => void;
  onNextDay: () => void;
}

export function Stage({ game, info, meta, max, reveal, practice, signedIn, stats, points, link, onAnother, onNextDay }: Props) {
  const { t } = useI18n();
  const known = game.answer ?? game.silhouette;
  const used = game.rows.length;
  const end = game.finished && info;
  return (
    <section className={`pitch-wrap dg-stage${end ? ' is-end' : ''}`} aria-label={t('daily.mystery')}>
      <div className="pitch-header dg-strip">
        <div className="hdr-item">
          <span className="hdr-label">{t('daily.hdr.guesses')}</span>
          <span className="hdr-value">
            <span className="req-bar" aria-hidden="true">
              <span style={{ width: `${(used / max) * 100}%` }} />
            </span>
            {used}/{max}
          </span>
        </div>
        <div className="hdr-item">
          <span className="hdr-label">{t('daily.col.rating')}</span>
          <span className="hdr-value">{known ? known.rating : '?'}</span>
        </div>
        <div className="hdr-item">
          <span className="hdr-label">{t('daily.col.position')}</span>
          <span className="hdr-value">{known ? known.position : '?'}</span>
        </div>
      </div>
      <div className="dg-pitch">
        <svg className="pitch-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <rect x="20" y="0" width="60" height="34" />
          <rect x="35" y="0" width="30" height="14" />
        </svg>
        <MysteryCard meta={meta} silhouette={game.silhouette} answer={game.answer} won={game.won} reveal={reveal} />
        {end && (
          <EndPanel
            game={game}
            info={info}
            practice={practice}
            signedIn={signedIn}
            animate={reveal}
            stats={stats}
            points={points}
            link={link}
            onAnother={onAnother}
            onNextDay={onNextDay}
          />
        )}
      </div>
    </section>
  );
}
