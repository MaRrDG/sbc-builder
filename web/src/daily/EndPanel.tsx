// The end of a game: result line, Share (daily), countdown to the next player, and the way on to Practice.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowsClockwise, Check, ShareNetwork } from '@phosphor-icons/react';
import type { DailyAnswer, DailyInfo, DailyRow, DailyStats } from '../api';
import { useI18n } from '../i18n';
import type { Route } from '../route';
import { Countdown } from './Countdown';
import { shareText } from './share';
import { StatsBody } from './Sheets';

interface Props {
  game: { rows: DailyRow[]; won: boolean; answer?: DailyAnswer };
  info: DailyInfo;
  practice: boolean;
  signedIn: boolean;
  /** the game just ended in this visit: wait for the last row and the reveal before showing up */
  animate: boolean;
  stats: DailyStats | null;
  points: { added: number; streak: number } | null;
  link: (r: Route, className: string, children: ReactNode) => ReactNode;
  onAnother: () => void;
  onNextDay: () => void;
}

export function EndPanel({ game, info, practice, signedIn, animate, stats, points, link, onAnother, onNextDay }: Props) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState<string | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => {
    if (fallback) area.current?.select();
  }, [fallback]);

  const share = async () => {
    const text = shareText({ day: info.day, rows: game.rows.map((r) => r.tiles), won: game.won, max: info.maxGuesses, url: info.share });
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setFallback(text); // clipboard denied: show the text selected, ready to copy by hand
    }
  };

  return (
    <section className={`dg-end${game.won ? ' won' : ' lost'}${animate ? ' late' : ''}`} aria-live="polite">
      {game.won ? (
        <h2 className="dg-end-title">{t('daily.won', { n: game.rows.length, max: info.maxGuesses })}</h2>
      ) : (
        <h2 className="dg-end-title">
          <span className="dg-end-pre">{t('daily.lost')}</span> <strong>{game.answer?.name}</strong>
        </h2>
      )}
      <div className="dg-end-bar">
        {practice ? (
          <button type="button" className="dg-btn go" onClick={onAnother}>
            <ArrowsClockwise weight="bold" aria-hidden="true" />
            {t('daily.another')}
          </button>
        ) : (
          <>
            <button type="button" className="dg-btn go" onClick={() => void share()}>
              {copied ? <Check weight="bold" aria-hidden="true" /> : <ShareNetwork weight="bold" aria-hidden="true" />}
              <span aria-live="polite">{copied ? t('daily.copied') : t('daily.share')}</span>
            </button>
            {link({ view: 'daily', practice: true }, 'dg-btn', t('daily.playPractice'))}
            <p className="dg-next-in">
              <span>{t('daily.next')}</span>
              <Countdown to={info.nextAt} onDone={onNextDay} />
            </p>
          </>
        )}
      </div>
      {fallback && <textarea ref={area} className="dg-share-text" readOnly rows={fallback.split('\n').length} value={fallback} aria-label={t('daily.share')} />}
      {!practice && (
        <div className="dg-end-stats">
          <StatsBody stats={stats} signedIn={signedIn} today={game.won ? game.rows.length : null} points={points} />
        </div>
      )}
      {!practice && !signedIn && (
        <p className="dg-invite">
          {t('daily.signIn')} {link({ view: 'signin', next: '/daily' }, 'dg-invite-link', t('landing.signIn'))}
        </p>
      )}
    </section>
  );
}
