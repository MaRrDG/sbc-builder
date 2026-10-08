// The public Daily game (/daily) and Practice (/daily/practice): guess an EA FC player in 5 tries.
// Signed in, the server keeps today's game and stats; signed out, the browser keeps them (store.ts)
// and sends back the server's signed state token. Practice lives in memory only.
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from 'react';
import { ChartBar, Database, Question, Ranking } from '@phosphor-icons/react';
import { api, ApiError, type DailyAnswer, type DailyGuess, type DailyInfo, type DailyName, type DailyProfile, type DailyRow, type DailySilhouette, type DailyStats, type Meta } from '../api';
import { useI18n } from '../i18n';
import { LangMenu } from '../components/LangMenu';
import { errorText } from '../messages';
import { routePath, type Route } from '../route';
import { Grid } from './Grid';
import { Leaderboard } from './Leaderboard';
import { ProfilePrompt } from './ProfilePrompt';
import { Search } from './Search';
import { Sheet, HowTo, StatsBody } from './Sheets';
import { Stage } from './Stage';
import { indexNames } from './search';
import { localStats } from './stats';
import { clearGame, loadGame, loadPlays, markHelpSeen, recordPlay, saveGame, seenHelp } from './store';
import './daily.css';

interface Props {
  signedIn: boolean;
  authReady: boolean;
  practice: boolean;
  navigate: (r: Route, replace?: boolean) => void;
}

interface Game {
  rows: DailyRow[];
  finished: boolean;
  won: boolean;
  silhouette?: DailySilhouette;
  answer?: DailyAnswer;
}
const EMPTY: Game = { rows: [], finished: false, won: false };

const media = (q: string) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches;
const reducedMotion = () => media('(prefers-reduced-motion: reduce)');
/** phones get the stats as a sheet at the end; wider screens show them inline next to the card */
const phone = () => media('(max-width: 640px)');
type SheetKind = 'help' | 'stats' | 'lb' | 'prompt';
/** a signed-in player who was never asked whether to appear on the leaderboard */
const unasked = (inf: DailyInfo) => inf.signedIn && !!inf.me && !inf.me.asked;

export default function Daily({ signedIn, authReady, practice, navigate }: Props) {
  const { t, lang, setLang } = useI18n();
  const [info, setInfo] = useState<DailyInfo | null>(null);
  const [names, setNames] = useState<DailyName[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [game, setGame] = useState<Game>(EMPTY);
  const [state, setState] = useState<string | undefined>(); // signed state token (signed out / practice)
  const [token, setToken] = useState<string | null>(null); // practice player
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [points, setPoints] = useState<{ added: number; streak: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shake, setShake] = useState(0);
  const [fresh, setFresh] = useState<number | null>(null);
  const [reveal, setReveal] = useState(false);
  const [sheet, setSheet] = useState<SheetKind | null>(() => (seenHelp() ? null : 'help'));
  const afterPrompt = useRef<SheetKind | null>(null); // what opens when the leaderboard prompt closes
  const run = useRef(0); // drops answers of an older load / game
  const mode = useRef(practice); // the mode the current game belongs to
  const statsTimer = useRef<number | undefined>(undefined);

  const index = useMemo(() => indexNames(names), [names]);
  const exclude = useMemo(() => new Set(game.rows.map((r) => r.player.id)), [game.rows]);
  const max = info?.maxGuesses ?? 5;

  const resetGame = (g: Game = EMPTY) => {
    setGame(g);
    setState(undefined);
    setPoints(null);
    setError(null);
    setFresh(null);
    setReveal(false);
  };

  const startPractice = useCallback(async () => {
    const id = ++run.current; // a guess still in flight belongs to the previous player
    resetGame();
    setToken(null);
    try {
      const p = await api.daily.practice();
      if (id === run.current) setToken(p.token);
    } catch (e) {
      if (id === run.current) setLoadError(errorText(e, t));
    }
  }, [t]);

  const load = useCallback(async () => {
    const id = ++run.current;
    setLoadError(null);
    window.clearTimeout(statsTimer.current); // a prompt / stats sheet queued by the previous game must not open now
    if (mode.current !== practice) {
      // Today <-> Practice: the old game must not stay guessable while the new one loads
      mode.current = practice;
      resetGame();
      setToken(null);
      setInfo(null);
    }
    try {
      const [inf, pl, m] = await Promise.all([api.daily.info(), names.length ? null : api.daily.players(), meta ? null : api.meta()]);
      if (id !== run.current) return;
      setInfo(inf);
      if (pl) setNames(pl.players);
      if (m) setMeta(m);
      setStats(inf.game?.stats ?? (inf.signedIn ? null : localStats(loadPlays(), inf.day)));
      if (practice) return void startPractice();
      if (inf.signedIn) {
        resetGame(inf.game ? { rows: inf.game.rows, finished: inf.game.finished, won: inf.game.won, silhouette: inf.game.silhouette, answer: inf.game.answer } : EMPTY);
        if (inf.game?.finished && unasked(inf)) later('prompt', null);
      } else {
        const saved = loadGame(inf.day);
        resetGame(saved ? { rows: saved.rows, finished: saved.finished, won: saved.won, silhouette: saved.silhouette, answer: saved.answer } : EMPTY);
        if (saved) setState(saved.state);
      }
    } catch (e) {
      if (id === run.current) setLoadError(errorText(e, t));
    }
  }, [practice, startPractice, names.length, meta, t]);

  useEffect(() => {
    if (authReady) void load();
    // reload only when the mode or the account changes, not when names / meta arrive
  }, [authReady, signedIn, practice]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => window.clearTimeout(statsTimer.current), []);

  /** Opens a sheet once the reveal has played (at once without motion), unless another one is open. */
  function later(s: SheetKind, then: SheetKind | null) {
    window.clearTimeout(statsTimer.current);
    statsTimer.current = window.setTimeout(
      () =>
        setSheet((cur) => {
          if (cur) return cur;
          afterPrompt.current = then;
          return s;
        }),
      reducedMotion() ? 0 : 1200,
    );
  }

  const setProfile = (me: DailyProfile) => setInfo((i) => (i ? { ...i, me } : i));

  const guess = async (p: DailyName) => {
    if (busy || game.finished || !info || (practice && !token)) return;
    const expired = () => {
      const msg = errorText(new ApiError('', 'dailyExpired', {}), t);
      setError(msg);
      setShake((n) => n + 1);
      // the day rolled over (or the token is no good): start clean, and keep saying why
      if (!practice && !info.signedIn) clearGame();
      void (practice ? startPractice() : load()).then(() => setError(msg));
    };
    if (!practice && Date.now() >= info.nextAt) return expired(); // the page stayed open past the drop
    const id = run.current;
    setBusy(true);
    setError(null);
    try {
      const r: DailyGuess = practice ? await api.daily.practiceGuess(token!, p.i, state) : await api.daily.guess(p.i, info.signedIn ? undefined : state, info.day);
      if (id !== run.current) return; // the mode or the game changed meanwhile
      const next: Game = {
        rows: [...game.rows, r.row],
        finished: r.finished,
        won: r.won,
        // keep the silhouette through the end: the reveal starts from it
        silhouette: r.silhouette ?? game.silhouette,
        answer: r.answer,
      };
      setGame(next);
      setFresh(next.rows.length - 1);
      setState(r.state);
      if (r.finished) setReveal(true);
      if (practice) return;
      if (info.signedIn) {
        if (r.stats) setStats(r.stats);
        if (r.points) setPoints(r.points);
      } else {
        saveGame({ day: info.day, state: r.state ?? '', ...next });
        if (r.finished) {
          recordPlay({ day: info.day, won: r.won, guesses: next.rows.length });
          setStats(localStats(loadPlays(), info.day));
        }
      }
      // after the reveal: the leaderboard question first (once per account), then the stats on phones
      if (r.finished && !practice && info.signedIn && unasked(info)) later('prompt', phone() ? 'stats' : null);
      else if (r.finished && phone()) later('stats', null);
    } catch (e) {
      if (id !== run.current) return;
      if (e instanceof ApiError && e.code === 'dailyExpired') return expired();
      setError(errorText(e, t));
      setShake((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  /** A real link (open in new tab works) that navigates in place on a plain click. */
  const link = (r: Route, className: string, children: ReactNode, current?: boolean) => (
    <a
      className={className}
      href={routePath(r)}
      aria-current={current ? 'page' : undefined}
      onClick={(e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(r);
        window.scrollTo(0, 0);
      }}
    >
      {children}
    </a>
  );

  const date = info && !practice ? new Intl.DateTimeFormat(lang, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${info.date}T12:00:00Z`)) : null;
  const ready = !!info && (!practice || !!token);

  return (
    <div className="dg">
      <header className="dg-top">
        <div className="dg-top-in">
          {link({ view: 'landing' }, 'dg-logo', <img src="/brand/logo-on-dark.svg" alt={t('top.home')} width="140" height="36" />)}
          <div className="dg-top-end">
            <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
            {!authReady ? (
              <span className="dg-toplink" aria-hidden="true" style={{ visibility: 'hidden' }}>
                {t('landing.signIn')}
              </span>
            ) : signedIn ? (
              link({ view: 'sbcs', setId: null, challengeId: null }, 'dg-toplink', t('daily.dashboard'))
            ) : (
              link({ view: 'signin', next: practice ? '/daily/practice' : '/daily' }, 'dg-toplink', t('landing.signIn'))
            )}
          </div>
        </div>
      </header>

      <main className="dg-main" aria-label={t('daily.name')}>
        <div className="dg-titlebar">
          <div className="dg-titles">
            <h1 className="dg-title">{practice ? t('daily.tab.practice') : info ? t('daily.title', { n: info.day }) : t('daily.name')}</h1>
            <p className="dg-sub">{practice ? t('daily.practiceNote') : (date ?? '\u00a0')}</p>
          </div>
          <div className="dg-actions">
            <nav className="dg-tabs" aria-label={t('daily.name')}>
              {link({ view: 'daily', practice: false }, 'dg-tab', t('daily.tab.today'), !practice)}
              {link({ view: 'daily', practice: true }, 'dg-tab', t('daily.tab.practice'), practice)}
            </nav>
            <button type="button" className="dg-icon-btn" aria-label={t('daily.help')} title={t('daily.help')} onClick={() => setSheet('help')}>
              <Question weight="bold" aria-hidden="true" />
            </button>
            <button type="button" className="dg-icon-btn" aria-label={t('daily.stats')} title={t('daily.stats')} onClick={() => setSheet('stats')}>
              <ChartBar weight="bold" aria-hidden="true" />
            </button>
            <button type="button" className="dg-icon-btn" aria-label={t('daily.lb.button')} title={t('daily.lb.button')} onClick={() => setSheet('lb')}>
              <Ranking weight="bold" aria-hidden="true" />
            </button>
          </div>
        </div>
        {names.length > 0 && (
          <p className="dg-base">
            <Database weight="bold" aria-hidden="true" />
            <span>{t('daily.base.line', { count: names.length, countText: names.length.toLocaleString(lang) })}</span>
          </p>
        )}

        {loadError ? (
          <p className="dg-load-err" role="alert">
            {loadError}
          </p>
        ) : (
          <div className="dg-board" aria-busy={!ready}>
            <Stage
              game={game}
              info={info}
              meta={meta}
              max={max}
              reveal={reveal}
              practice={practice}
              signedIn={signedIn}
              stats={stats}
              points={points}
              link={link}
              onAnother={() => void startPractice()}
              onNextDay={() => void load()}
            />
            <div className="dg-play">
              {!game.finished && (
                <Search
                  index={index}
                  exclude={exclude}
                  meta={meta}
                  busy={busy || !ready}
                  disabled={game.finished}
                  left={max - game.rows.length}
                  error={error}
                  shake={shake}
                  onPick={guess}
                />
              )}
              <Grid rows={game.rows} max={max} fresh={fresh} meta={meta} />
              <p className="dg-data-note">{t('daily.dataNote')}</p>
            </div>
          </div>
        )}
      </main>

      <Sheet
        open={sheet === 'help'}
        title={t('daily.help')}
        onClose={() => {
          markHelpSeen();
          setSheet(null);
        }}
      >
        <HowTo />
      </Sheet>
      <Sheet open={sheet === 'stats'} title={t('daily.stats')} onClose={() => setSheet(null)}>
        <StatsBody stats={stats} signedIn={signedIn} today={!practice && game.finished && game.won ? game.rows.length : null} points={points} />
      </Sheet>
      <Sheet open={sheet === 'lb'} title={t('daily.lb.title')} onClose={() => setSheet((s) => (s === 'lb' ? null : s))}>
        <Leaderboard
          signedIn={signedIn && !!info?.signedIn}
          me={info?.me}
          signIn={link({ view: 'signin', next: practice ? '/daily/practice' : '/daily' }, 'dg-invite-link', t('landing.signIn'))}
          onJoin={() => {
            afterPrompt.current = 'lb';
            setSheet('prompt');
          }}
        />
      </Sheet>
      <ProfilePrompt
        open={sheet === 'prompt'}
        username={info?.me?.username ?? null}
        onProfile={setProfile}
        onClose={() => {
          const next = afterPrompt.current;
          afterPrompt.current = null;
          setSheet((s) => (s === 'prompt' ? next : s));
        }}
      />
    </div>
  );
}
