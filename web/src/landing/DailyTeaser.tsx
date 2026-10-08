// "Guess today's player" teaser, right after the hero: the Daily's mystery card (gold shield art from the
// demo, the silhouette, "?" for the name) above one fixed example guess whose six tiles flip in, in the
// game's order, once the demo scrolls into view. Same vocabulary as /daily (✓ ≈ ✕ glyphs + screen-reader
// text, never colour alone). Everything is visible by default; `is-in` only replays the motion
// (reduced motion: the final state only). Today's number comes from /api/daily and simply stays hidden if
// that call fails.
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ArrowUp, Cards, Crosshair, Crown, Flag, Shield, Star, Trophy, type Icon } from '@phosphor-icons/react';
import { api } from '../api';
import { cardArt } from '../components/Card';
import { Silhouette } from '../daily/Silhouette';
import { useI18n } from '../i18n';
import type { Route } from '../route';
import { DEMO_META, DEMO_SQUAD } from './demo';
import { useInView } from './motion';

type Col = 'nation' | 'league' | 'club' | 'position' | 'rating' | 'cardType';
type State = 'hit' | 'near' | 'miss';
const GLYPH: Record<State, string> = { hit: '✓', near: '≈', miss: '✕' };

// the example guess: Pau Cubarsí (Spain, LALIGA, Barcelona, 86 CB). Fixed tiles, in the game's column order.
const GUESS = DEMO_SQUAD[5];
const TILES: { col: Col; icon: Icon; state: State; up?: boolean }[] = [
  { col: 'nation', icon: Flag, state: 'hit' },
  { col: 'league', icon: Trophy, state: 'near' },
  { col: 'club', icon: Shield, state: 'miss' },
  { col: 'position', icon: Crosshair, state: 'near' },
  { col: 'rating', icon: Star, state: 'miss', up: true },
  { col: 'cardType', icon: Cards, state: 'hit' },
];

interface Props {
  link: (r: Route, className: string, children: ReactNode) => ReactNode;
}

export function DailyTeaser({ link }: Props) {
  const { t, lang } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref);
  const [day, setDay] = useState<number | null>(null);
  const [players, setPlayers] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    api.daily
      .info()
      .then((i) => {
        if (!live) return;
        if (Number.isInteger(i.day) && i.day > 0) setDay(i.day);
        if (Number.isInteger(i.players) && i.players > 0) setPlayers(i.players);
      })
      .catch(() => {}); // no number is fine: the teaser stands without it
    return () => {
      live = false;
    };
  }, []);

  const art = cardArt(GUESS, DEMO_META);
  const base = `${DEMO_META.contentBase}/items/images/mobile`;
  const value = (col: Col) => {
    const n = DEMO_META.names;
    switch (col) {
      case 'nation':
        return <img src={`${base}/flags/dark/${GUESS.nation}.png`} alt={n.nation[GUESS.nation]} loading="lazy" decoding="async" />;
      case 'league':
        return <img src={`${base}/leagues/dark/${GUESS.league}.png`} alt={n.league[GUESS.league]} loading="lazy" decoding="async" />;
      case 'club':
        return <img src={`${base}/clubs/dark/${GUESS.club}.png`} alt={n.club[GUESS.club]} loading="lazy" decoding="async" />;
      case 'position':
        return <span className="lp-dly-val">{GUESS.preferredPosition}</span>;
      case 'rating':
        return <span className="lp-dly-val">{GUESS.rating}</span>;
      case 'cardType':
        return <span className="lp-dly-val lp-dly-val-sm">{t('daily.card.normal')}</span>;
    }
  };

  return (
    <section id="daily" className="lp-section lp-dly" aria-labelledby="lp-dly-title">
      <div className="lp-dly-copy">
        <p className="lp-kicker">{t('landing.daily.kicker')}</p>
        <h2 id="lp-dly-title" className="lp-h2">{t('landing.daily.title')}</h2>
        <p className="lp-lede">{t('landing.daily.text')}</p>
        <p className="lp-dly-prem">
          <Crown weight="fill" aria-hidden="true" />
          <span>{t('landing.daily.premium')}</span>
        </p>
        <div className="lp-actions">{link({ view: 'daily', practice: false }, 'lp-btn', t('landing.daily.cta'))}</div>
      </div>

      <div ref={ref} className={`lp-dly-demo${seen ? ' is-in' : ''}`}>
        <div className="lp-dly-pitch">
          {/* the penalty box at the top, as on /daily's stage */}
          <svg className="pitch-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <rect x="20" y="0" width="60" height="34" />
            <rect x="35" y="0" width="30" height="14" />
          </svg>
          {day !== null && <p className="lp-dly-day">{t('landing.daily.day', { n: day })}</p>}
          <div className="lp-dly-float">
            <div className="card lp-dly-card" style={{ color: art.text }} role="img" aria-label={t('daily.mystery')}>
              {art.bg && <img className="card-bg" src={art.bg} alt="" loading="lazy" decoding="async" />}
              <div className="card-rating" aria-hidden="true">?</div>
              <Silhouette className="lp-dly-face" />
              <div className="card-name" aria-hidden="true">?</div>
              <span className="lp-dly-gleam" aria-hidden="true" />
            </div>
          </div>
        </div>

        <div className="lp-dly-guess">
          <p className="lp-dly-cap">
            <span>{t('landing.daily.demo')}</span>
            <span className="lp-dly-name">
              {GUESS.name}
              <span className="lp-dly-chip" aria-hidden="true">
                <b>{GUESS.rating}</b> {GUESS.preferredPosition}
              </span>
            </span>
          </p>
          <ul className="lp-dly-row">
            {TILES.map(({ col, icon: I, state, up }, i) => (
              <li key={col} className={`lp-dly-tile is-${state}`} style={{ '--i': i } as CSSProperties}>
                <I className="lp-dly-col" weight="bold" aria-hidden="true" />
                <span className="sr-only">{t(`daily.col.${col}`)}: </span>
                <span className="lp-dly-v">
                  {value(col)}
                  {up && <ArrowUp className="lp-dly-dir" weight="bold" aria-hidden="true" />}
                </span>
                <span className="lp-dly-s" aria-hidden="true">
                  {GLYPH[state]}
                </span>
                <span className="sr-only">
                  , {t(`daily.state.${state}`)}
                  {up ? `, ${t('daily.dir.up')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </div>
        {players !== null && <p className="lp-dly-count">{t('landing.daily.count', { count: players, countText: players.toLocaleString(lang) })}</p>}
      </div>
    </section>
  );
}
