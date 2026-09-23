import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowsClockwise, BookOpenText, Cards, CheckCircle, GearSix, List, Question, SlidersHorizontal, UsersThree, X } from '@phosphor-icons/react';
import {
  api, ApiError, setPersona,
  type Account, type Challenge, type Meta, type Player, type SbcSet, type SolveOptions, type SolveResult, type SyncStatus,
} from './api';
import { Pitch, ReqTick } from './components/Pitch';
import { SolverOptions, DEFAULT_OPTIONS, exclusionCount } from './components/SolverOptions';
import { LocalOptions } from './components/LocalOptions';
import { SetList } from './components/SetList';
import { ClubView } from './components/ClubView';
import { repeatLine } from './components/SetBadge';
import { repeatOf, untilText } from './repeat';
import { EaRequestsCard } from './components/EaRequestsCard';
import { canGoBack, type Route } from './route';
import { useAgo, useI18n, type Lang } from './i18n';
import { LangMenu } from './components/LangMenu';
import { Guide } from './components/Guide';
import { errorText, reasonText } from './messages';
import { PlayerPanel } from './components/PlayerPanel';
import { SetupGuide } from './components/SetupGuide';
import { UpdateBanner, needsUpdate, type ExtensionRelease } from './components/UpdateBanner';
import { AccountMenu } from './components/AccountMenu';
import { useClerk } from '@clerk/react';
import { migrateLegacyKeys } from './legacy';
import { unlinkExtension, useExtensionLink } from './link';

const ACTIVE = 'sbc-active-persona';

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: preference only lasts for this tab */
  }
}

type View = Route['view'];
type LocalMap = Record<number, SolveOptions>;

const optionsKey = (id: number) => `sbc-options-p${id}`;
const localKey = (id: number) => `sbc-local-options-p${id}`;
const resultsKey = (id: number) => `sbc-results-p${id}`;
const KEEP_RESULTS = 20; // solved squads kept per account, newest last

export default function App({ route, navigate }: { route: Route; navigate: (r: Route, replace?: boolean) => void }) {
  const [linked, setLinked] = useState<Account[] | null>(null);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [me, setMe] = useState<{ id: string; email: string } | null>(null);
  const [takenOver, setTakenOver] = useState(false);
  const { signOut } = useClerk();
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [club, setClub] = useState<Player[]>([]);
  const [categories, setCategories] = useState<{ categoryId: number; name: string; sets: SbcSet[] }[]>([]);
  const { t, lang, setLang } = useI18n();
  const ago = useAgo();
  // which screen is open lives in the URL (see route.ts), so browser Back works
  const view: View = route.view;
  const setId = route.view === 'sbcs' ? route.setId : null;
  const challengeId = route.view === 'sbcs' ? route.challengeId : null;
  const showGuide = view === 'setup';
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [results, setResults] = useState<Record<number, SolveResult>>({});
  const [solving, setSolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<SolveOptions>(DEFAULT_OPTIONS);
  const [localOptions, setLocalOptions] = useState<LocalMap>({});
  const [showOptions, setShowOptions] = useState(false);
  const [filter, setFilter] = useState('');
  const [menuOpen, setMenuOpen] = useState(false); // phone navigation menu
  const [syncing, setSyncing] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [squad, setSquad] = useState<{ starters: number[]; bench: number[] } | null>(null);
  const [latestExt, setLatestExt] = useState<ExtensionRelease | null>(null);
  // arriving from the extension's "How to update" link opens the steps right away
  const [updateAsked] = useState(() => new URLSearchParams(window.location.search).has('update'));
  const [dismissedUpdate, setDismissedUpdate] = useState(() => readLocal<string | null>('sbc-dismissed-update', null));

  const account = linked?.find((a) => a.personaId === activeId) ?? null;
  const challenge = challenges?.find((c) => c.challengeId === challengeId) ?? null;
  const [readAsked, setReadAsked] = useState<Set<number>>(() => new Set());
  const result = challengeId ? results[challengeId] ?? null : null;
  const clubById = useMemo(() => new Map(club.map((p) => [p.id, p])), [club]);
  // players already placed in this challenge in the web app, shown on the pitch before solving
  const placedPlayers = useMemo(
    () =>
      new Map(
        (challenge?.layout?.placed ?? []).flatMap((pl) => {
          const p = clubById.get(pl.itemId);
          return p ? [[pl.index, p] as const] : [];
        }),
      ),
    [challenge, clubById],
  );
  const setsById = useMemo(() => new Map(categories.flatMap((c) => c.sets).map((s) => [s.setId, s])), [categories]);
  const localSets = useMemo(() => new Set(Object.keys(localOptions).map(Number)), [localOptions]);
  const currentSet = (setId && setsById.get(setId)) || null;
  const local = setId ? localOptions[setId] ?? null : null;
  // an SBC with its own settings ignores the global ones entirely
  const effective = local ?? options;
  const setRepeat = currentSet ? repeatOf(currentSet, now) : null;
  const lock =
    !challenge ? null
    : challenge.status === 'COMPLETED' && !challenge.repeatable ? { title: t('set.lockCompleted'), text: t('set.lockOnce') }
    : setRepeat?.kind === 'limited' && !setRepeat.available
      ? { title: t('set.lockLimit'), text: t('set.lockLimitText', { limit: setRepeat.limit!, until: untilText(t, setRepeat.resetAt!, now) }) }
      : null;

  const loadAccountData = useCallback(async () => {
    const [m, c, s, st] = await Promise.all([api.meta(), api.club(), api.sets(), api.status()]);
    setMeta(m);
    setClub(c.players);
    setSquad(c.squad);
    setCategories(s.categories);
    setStatus(st.sync);
    setLatestExt(st.extension);
    if (st.account) setLinked((prev) => prev?.map((a) => (a.personaId === st.account!.personaId ? st.account! : a)) ?? prev);
  }, []);

  const selectAccount = useCallback(
    async (id: number) => {
      setPersona(id);
      setActiveId(id);
      writeLocal(ACTIVE, id);
      setOptions({ ...DEFAULT_OPTIONS, ...readLocal(optionsKey(id), {}) });
      setLocalOptions(readLocal<LocalMap>(localKey(id), {}));
      setChallenges(null);
      // solved squads survive reloads and tab switches; they are only replaced by solving again
      setResults(readLocal<Record<number, SolveResult>>(resultsKey(id), {}));
      await loadAccountData();
    },
    [loadAccountData],
  );

  const activeIdRef = useRef<number | null>(null);
  activeIdRef.current = activeId;

  // Boot (and after the extension links a new EA account): who am I, which personas are mine.
  const loadMe = useCallback(async () => {
    const { user, personas } = await api.me();
    setMe(user);
    setLinked(personas);
    const last = readLocal<number | null>(ACTIVE, null);
    const pick = personas.find((a) => a.personaId === (activeIdRef.current ?? last)) ?? personas[0];
    if (!pick) {
      setPersona(null);
      setActiveId(null);
      setMeta(await api.meta());
    } else if (pick.personaId !== activeIdRef.current) await selectAccount(pick.personaId);
    return personas;
  }, [selectAccount]);

  useEffect(() => {
    let cancelled = false; // StrictMode runs this twice; only the live run may select
    migrateLegacyKeys()
      .then(async () => {
        if (!cancelled) await loadMe();
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  const onLinked = useCallback(() => void migrateLegacyKeys().then(loadMe), [loadMe]);
  useExtensionLink(true, onLinked);

  // the persona was disconnected or taken over elsewhere: reload who we are
  const onApiError = useCallback(
    (e: unknown) => {
      const code = e instanceof ApiError ? e.code : null;
      if (code === 'personaTakenOver') setTakenOver(true);
      if (code === 'personaNotYours' || code === 'personaTakenOver') void loadMe();
      else setError(errorText(e, t));
    },
    [loadMe, t],
  );

  // Poll sync state so auto-syncs and new sessions show up without a reload.
  useEffect(() => {
    if (!activeId) return;
    const t = setInterval(async () => {
      if (document.hidden) return; // background tabs don't poll; the next visible tick catches up
      try {
        const st = await api.status();
        setLinked((prev) => prev?.map((a) => (a.personaId === activeId && st.account ? st.account : a)) ?? prev);
        setStatus((prev) => {
          const syncDone = prev?.running && !st.sync?.running;
          // an SBC submitted in the web app changed the cached club: refresh quietly
          const edited = prev && st.sync?.editedAt !== prev.editedAt;
          if (syncDone || edited) {
            void loadAccountData();
            if (setId) void api.challenges(setId).then((r) => setChallenges(r.challenges));
          }
          return st.sync;
        });
      } catch {
        /* server restarting; next tick retries */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [activeId, setId, loadAccountData]);

  useEffect(() => {
    // a link straight to /sbc/... loads before the account is picked: wait for its key
    if (!setId || !activeId) return;
    setChallenges(null);
    api
      .challenges(setId)
      .then((r) => setChallenges(r.challenges))
      .catch(onApiError);
  }, [setId, activeId, onApiError]);

  // /sbc/16 without a challenge (or one that is not in the set): open the first unfinished one
  useEffect(() => {
    if (route.view !== 'sbcs' || !route.setId || !challenges?.length || challenges[0].setId !== route.setId) return;
    if (challenges.some((c) => c.challengeId === route.challengeId)) return;
    const first = challenges.find((c) => c.status !== 'COMPLETED') ?? challenges[0];
    navigate({ view: 'sbcs', setId: route.setId, challengeId: first.challengeId }, true);
  }, [route, challenges, navigate]);

  // the tab title follows the screen
  useEffect(() => {
    const name =
      view === 'club' ? 'Club' : view === 'settings' ? 'Settings' : view === 'setup' ? 'Setup'
      : setId ? categories.flatMap((c) => c.sets).find((s) => s.setId === setId)?.name : null;
    document.title = name ? `${name} · FC Solver` : 'FC Solver';
  }, [view, setId, categories]);

  // A started challenge we have no squad for: read it once from the web app tab (one GET),
  // so players already placed there show up without reopening it in the web app.
  const readFromWebApp = useCallback(
    (id: number) => {
      setReadAsked((prev) => new Set(prev).add(id));
      api.readChallenge(id).then(setStatus).catch(onApiError);
    },
    [onApiError],
  );
  useEffect(() => {
    if (!challenge || challenge.status !== 'IN_PROGRESS' || challenge.layout || readAsked.has(challenge.challengeId)) return;
    if (!account?.session) return;
    readFromWebApp(challenge.challengeId);
  }, [challenge, account?.session, readAsked, readFromWebApp]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  // refresh windows of repeatable SBCs roll over while the page is open
  useEffect(() => {
    const tick = () => !document.hidden && setNow(Date.now());
    const t = setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  useEffect(() => {
    if (!showOptions) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShowOptions(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showOptions]);

  const updateOptions = (o: SolveOptions) => {
    setOptions(o);
    if (activeId) writeLocal(optionsKey(activeId), o);
  };

  const updateLocal = (id: number, o: SolveOptions | null) => {
    setLocalOptions((prev) => {
      const next = { ...prev };
      if (o) next[id] = o;
      else delete next[id];
      if (activeId) writeLocal(localKey(activeId), next);
      return next;
    });
  };

  const runSolve = async (deep = false, opts = effective) => {
    if (!challenge || lock) return;
    setSelectedId(null);
    setSolving(true);
    setError(null);
    try {
      const r = await api.solve(challenge.setId, challenge.challengeId, opts, deep);
      setResults((prev) => {
        const { [challenge.challengeId]: _old, ...rest } = prev;
        const next = { ...rest, [challenge.challengeId]: r };
        const ids = Object.keys(next);
        for (const id of ids.slice(0, Math.max(0, ids.length - KEEP_RESULTS))) delete next[Number(id)];
        if (activeId) writeLocal(resultsKey(activeId), next);
        return next;
      });
      if (!r.found && r.slots.some((s) => s.player)) setError(t('set.closest'));
    } catch (e) {
      onApiError(e);
    } finally {
      setSolving(false);
    }
  };

  const selectedSlot = result?.slots.find((sl) => sl.player?.id === selectedId) ?? null;
  const selected = selectedSlot?.player ?? null;
  const squadRole = (id: number) => (squad?.starters.includes(id) ? 'XI' : squad?.bench.includes(id) ? 'Subs' : null) as 'XI' | 'Subs' | null;

  const excludeAndResolve = (playerId: number) => {
    const next = { ...effective, excludeIds: [...new Set([...effective.excludeIds, playerId])] };
    if (local && setId) updateLocal(setId, next);
    else updateOptions(next);
    void runSolve(false, next);
  };

  const toggleGlobalExclude = (playerId: number) => {
    const ids = options.excludeIds.includes(playerId) ? options.excludeIds.filter((x) => x !== playerId) : [...options.excludeIds, playerId];
    updateOptions({ ...options, excludeIds: ids });
  };

  const doSync = async (what: 'club') => {
    setSyncing(what);
    setError(null);
    try {
      setStatus(await api.sync(what));
      await loadAccountData();
    } catch (e) {
      onApiError(e);
    } finally {
      setSyncing(null);
    }
  };

  const pickSet = (id: number) => {
    setMenuOpen(false);
    navigate({ view: 'sbcs', setId: id, challengeId: null });
    setShowOptions(false);
    setError(null);
  };

  const go = (v: Exclude<View, 'signin' | 'ssoCallback'>) => {
    setShowOptions(false);
    setMenuOpen(false);
    // pressing SBCs again goes back to the list
    navigate(v === 'sbcs' ? { view: 'sbcs', setId: null, challengeId: null } : { view: v });
    setError(null);
  };

  // leave the setup guide the way you came in, or to the SBC list when opened directly
  const closeGuide = () => (canGoBack() ? history.back() : go('sbcs'));

  const doSignOut = async () => {
    unlinkExtension();
    setPersona(null);
    await signOut({ redirectUrl: '/signin' });
  };

  const unlink = async (id: number) => {
    await api.unlinkPersona(id).catch(onApiError);
    await loadMe();
  };

  if (linked === null) return <div className="boot" aria-busy="true" />;
  if (linked.length === 0) return <Onboarding error={error} lang={lang} setLang={setLang} email={me?.email ?? ''} onSignOut={doSignOut} />;

  const busy = !!syncing || !!status?.running;
  const clubLeft = status?.clubSyncs ? Math.max(0, status.clubSyncs.limit - status.clubSyncs.used) : null;
  // players of the shown squad that left the club since it was found (used, sold, moved)
  const goneFromClub = result && club.length ? result.slots.filter((s) => s.player && !clubById.has(s.player.id)).length : 0;

  const controls = (
    <>
          <div className="sync">
            <button
              type="button"
              className="ghost"
              disabled={busy || !account?.session || clubLeft === 0}
              onClick={() => doSync('club')}
              title={
                clubLeft === 0
                  ? t('top.clubNoneLeft', { limit: status?.clubSyncs.limit ?? 3 })
                  : t('top.clubTitle', { n: clubLeft ?? 0 })
              }
            >
              <ArrowsClockwise weight="bold" className={syncing === 'club' || status?.running === 'club' ? 'spin' : ''} />
              <span>{t('top.club')}</span>
              <small>
                {ago(status?.clubAt ?? null)}
                {clubLeft !== null && ` · ${t('top.clubLeft', { n: clubLeft })}`}
              </small>
            </button>
            <span className="ghost sync-info" title={t('top.sbcTitle')}>
              <ArrowsClockwise weight="bold" className={status?.running === 'sbc' ? 'spin' : ''} />
              <span>{t('top.sbcs')}</span>
              <small>{ago(status?.sbcAt ?? null)} · {t('top.sbcAuto')}</small>
            </span>
          </div>

          <button
            type="button"
            className={`ghost icon-label${showGuide ? ' on' : ''}`}
            onClick={() => (showGuide ? closeGuide() : go('setup'))}
            aria-pressed={showGuide}
          >
            <Question weight="bold" /> <span>{t('top.setup')}</span>
          </button>

          <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
    </>
  );

  // phones: the full picker in the menu; the top bar shows the account badge instead
  const accountPicker = (
          <label className="account">
            <span className={`session ${account?.session ? 'on' : ''}`}>{account?.session ? t('top.live') : t('top.offline')}</span>
            <select
              value={activeId ?? ''}
              onChange={(e) => {
                navigate({ view: 'sbcs', setId: null, challengeId: null });
                void selectAccount(Number(e.target.value));
              }}
              aria-label={t('top.account')}
            >
              {linked.map((a) => (
                <option key={a.personaId} value={a.personaId}>
                  {a.personaName} · {a.clubName}
                </option>
              ))}
            </select>
          </label>
  );

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label={t('top.home')}>
          {/* the wordmark needs ~120px; narrow phones get the square icon */}
          <picture>
            <source media="(max-width: 480px)" srcSet="/brand/icon-green.svg" />
            <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="124" height="32" />
          </picture>
        </a>

        <div className="top-controls">
          {controls}
          <AccountMenu
            email={me?.email ?? ''}
            personas={linked}
            active={account}
            onSelect={(id) => {
              navigate({ view: 'sbcs', setId: null, challengeId: null });
              void selectAccount(id);
            }}
            onSettings={() => go('settings')}
            onSignOut={doSignOut}
          />
        </div>

        <span className={`session mobile-only ${account?.session ? 'on' : ''}`}>{account?.session ? t('top.live') : t('top.offline')}</span>
        <button
          type="button"
          className="hamburger mobile-only"
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? t('nav.close') : t('nav.open')}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? <X weight="bold" /> : <List weight="bold" />}
        </button>
      </header>

      {!account?.session && (
        <div className="notice">
          {t('notice.webAppClosed')}{' '}
          <button type="button" className="text" onClick={() => go('setup')}>
            {t('notice.noExtension')}
          </button>{' '}
          <button type="button" className="text" onClick={() => go('guide')}>
            {t('notice.howItWorks')}
          </button>
        </div>
      )}

      {latestExt && needsUpdate(account?.extVersion, latestExt) && (updateAsked || dismissedUpdate !== latestExt.version) && (
        <UpdateBanner
          installed={account?.extVersion}
          latest={latestExt}
          expanded={updateAsked}
          onDismiss={() => {
            setDismissedUpdate(latestExt.version);
            writeLocal('sbc-dismissed-update', latestExt.version);
          }}
        />
      )}

      {!!status?.unassigned && (
        <div className="notice info">
          {t('notice.unassigned', { count: status.unassigned })}
        </div>
      )}

      {takenOver && (
        <div className="notice" role="status">
          {t('notice.takenOver')}{' '}
          <button type="button" className="text" onClick={() => setTakenOver(false)}>
            {t('account.cancel')}
          </button>
        </div>
      )}

      <div className="layout">
        {menuOpen && <div className="menu-scrim mobile-only" onClick={() => setMenuOpen(false)} aria-hidden="true" />}
        <nav id="mobile-menu" className={`sidebar${menuOpen ? ' open' : ''}`} aria-label={t('nav.sections')}>
          <button type="button" className="nav-item" aria-current={view === 'sbcs' && !showGuide ? 'page' : undefined} onClick={() => go('sbcs')}>
            <Cards weight="bold" aria-hidden="true" />
            <span>{t('nav.sbc')}</span>
            <small>{setsById.size}</small>
          </button>
          <button type="button" className="nav-item" aria-current={view === 'club' && !showGuide ? 'page' : undefined} onClick={() => go('club')}>
            <UsersThree weight="bold" aria-hidden="true" />
            <span>{t('nav.club')}</span>
            <small>{club.length}</small>
          </button>
          <button type="button" className="nav-item" aria-current={view === 'settings' && !showGuide ? 'page' : undefined} onClick={() => go('settings')}>
            <GearSix weight="bold" aria-hidden="true" />
            <span>{t('nav.settings')}</span>
            {exclusionCount(options) > 0 && <em className="badge">{exclusionCount(options)}</em>}
          </button>
          <button type="button" className="nav-item" aria-current={view === 'guide' ? 'page' : undefined} onClick={() => go('guide')}>
            <BookOpenText weight="bold" aria-hidden="true" />
            <span>{t('nav.guide')}</span>
          </button>
          {/* on phones the top bar only has the logo; its controls live in this menu */}
          <div className="menu-controls mobile-only">
            {controls}
            {accountPicker}
          </div>
          <button type="button" className="nav-item mobile-only" onClick={doSignOut}>{t('auth.signOut')}</button>
        </nav>

        <main className="main">
          <div className="main-inner">
          {showGuide && (
            <section className="guide-panel">
              <header>
                <h1>{t('setup.title')}</h1>
                <button type="button" className="icon" onClick={closeGuide} aria-label={t('setup.close')}>
                  <X weight="bold" />
                </button>
              </header>
              <p className="muted">
                {t('setup.lede')}{' '}
                <button type="button" className="text" onClick={() => go('guide')}>
                  {t('setup.more')}
                </button>
              </p>
              <SetupGuide />
            </section>
          )}

          {view === 'guide' && <Guide clubSyncs={status?.clubSyncs.limit ?? 3} eaLimit={status?.ea.limit ?? 150} />}

          {!showGuide && view === 'sbcs' && !setId && (
            <SetList
              categories={categories}
              filter={filter}
              onFilter={setFilter}
              onPick={pickSet}
              localSets={localSets}
              now={now}
            />
          )}

          {!showGuide && view === 'club' && meta && (
            <ClubView club={club} meta={meta} squad={squad} excludeIds={options.excludeIds} onToggleExclude={toggleGlobalExclude} />
          )}

          {!showGuide && view === 'settings' && meta && (
            <section className="settings-page">
              <header className="page-head">
                <div>
                  <h1>{t('settings.title')}</h1>
                  <p className="muted">{t('settings.lede')}</p>
                </div>
              </header>
              <div className="settings-grid">
                <div className="settings-card options">
                  <SolverOptions options={options} onChange={updateOptions} clubById={clubById} club={club} meta={meta} />
                </div>
                <div className="settings-side">
                <AccountCard email={me?.email ?? ''} personas={linked} onUnlink={unlink} onSignOut={doSignOut} />
                {status?.ea && <EaRequestsCard ea={status.ea} />}
                <aside className="settings-card">
                  <h2>{t('settings.ownTitle')}</h2>
                  {Object.keys(localOptions).length === 0 ? (
                    <p className="muted">{t('settings.ownNone')}</p>
                  ) : (
                    <ul className="local-list">
                      {[...localSets].map((id) => {
                        const set = setsById.get(id);
                        return (
                          <li key={id}>
                            <button type="button" className="text" onClick={() => pickSet(id)} disabled={!set}>
                              {set?.name ?? t('settings.gone', { id })}
                            </button>
                            <button type="button" className="ghost" onClick={() => updateLocal(id, null)}>
                              {t('settings.useGlobal')}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </aside>
                </div>
              </div>
            </section>
          )}

          {!showGuide && view === 'sbcs' && setId && (
            <>
              <button type="button" className="back" onClick={() => go('sbcs')}>
                <ArrowLeft weight="bold" aria-hidden="true" /> {t('set.back')}
              </button>
              <div className="set-head">
                <h1>{currentSet?.name}</h1>
                {currentSet?.description && <p className="muted">{currentSet.description}</p>}
                <div className="set-meta">
                  {currentSet && repeatLine(currentSet, now, t) && (
                    <span className={`repeat-pill${setRepeat?.available ? '' : ' spent'}`}>
                      <ArrowsClockwise weight="bold" aria-hidden="true" /> {repeatLine(currentSet, now, t)}
                    </span>
                  )}
                  {challenge?.status === 'IN_PROGRESS' && account?.session && (
                    <button
                      type="button"
                      className="ghost icon-label"
                      disabled={status?.running === 'squad'}
                      onClick={() => readFromWebApp(challenge.challengeId)}
                      title={t('set.squadTitle')}
                    >
                      <ArrowsClockwise weight="bold" className={status?.running === 'squad' ? 'spin' : ''} />{' '}
                      <span>{status?.running === 'squad' ? t('set.readingSquad') : t('set.squadFromWebApp')}</span>
                    </button>
                  )}
                  <button type="button" className={`ghost icon-label${local ? ' on' : ''}`} onClick={() => setShowOptions(true)}>
                    <SlidersHorizontal weight="bold" /> <span>{local ? t('set.localSettings') : t('set.globalSettings')}</span>
                  </button>
                </div>
              </div>
              <nav className="challenge-tabs" aria-label={t('set.challenges')}>
                {challenges === null && [0, 1, 2].map((i) => <span key={i} className="tab-skeleton" />)}
                {challenges?.length === 0 && (
                  <p className="muted">{t('set.notLoaded')}</p>
                )}
                {challenges?.map((c) => (
                  <button
                    key={c.challengeId}
                    type="button"
                    aria-current={c.challengeId === challengeId}
                    className={c.status === 'COMPLETED' ? 'done' : ''}
                    onClick={() => {
                      // switching challenges inside a set replaces the entry: Back leaves the set
                      navigate({ view: 'sbcs', setId: c.setId, challengeId: c.challengeId }, true);
                      setSelectedId(null);
                      setError(null);
                    }}
                  >
                    {c.name}
                    {c.status === 'COMPLETED' && !c.repeatable && <CheckCircle weight="fill" aria-label={t('set.completedIcon')} />}
                    {c.repeatable && c.timesCompleted > 0 && <span className="times">×{c.timesCompleted}</span>}
                  </button>
                ))}
              </nav>

              {challenge && meta && (
                <div className="board">
                  <div className="board-main">
                    {error && <div className="banner" role="alert">{error}</div>}
                    {goneFromClub > 0 && !solving && (
                      <div className="notice-inline" role="status">
                        {t('set.goneFromClub', { count: goneFromClub })}
                      </div>
                    )}
                    {challenge.needsLayout && (
                      <div className="notice-inline" role="status">
                        {challenge.status === 'IN_PROGRESS' && account?.session ? (
                          <>
                            {t('set.bricksRead')}{' '}
                            <button
                              type="button"
                              className="text"
                              disabled={status?.running === 'squad'}
                              onClick={() => api.readChallenge(challenge.challengeId).then(setStatus).catch(onApiError)}
                            >
                              {status?.running === 'squad' ? t('set.bricksReading') : t('set.bricksReadButton')}
                            </button>
                          </>
                        ) : (
                          t('set.bricksOpen')
                        )}
                      </div>
                    )}
                    {result?.found && result.placed && result.placed.kept < result.placed.total && !solving && (
                      <div className="notice-inline" role="status">
                        {t('set.keptPlaced', { kept: result.placed.kept, total: result.placed.total })}
                      </div>
                    )}
                    {!!result?.missingPlaced?.length && !solving && (
                      <div className="notice-inline" role="status">
                        {t('set.missingPlaced', { count: result.missingPlaced.length })}
                      </div>
                    )}
                    {result && !result.found && result.reasons && !solving && (
                      <div className="no-solution" role="alert">
                        <strong>{t('set.noSquad')}</strong>
                        <ul>
                          {result.reasons.map((r, i) => (
                            <li key={i}>{reasonText(r, t)}</li>
                          ))}
                        </ul>
                        <button type="button" className="text" onClick={() => setShowOptions(true)}>
                          {t('set.reviewSettings')}
                        </button>
                      </div>
                    )}
                    <Pitch
                      meta={meta}
                      challenge={challenge}
                      result={result}
                      solving={solving}
                      onSolve={runSolve}
                      onToggleOptions={() => setShowOptions((v) => !v)}
                      lock={lock}
                      localOptions={!!local}
                      placed={placedPlayers}
                      selectedId={selectedId}
                      onPlayerClick={(id) => setSelectedId((cur) => (cur === id ? null : id))}
                    />
                    {result && !solving && (
                      <p className="hint">
                        {t('set.hint', { s: (result.ms / 1000).toFixed(1) })}
                      </p>
                    )}
                  </div>

                  <div className="board-side">
                    {selected && meta && (
                      <PlayerPanel
                        key={selected.id}
                        player={selected}
                        meta={meta}
                        chem={selectedSlot?.chem}
                        inSquad={squadRole(selected.id)}
                        onExclude={() => excludeAndResolve(selected.id)}
                        onClose={() => setSelectedId(null)}
                      />
                    )}
                    <section className="reqs-panel">
                      <h2>{challenge.name}</h2>
                      <p className="muted">{challenge.description}</p>
                      <ul className="reqs">
                        {challenge.requirements.map((r, i) => {
                          const res = result?.eval.results[i];
                          return (
                            <li key={r.slot} className={res ? (res.met ? 'met' : 'unmet') : ''}>
                              <ReqTick met={res?.met} />
                              <span>{r.text}</span>
                            </li>
                          );
                        })}
                      </ul>
                      {challenge.elgOperation === 'OR' && <p className="muted">{t('set.orHint')}</p>}
                    </section>

                  </div>
                </div>
              )}
            </>
          )}
          </div>
        </main>
      </div>

      {showOptions && meta && setId && (
        <>
          <div className="scrim" onClick={() => setShowOptions(false)} aria-hidden="true" />
          <aside className="drawer" aria-label={t('set.drawer')}>
            <LocalOptions
              key={setId}
              setName={currentSet?.name ?? ''}
              global={options}
              local={local}
              onSetLocal={(o) => {
                updateLocal(setId, o);
                // squads of this SBC were found with the old settings
                setResults((prev) => {
                  const next = { ...prev };
                  for (const c of challenges ?? []) delete next[c.challengeId];
                  if (activeId) writeLocal(resultsKey(activeId), next);
                  return next;
                });
              }}
              clubById={clubById}
              club={club}
              meta={meta}
              onClose={() => setShowOptions(false)}
            />
          </aside>
        </>
      )}
    </div>
  );
}

function Onboarding({ error, lang, setLang, email, onSignOut }: { error: string | null; lang: Lang; setLang: (l: Lang) => void; email: string; onSignOut: () => void }) {
  const { t } = useI18n();
  return (
    <div className="onboarding">
      <div className="brand onboarding-top">
        <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="186" height="48" />
        <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
      </div>
      <p className="muted">
        {email && t('account.signedInAs', { email })}{' '}
        <button type="button" className="text" onClick={onSignOut}>{t('auth.signOut')}</button>
      </p>
      <h1>{t('onb.title')}</h1>
      <p className="lede">{t('onb.lede')}</p>
      <SetupGuide />
      {error && <p className="banner">{error}</p>}
    </div>
  );
}

function AccountCard({ email, personas, onUnlink, onSignOut }: {
  email: string; personas: Account[]; onUnlink: (id: number) => void; onSignOut: () => void;
}) {
  const { t } = useI18n();
  const [asking, setAsking] = useState<number | null>(null);
  return (
    <aside className="settings-card account-card">
      <h2>{t('account.title')}</h2>
      {email && <p className="muted">{t('account.signedInAs', { email })}</p>}
      <h3>{t('account.personas')}</h3>
      {personas.length === 0 ? (
        <p className="muted">{t('account.none')}</p>
      ) : (
        <ul className="local-list">
          {personas.map((a) => (
            <li key={a.personaId}>
              <span>{a.personaName} · {a.clubName}</span>
              {asking === a.personaId ? (
                <span className="account-ask" role="group" aria-label={t('account.disconnectAsk', { name: a.personaName })}>
                  <span>{t('account.disconnectAsk', { name: a.personaName })}</span>
                  <button type="button" className="ghost" onClick={() => { setAsking(null); onUnlink(a.personaId); }}>{t('account.disconnectYes')}</button>
                  <button type="button" className="ghost" onClick={() => setAsking(null)}>{t('account.cancel')}</button>
                </span>
              ) : (
                <button type="button" className="ghost" onClick={() => setAsking(a.personaId)}>{t('account.disconnect')}</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="ghost wide" onClick={onSignOut}>{t('auth.signOut')}</button>
    </aside>
  );
}
