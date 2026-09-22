import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowsClockwise, Cards, CheckCircle, GearSix, Question, SlidersHorizontal, UsersThree, X } from '@phosphor-icons/react';
import {
  api, ago, absorbKeysFromUrl, setAccountKey, storeKeys,
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
import { canGoBack, useRoute, type Route } from './route';
import { PlayerPanel } from './components/PlayerPanel';
import { SetupGuide } from './components/SetupGuide';
import { UpdateBanner, needsUpdate, type ExtensionRelease } from './components/UpdateBanner';

const ACTIVE = 'sbc-active-key';

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

type Linked = { key: string; account: Account };
type View = Route['view'];
type LocalMap = Record<number, SolveOptions>;

const optionsKey = (key: string) => `sbc-options-${key.slice(0, 8)}`;
const localKey = (key: string) => `sbc-local-options-${key.slice(0, 8)}`;
const resultsKey = (key: string) => `sbc-results-${key.slice(0, 8)}`;
const KEEP_RESULTS = 20; // solved squads kept per account, newest last

export default function App() {
  const [linked, setLinked] = useState<Linked[] | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [club, setClub] = useState<Player[]>([]);
  const [categories, setCategories] = useState<{ categoryId: number; name: string; sets: SbcSet[] }[]>([]);
  // which screen is open lives in the URL (see route.ts), so browser Back works
  const [route, navigate] = useRoute();
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
  const [syncing, setSyncing] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [squad, setSquad] = useState<{ starters: number[]; bench: number[] } | null>(null);
  const [latestExt, setLatestExt] = useState<ExtensionRelease | null>(null);
  // arriving from the extension's "How to update" link opens the steps right away
  const [updateAsked] = useState(() => new URLSearchParams(window.location.search).has('update'));
  const [dismissedUpdate, setDismissedUpdate] = useState(() => readLocal<string | null>('sbc-dismissed-update', null));

  const account = linked?.find((l) => l.key === activeKey)?.account ?? null;
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
    : challenge.status === 'COMPLETED' && !challenge.repeatable ? { title: 'Completed', text: 'This challenge can only be done once.' }
    : setRepeat?.kind === 'limited' && !setRepeat.available
      ? { title: 'Limit reached', text: `Done ${setRepeat.limit}/${setRepeat.limit} times. Available again in ${untilText(setRepeat.resetAt!, now)}.` }
      : null;

  const loadAccountData = useCallback(async () => {
    const [m, c, s, st] = await Promise.all([api.meta(), api.club(), api.sets(), api.status()]);
    setMeta(m);
    setClub(c.players);
    setSquad(c.squad);
    setCategories(s.categories);
    setStatus(st.sync);
    setLatestExt(st.extension);
    if (st.account) setLinked((prev) => prev?.map((l) => (l.account.personaId === st.account!.personaId ? { ...l, account: st.account! } : l)) ?? prev);
  }, []);

  const selectAccount = useCallback(
    async (key: string) => {
      setAccountKey(key);
      setActiveKey(key);
      writeLocal(ACTIVE, key);
      setOptions({ ...DEFAULT_OPTIONS, ...readLocal(optionsKey(key), {}) });
      setLocalOptions(readLocal<LocalMap>(localKey(key), {}));
      setChallenges(null);
      // solved squads survive reloads and tab switches; they are only replaced by solving again
      setResults(readLocal<Record<number, SolveResult>>(resultsKey(key), {}));
      await loadAccountData();
    },
    [loadAccountData],
  );

  // Boot: validate the keys this browser holds, then open the last used account.
  useEffect(() => {
    let cancelled = false; // StrictMode runs this twice; only the live run may select
    const keys = absorbKeysFromUrl();
    api
      .accounts(keys)
      .then(async ({ accounts }) => {
        if (cancelled) return;
        storeKeys(accounts.map((a) => a.key)); // forget revoked keys
        setLinked(accounts);
        const last = readLocal<string | null>(ACTIVE, null);
        const pick = accounts.find((a) => a.key === last) ?? accounts[0];
        if (pick) await selectAccount(pick.key);
        else setMeta(await api.meta());
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [selectAccount]);

  // Poll sync state so auto-syncs and new sessions show up without a reload.
  useEffect(() => {
    if (!activeKey) return;
    const t = setInterval(async () => {
      if (document.hidden) return; // background tabs don't poll; the next visible tick catches up
      try {
        const st = await api.status();
        setLinked((prev) => prev?.map((l) => (l.key === activeKey && st.account ? { ...l, account: st.account } : l)) ?? prev);
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
  }, [activeKey, setId, loadAccountData]);

  useEffect(() => {
    // a link straight to /sbc/... loads before the account is picked: wait for its key
    if (!setId || !activeKey) return;
    setChallenges(null);
    api
      .challenges(setId)
      .then((r) => setChallenges(r.challenges))
      .catch((e) => setError(e.message));
  }, [setId, activeKey]);

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
      api.readChallenge(id).then(setStatus).catch((e) => setError((e as Error).message));
    },
    [],
  );
  useEffect(() => {
    if (!challenge || challenge.status !== 'IN_PROGRESS' || challenge.layout || readAsked.has(challenge.challengeId)) return;
    if (!account?.session) return;
    readFromWebApp(challenge.challengeId);
  }, [challenge, account?.session, readAsked, readFromWebApp]);

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
    if (activeKey) writeLocal(optionsKey(activeKey), o);
  };

  const updateLocal = (id: number, o: SolveOptions | null) => {
    setLocalOptions((prev) => {
      const next = { ...prev };
      if (o) next[id] = o;
      else delete next[id];
      if (activeKey) writeLocal(localKey(activeKey), next);
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
        if (activeKey) writeLocal(resultsKey(activeKey), next);
        return next;
      });
      if (!r.found && r.slots.some((s) => s.player)) setError('Closest squad shown. Your club cannot meet every requirement.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSolving(false);
    }
  };

  const selectedSlot = result?.slots.find((sl) => sl.player?.id === selectedId) ?? null;
  const selected = selectedSlot?.player ?? null;
  const squadRole = (id: number) => (squad?.starters.includes(id) ? 'XI' : squad?.bench.includes(id) ? 'Subs' : null);

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
      setError((e as Error).message);
    } finally {
      setSyncing(null);
    }
  };

  const pickSet = (id: number) => {
    navigate({ view: 'sbcs', setId: id, challengeId: null });
    setShowOptions(false);
    setError(null);
  };

  const go = (v: View) => {
    setShowOptions(false);
    // pressing SBCs again goes back to the list
    navigate(v === 'sbcs' ? { view: 'sbcs', setId: null, challengeId: null } : { view: v });
    setError(null);
  };

  // leave the setup guide the way you came in, or to the SBC list when opened directly
  const closeGuide = () => (canGoBack() ? history.back() : go('sbcs'));

  if (linked === null) return <div className="boot" aria-busy="true" />;
  if (linked.length === 0) return <Onboarding error={error} />;

  const busy = !!syncing || !!status?.running;
  const clubLeft = status?.clubSyncs ? Math.max(0, status.clubSyncs.limit - status.clubSyncs.used) : null;
  // players of the shown squad that left the club since it was found (used, sold, moved)
  const goneFromClub = result && club.length ? result.slots.filter((s) => s.player && !clubById.has(s.player.id)).length : 0;

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="/" aria-label="FC Solver home">
          {/* the wordmark needs ~120px; narrow phones get the square icon */}
          <picture>
            <source media="(max-width: 480px)" srcSet="/brand/icon-green.svg" />
            <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="124" height="32" />
          </picture>
        </a>

        <div className="sync">
          <button
            type="button"
            className="ghost"
            disabled={busy || !account?.session || clubLeft === 0}
            onClick={() => doSync('club')}
            title={
              clubLeft === 0
                ? 'Club synced 3 times today. Opening your club in the web app still updates it.'
                : `Sync your club from the web app (${clubLeft} left today)`
            }
          >
            <ArrowsClockwise weight="bold" className={syncing === 'club' || status?.running === 'club' ? 'spin' : ''} />
            <span>Club</span>
            <small>
              {ago(status?.clubAt ?? null)}
              {clubLeft !== null && ` · ${clubLeft} left`}
            </small>
          </button>
          <span className="ghost sync-info" title="The SBC list refreshes on its own after the daily drop (20:01).">
            <ArrowsClockwise weight="bold" className={status?.running === 'sbc' ? 'spin' : ''} />
            <span>SBCs</span>
            <small>{ago(status?.sbcAt ?? null)} · auto 20:01</small>
          </span>
        </div>

        <button
          type="button"
          className={`ghost icon-label${showGuide ? ' on' : ''}`}
          onClick={() => (showGuide ? closeGuide() : go('setup'))}
          aria-pressed={showGuide}
        >
          <Question weight="bold" /> <span>Setup</span>
        </button>

        <label className="account">
          <span className={`session ${account?.session ? 'on' : ''}`}>{account?.session ? 'Live' : 'Offline'}</span>
          <select
            value={activeKey ?? ''}
            onChange={(e) => {
              navigate({ view: 'sbcs', setId: null, challengeId: null });
              void selectAccount(e.target.value);
            }}
            aria-label="EA account"
          >
            {linked.map((l) => (
              <option key={l.key} value={l.key}>
                {l.account.personaName} · {l.account.clubName}
              </option>
            ))}
          </select>
        </label>
      </header>

      {!account?.session && (
        <div className="notice">
          FC27 web app not open. FC Solver syncs only from your web app tab, so open it in this browser to sync. Cached data still works.{' '}
          <button type="button" className="text" onClick={() => go('setup')}>
            No extension yet?
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
          {status.unassigned} new player{status.unassigned === 1 ? '' : 's'} from packs waiting in Unassigned. Send them to your club in the web
          app and they show up here automatically.
        </div>
      )}

      <div className="layout">
        <nav className="sidebar" aria-label="Sections">
          <button type="button" className="nav-item" aria-current={view === 'sbcs' && !showGuide ? 'page' : undefined} onClick={() => go('sbcs')}>
            <Cards weight="bold" aria-hidden="true" />
            <span>SBC</span>
            <small>{setsById.size}</small>
          </button>
          <button type="button" className="nav-item" aria-current={view === 'club' && !showGuide ? 'page' : undefined} onClick={() => go('club')}>
            <UsersThree weight="bold" aria-hidden="true" />
            <span>Club</span>
            <small>{club.length}</small>
          </button>
          <button type="button" className="nav-item" aria-current={view === 'settings' && !showGuide ? 'page' : undefined} onClick={() => go('settings')}>
            <GearSix weight="bold" aria-hidden="true" />
            <span>Settings</span>
            {exclusionCount(options) > 0 && <em className="badge">{exclusionCount(options)}</em>}
          </button>
        </nav>

        <main className="main">
          <div className="main-inner">
          {showGuide && (
            <section className="guide-panel">
              <header>
                <h1>Set up the extension</h1>
                <button type="button" className="icon" onClick={closeGuide} aria-label="Close setup guide">
                  <X weight="bold" />
                </button>
              </header>
              <p className="muted">Each friend installs it once in their own Chrome. It only reads your club and SBC list.</p>
              <SetupGuide />
            </section>
          )}

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
                  <h1>Settings</h1>
                  <p className="muted">Used by every SBC on this account, unless the SBC has its own settings.</p>
                </div>
              </header>
              <div className="settings-grid">
                <div className="settings-card options">
                  <SolverOptions options={options} onChange={updateOptions} clubById={clubById} club={club} meta={meta} />
                </div>
                <div className="settings-side">
                {status?.ea && <EaRequestsCard ea={status.ea} />}
                <aside className="settings-card">
                  <h2>SBCs with their own settings</h2>
                  {Object.keys(localOptions).length === 0 ? (
                    <p className="muted">None. Open an SBC and press Options to give it its own settings.</p>
                  ) : (
                    <ul className="local-list">
                      {[...localSets].map((id) => {
                        const set = setsById.get(id);
                        return (
                          <li key={id}>
                            <button type="button" className="text" onClick={() => pickSet(id)} disabled={!set}>
                              {set?.name ?? `SBC #${id} (no longer available)`}
                            </button>
                            <button type="button" className="ghost" onClick={() => updateLocal(id, null)}>
                              Use global
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
                <ArrowLeft weight="bold" aria-hidden="true" /> All SBCs
              </button>
              <div className="set-head">
                <h1>{currentSet?.name}</h1>
                {currentSet?.description && <p className="muted">{currentSet.description}</p>}
                <div className="set-meta">
                  {currentSet && repeatLine(currentSet, now) && (
                    <span className={`repeat-pill${setRepeat?.available ? '' : ' spent'}`}>
                      <ArrowsClockwise weight="bold" aria-hidden="true" /> {repeatLine(currentSet, now)}
                    </span>
                  )}
                  {challenge?.status === 'IN_PROGRESS' && account?.session && (
                    <button
                      type="button"
                      className="ghost icon-label"
                      disabled={status?.running === 'squad'}
                      onClick={() => readFromWebApp(challenge.challengeId)}
                      title="Read the players you placed in this challenge in the web app"
                    >
                      <ArrowsClockwise weight="bold" className={status?.running === 'squad' ? 'spin' : ''} />{' '}
                      <span>{status?.running === 'squad' ? 'Reading squad…' : 'Squad from web app'}</span>
                    </button>
                  )}
                  <button type="button" className={`ghost icon-label${local ? ' on' : ''}`} onClick={() => setShowOptions(true)}>
                    <SlidersHorizontal weight="bold" /> <span>{local ? 'Local settings' : 'Global settings'}</span>
                  </button>
                </div>
              </div>
              <nav className="challenge-tabs" aria-label="Challenges">
                {challenges === null && [0, 1, 2].map((i) => <span key={i} className="tab-skeleton" />)}
                {challenges?.length === 0 && (
                  <p className="muted">
                    This SBC is not loaded yet. Open it once in the FC27 web app and it appears here on its own.
                  </p>
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
                    {c.status === 'COMPLETED' && !c.repeatable && <CheckCircle weight="fill" aria-label="completed" />}
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
                        {goneFromClub} player{goneFromClub === 1 ? ' in this squad is' : 's in this squad are'} no longer in your club. Solve
                        again for a squad you can build.
                      </div>
                    )}
                    {challenge.needsLayout && (
                      <div className="notice-inline" role="status">
                        {challenge.status === 'IN_PROGRESS' && account?.session ? (
                          <>
                            EA locks some slots in this SBC.{' '}
                            <button
                              type="button"
                              className="text"
                              disabled={status?.running === 'squad'}
                              onClick={() => api.readChallenge(challenge.challengeId).then(setStatus).catch((e) => setError(e.message))}
                            >
                              {status?.running === 'squad' ? 'Reading it from the web app…' : 'Read them from the web app'}
                            </button>
                          </>
                        ) : (
                          'EA locks some slots in this SBC. Open it once in the FC27 web app so FC Solver sees which, then solve.'
                        )}
                      </div>
                    )}
                    {result?.found && result.placed && result.placed.kept < result.placed.total && !solving && (
                      <div className="notice-inline" role="status">
                        Kept {result.placed.kept} of the {result.placed.total} players you placed in the web app (marked with a pin). The
                        rest could not meet the requirements, so they were replaced.
                      </div>
                    )}
                    {!!result?.missingPlaced?.length && !solving && (
                      <div className="notice-inline" role="status">
                        {result.missingPlaced.length} player{result.missingPlaced.length === 1 ? '' : 's'} you placed in the web app{' '}
                        {result.missingPlaced.length === 1 ? 'is' : 'are'} no longer in your club, so {result.missingPlaced.length === 1 ? 'that slot was' : 'those slots were'} filled again.
                      </div>
                    )}
                    {result && !result.found && result.reasons && !solving && (
                      <div className="no-solution" role="alert">
                        <strong>No squad possible from your club</strong>
                        <ul>
                          {result.reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                        <button type="button" className="text" onClick={() => setShowOptions(true)}>
                          Review settings for this SBC
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
                        Tap a card for player details. Found in {(result.ms / 1000).toFixed(1)}s.
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
                      {challenge.elgOperation === 'OR' && <p className="muted">Meeting any one requirement is enough.</p>}
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
          <aside className="drawer" aria-label="Settings for this SBC">
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
                  if (activeKey) writeLocal(resultsKey(activeKey), next);
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

function Onboarding({ error }: { error: string | null }) {
  return (
    <div className="onboarding">
      <div className="brand">
        <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="186" height="48" />
      </div>
      <h1>Cheapest SBC squads from your own club</h1>
      <p className="lede">
        A small Chrome extension hands your FC27 web app session to FC Solver. It reads your club and SBCs; it never buys, sells
        or submits anything. Setup takes two minutes.
      </p>
      <SetupGuide />
      {error && <p className="banner">{error}</p>}
    </div>
  );
}
