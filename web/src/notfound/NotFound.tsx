// 404 page: a pack walkout that goes wrong. Nation, position and club are revealed one by one as in
// the game, then the card flips in: rated 404, "not found". Pure CSS motion (notfound.css); with
// prefers-reduced-motion, or after "Skip", everything shows at once in its final state.
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { ArrowCounterClockwise, Question, ShieldSlash, XCircle } from '@phosphor-icons/react';
import { useI18n } from '../i18n';
import { LangMenu } from '../components/LangMenu';
import { Card, cardArt } from '../components/Card';
import { DEMO_META, DEMO_SQUAD } from '../landing/demo';
import { routePath, type Route } from '../route';
import './notfound.css';

/** Sparks around the card: angle (deg), distance (% of the stage), delay (s). Fixed, so renders match. */
const SPARKS = Array.from({ length: 18 }, (_, i) => ({ a: i * 20 + (i % 3) * 7, d: 26 + ((i * 37) % 22), s: ((i * 13) % 10) / 10 }));
/** Blurred club cards drifting behind: squad index, side, top (%), rotation, blur (px). */
const GHOSTS = [
  { i: 0, side: 'left', top: 8, r: -14, b: 9 },
  { i: 3, side: 'right', top: 4, r: 12, b: 12 },
  { i: 5, side: 'left', top: 62, r: 9, b: 14 },
  { i: 1, side: 'right', top: 58, r: -10, b: 8 },
] as const;

const art = cardArt(DEMO_SQUAD[0], DEMO_META); // the gold rare background, as in a good pack

interface Props {
  path: string;
  signedIn: boolean;
  navigate: (r: Route) => void;
}

export default function NotFound({ path, signedIn, navigate }: Props) {
  const { t, lang, setLang } = useI18n();
  const [run, setRun] = useState(0); // a new key replays the walkout
  const [skip, setSkip] = useState(false);
  const tilt = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = t('meta.notFound');
  }, [t]);

  // the card leans toward the pointer; touch and reduced motion keep the slow idle float
  const onMove = (e: PointerEvent<HTMLElement>) => {
    const el = tilt.current;
    if (!el || e.pointerType !== 'mouse' || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const x = e.clientX / window.innerWidth - 0.5;
    const y = e.clientY / window.innerHeight - 0.5;
    el.style.setProperty('--ry', `${(x * 22).toFixed(2)}deg`);
    el.style.setProperty('--rx', `${(-y * 18).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
  };
  const onLeave = () => {
    tilt.current?.style.removeProperty('--ry');
    tilt.current?.style.removeProperty('--rx');
    tilt.current?.style.removeProperty('--gx');
  };

  const go = (r: Route) => (e: { preventDefault: () => void }) => {
    e.preventDefault();
    navigate(r);
    window.scrollTo(0, 0);
  };
  const replay = () => {
    setSkip(false);
    setRun((n) => n + 1);
  };

  const primary: Route = signedIn ? { view: 'sbcs', setId: null, challengeId: null } : { view: 'landing' };
  const secondary: Route = signedIn ? { view: 'landing' } : { view: 'daily', practice: false };

  return (
    <main className={`nf${skip ? ' nf-skip' : ''}`} key={run} onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className="nf-scene" aria-hidden="true">
        <div className="nf-tunnel" />
        <div className="nf-beams" />
        <div className="nf-floor" />
        {GHOSTS.map((g, k) => (
          <div key={g.i} className={`nf-ghost nf-ghost-${g.side}${k >= 2 ? ' nf-ghost-wide' : ''}`} style={{ top: `${g.top}%`, ['--r' as string]: `${g.r}deg`, ['--b' as string]: `${g.b}px` }}>
            <Card player={DEMO_SQUAD[g.i]} meta={DEMO_META} />
          </div>
        ))}
        <div className="nf-flash" />
      </div>

      <header className="nf-top">
        <a href="/" onClick={go({ view: 'landing' })} className="nf-logo">
          <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="155" height="40" />
        </a>
        <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
      </header>

      <div className="nf-stage">
        {/* the walkout: nation, position, club, each its own beat */}
        <div className="nf-clues" aria-hidden="true">
          <div className="nf-clue nf-clue-1">
            <span className="nf-clue-icon">
              <Question weight="bold" />
            </span>
            <span className="nf-clue-label">{t('notFound.nation')}</span>
          </div>
          <div className="nf-clue nf-clue-2">
            <span className="nf-clue-big">404</span>
            <span className="nf-clue-label">{t('notFound.position')}</span>
          </div>
          <div className="nf-clue nf-clue-3">
            <span className="nf-clue-icon">
              <ShieldSlash weight="bold" />
            </span>
            <span className="nf-clue-label">{t('notFound.club')}</span>
          </div>
        </div>

        <div className="nf-sparks" aria-hidden="true">
          {SPARKS.map((s, i) => (
            <i key={i} style={{ ['--a' as string]: `${s.a}deg`, ['--d' as string]: `${s.d}vmin`, ['--s' as string]: `${s.s}s` }} />
          ))}
        </div>

        <div className="nf-drop">
          <div className="nf-tilt" ref={tilt}>
            <button type="button" className="nf-card" onClick={replay} aria-label={t('notFound.cardLabel')} title={t('notFound.replay')}>
              <span className="nf-face nf-back">
                <img src="/brand/icon-green.svg" alt="" width="64" height="64" />
              </span>
              <span className="nf-face nf-front" style={{ color: art.text, ['--art' as string]: art.bg ? `url(${art.bg})` : 'none' }}>
                {art.bg && <img className="nf-card-bg" src={art.bg} alt="" />}
                <span className="nf-rating">404</span>
                <span className="nf-pos">??</span>
                <span className="nf-portrait">?</span>
                <span className="nf-name">{t('notFound.cardName')}</span>
                <span className="nf-badges">
                  <Question weight="bold" />
                  <Question weight="bold" />
                  <ShieldSlash weight="bold" />
                </span>
                <span className="nf-sheen" />
              </span>
            </button>
          </div>
        </div>
      </div>

      <section className="nf-copy">
        <p className="nf-req">
          <XCircle weight="fill" aria-hidden="true" />
          <span>{t('notFound.req')}</span>
          <span className="nf-req-state">{t('notFound.reqState')}</span>
        </p>
        <h1>{t('notFound.title')}</h1>
        <p className="nf-lead">{t('notFound.lead')}</p>
        <p className="nf-path">
          <code>{path}</code>
        </p>
        <div className="nf-actions">
          <a className="nf-btn nf-btn-go" href={routePath(primary)} onClick={go(primary)}>
            {signedIn ? t('notFound.back') : t('notFound.home')}
          </a>
          <a className="nf-btn" href={routePath(secondary)} onClick={go(secondary)}>
            {signedIn ? t('notFound.home') : t('notFound.daily')}
          </a>
        </div>
        <button type="button" className="nf-replay" onClick={replay}>
          <ArrowCounterClockwise weight="bold" aria-hidden="true" /> {t('notFound.replay')}
        </button>
      </section>

      {!skip && (
        <button type="button" className="nf-skipbtn" onClick={() => setSkip(true)}>
          {t('notFound.skip')}
        </button>
      )}
    </main>
  );
}
