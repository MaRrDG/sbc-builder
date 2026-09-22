import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowsClockwise, MagnifyingGlass, SlidersHorizontal, X, CheckCircle, Question } from '@phosphor-icons/react';
import {
  api, ago, absorbKeysFromUrl, setAccountKey, storeKeys,
  type Account, type Challenge, type Meta, type Player, type SbcSet, type SolveOptions, type SolveResult, type SyncStatus,
} from './api';
import { Pitch, ReqTick } from './components/Pitch';
import { ExcludePicker } from './components/ExcludePicker';
import { PlayerPanel } from './components/PlayerPanel';
import { SetupGuide } from './components/SetupGuide';
import { UpdateBanner, needsUpdate, type ExtensionRelease } from './components/UpdateBanner';

const DEFAULT_OPTIONS: SolveOptions = {
  excludeIds: [],
  excludeActiveSquad: true,
  excludeSquadReserves: false,
  excludeNations: [],
  excludeLeagues: [],
  excludeClubs: [],
  onlyUntradeable: false,
  maxRating: 99,
  excludeSpecial: true,
};

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

export default function App() {
  const [linked, setLinked] = useState<Linked[] | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [club, setClub] = useState<Player[]>([]);
  const [categories, setCategories] = useState<{ categoryId: number; name: string; sets: SbcSet[] }[]>([]);
  const [setId, setSetId] = useState<number | null>(null);
  const [challenges, setChallenges] = useState<Challenge[] | null>(null);
  const [challengeId, setChallengeId] = useState<number | null>(null);
  const [results, setResults] = useState<Record<number, SolveResult>>({});
  const [solving, setSolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<SolveOptions>(DEFAULT_OPTIONS);
  const [showOptions, setShowOptions] = useState(false);
  const [filter, setFilter] = useState('');
  const [syncing, setSyncing] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [squad, setSquad] = useState<{ starters: number[]; bench: number[] } | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [latestExt, setLatestExt] = useState<ExtensionRelease | null>(null);
  // arriving from the extension's "How to update" link opens the steps right away
  const [updateAsked] = useState(() => new URLSearchParams(window.location.search).has('update'));
  const [dismissedUpdate, setDismissedUpdate] = useState(() => readLocal<string | null>('sbc-dismissed-update', null));

  const account = linked?.find((l) => l.key === activeKey)?.account ?? null;
  const challenge = challenges?.find((c) => c.challengeId === challengeId) ?? null;
  const result = challengeId ? results[challengeId] ?? null : null;
  const clubById = useMemo(() => new Map(club.map((p) => [p.id, p])), [club]);
  const currentSet = categories.flatMap((c) => c.sets).find((s) => s.setId === setId) ?? null;

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
      setOptions({ ...DEFAULT_OPTIONS, ...readLocal(`sbc-options-${key.slice(0, 8)}`, {}) });
      setSetId(null);
      setChallenges(null);
      setResults({});
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
            if (edited) setResults({});
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
    if (!setId) return;
    setChallenges(null);
    api
      .challenges(setId)
      .then((r) => {
        setChallenges(r.challenges);
        setChallengeId(r.challenges.find((c) => c.status !== 'COMPLETED')?.challengeId ?? r.challenges[0]?.challengeId ?? null);
      })
      .catch((e) => setError(e.message));
  }, [setId]);

  useEffect(() => {
    if (!showOptions) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setShowOptions(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showOptions]);

  const updateOptions = (o: SolveOptions) => {
    setOptions(o);
    if (activeKey) writeLocal(`sbc-options-${activeKey.slice(0, 8)}`, o);
  };

  const runSolve = async (deep = false, opts = options) => {
    if (!challenge || (challenge.status === 'COMPLETED' && !challenge.repeatable)) return;
    setSelectedId(null);
    setSolving(true);
    setError(null);
    try {
      const r = await api.solve(challenge.setId, challenge.challengeId, opts, deep);
      setResults((prev) => ({ ...prev, [challenge.challengeId]: r }));
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
    const next = { ...options, excludeIds: [...new Set([...options.excludeIds, playerId])] };
    updateOptions(next);
    void runSolve(false, next);
  };

  const doSync = async (what: 'club' | 'sbc') => {
    setSyncing(what);
    setError(null);
    try {
      setStatus(await api.sync(what));
      await loadAccountData();
      if (setId && what === 'sbc') setChallenges((await api.challenges(setId)).challenges);
      setResults({});
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSyncing(null);
    }
  };

  const pickSet = (id: number) => {
    setShowGuide(false);
    setSetId(id);
    setNavOpen(false);
    setError(null);
  };

  if (linked === null) return <div className="boot" aria-busy="true" />;
  if (linked.length === 0) return <Onboarding error={error} />;

  const q = filter.trim().toLowerCase();
  const busy = !!syncing || !!status?.running;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">SBC</span>
          <span className="brand-name">Builder</span>
        </div>

        <div className="sync">
          <button type="button" className="ghost" disabled={busy || !account?.session} onClick={() => doSync('club')}>
            <ArrowsClockwise weight="bold" className={syncing === 'club' || status?.running === 'club' ? 'spin' : ''} />
            <span>Club</span>
            <small>{ago(status?.clubAt ?? null)}</small>
          </button>
          <button type="button" className="ghost" disabled={busy || !account?.session} onClick={() => doSync('sbc')}>
            <ArrowsClockwise weight="bold" className={syncing === 'sbc' || status?.running === 'sbc' ? 'spin' : ''} />
            <span>SBCs</span>
            <small>{ago(status?.sbcAt ?? null)}</small>
          </button>
        </div>

        <button
          type="button"
          className={`ghost icon-label${showOptions ? ' on' : ''}`}
          onClick={() => setShowOptions((v) => !v)}
          aria-pressed={showOptions}
        >
          <SlidersHorizontal weight="bold" /> <span>Solver</span>
          {exclusionCount(options) > 0 && <em className="badge">{exclusionCount(options)}</em>}
        </button>

        <button
          type="button"
          className={`ghost icon-label${showGuide ? ' on' : ''}`}
          onClick={() => setShowGuide((v) => !v)}
          aria-pressed={showGuide}
        >
          <Question weight="bold" /> <span>Setup</span>
        </button>

        <label className="account">
          <span className={`session ${account?.session ? 'on' : ''}`}>{account?.session ? 'Live' : 'Offline'}</span>
          <select value={activeKey ?? ''} onChange={(e) => selectAccount(e.target.value)} aria-label="EA account">
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
          Session expired. Open the FC27 web app once; the extension reconnects automatically. Cached data still works.{' '}
          <button type="button" className="text" onClick={() => setShowGuide(true)}>
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
        <aside className={`sidebar ${navOpen ? 'open' : ''}`}>
          <button type="button" className="nav-toggle" onClick={() => setNavOpen((v) => !v)} aria-expanded={navOpen}>
            {currentSet ? currentSet.name : 'Choose an SBC'}
          </button>
          <div className="nav-body">
            <label className="search">
              <MagnifyingGlass aria-hidden="true" />
              <input placeholder="Search SBCs" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search SBCs" />
            </label>
            {categories.length === 0 && <p className="muted pad">No SBCs cached yet. Sync SBCs to load them.</p>}
            {categories.map((cat) => {
              const sets = cat.sets.filter((s) => !q || s.name.toLowerCase().includes(q));
              if (sets.length === 0) return null;
              return (
                <section key={cat.categoryId} className="set-group">
                  <h3>{cat.name}</h3>
                  {sets.map((s) => {
                    const done = !s.repeatable && s.challengesCompletedCount >= s.challengesCount;
                    return (
                      <button
                        key={s.setId}
                        type="button"
                        className={`set ${s.setId === setId ? 'active' : ''} ${done ? 'done' : ''}`}
                        onClick={() => pickSet(s.setId)}
                      >
                        <span className="set-name">{s.name}</span>
                        <span className="set-progress">
                          {done ? <CheckCircle weight="fill" aria-label="completed" /> : `${s.challengesCompletedCount}/${s.challengesCount}`}
                        </span>
                      </button>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </aside>

        <main className="main">
          <div className="main-inner">
          {showGuide && (
            <section className="guide-panel">
              <header>
                <h1>Set up the extension</h1>
                <button type="button" className="icon" onClick={() => setShowGuide(false)} aria-label="Close setup guide">
                  <X weight="bold" />
                </button>
              </header>
              <p className="muted">Each friend installs it once in their own Chrome. It only reads your club and SBC list.</p>
              <SetupGuide />
            </section>
          )}
          {!showGuide && !setId && (
            <div className="intro">
              <h1>Pick an SBC</h1>
              <p>
                {club.length} players in {account?.clubName ?? 'your club'}. Choose a set, press Solve, then rebuild the squad in the web app.
                Nothing is ever submitted for you.
              </p>
            </div>
          )}

          {!showGuide && setId && (
            <>
              <div className="set-head">
                <h1>{currentSet?.name}</h1>
                {currentSet?.description && <p className="muted">{currentSet.description}</p>}
              </div>
              <nav className="challenge-tabs" aria-label="Challenges">
                {challenges === null && [0, 1, 2].map((i) => <span key={i} className="tab-skeleton" />)}
                {challenges?.map((c) => (
                  <button
                    key={c.challengeId}
                    type="button"
                    aria-current={c.challengeId === challengeId}
                    className={c.status === 'COMPLETED' ? 'done' : ''}
                    onClick={() => {
                      setChallengeId(c.challengeId);
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
                    {result && !result.found && result.reasons && !solving && (
                      <div className="no-solution" role="alert">
                        <strong>No squad possible from your club</strong>
                        <ul>
                          {result.reasons.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                        </ul>
                        <button type="button" className="text" onClick={() => setShowOptions(true)}>
                          Review solver settings
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

      {showOptions && meta && (
        <>
          <div className="scrim" onClick={() => setShowOptions(false)} aria-hidden="true" />
          <aside className="drawer" aria-label="Solver settings">
            <OptionsPanel
              options={options}
              onChange={updateOptions}
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

const exclusionCount = (o: SolveOptions) =>
  o.excludeIds.length + o.excludeNations.length + o.excludeLeagues.length + o.excludeClubs.length;

function OptionsPanel({
  options, onChange, clubById, club, meta, onClose,
}: {
  options: SolveOptions;
  onChange: (o: SolveOptions) => void;
  clubById: Map<number, Player>;
  club: Player[];
  meta: Meta;
  onClose: () => void;
}) {
  const toggle = (k: 'excludeActiveSquad' | 'excludeSquadReserves' | 'excludeSpecial' | 'onlyUntradeable') =>
    onChange({ ...options, [k]: !options[k] });
  return (
    <section className="options">
      <header>
        <div>
          <h2>Solver settings</h2>
          <p className="muted">Apply to every SBC on this account.</p>
        </div>
        <button type="button" className="icon" onClick={onClose} aria-label="Close solver settings">
          <X weight="bold" />
        </button>
      </header>
      <label className="switch">
        <input type="checkbox" checked={options.excludeActiveSquad} onChange={() => toggle('excludeActiveSquad')} />
        <span>Keep my active squad XI</span>
      </label>
      <label className="switch">
        <input type="checkbox" checked={options.excludeSquadReserves} onChange={() => toggle('excludeSquadReserves')} />
        <span>Keep my active squad subs</span>
      </label>
      <label className="switch">
        <input type="checkbox" checked={options.excludeSpecial} onChange={() => toggle('excludeSpecial')} />
        <span>Keep special and promo cards</span>
      </label>
      <label className="switch">
        <input type="checkbox" checked={options.onlyUntradeable} onChange={() => toggle('onlyUntradeable')} />
        <span>Only use untradeables</span>
      </label>
      <ExcludePicker
        meta={meta}
        club={club}
        value={{ excludeNations: options.excludeNations, excludeLeagues: options.excludeLeagues, excludeClubs: options.excludeClubs }}
        onChange={(ex) => onChange({ ...options, ...ex })}
      />
      <label className="range">
        <span>
          Highest OVR allowed <b>{options.maxRating}</b>
        </span>
        <input type="range" min={60} max={99} value={options.maxRating} onChange={(e) => onChange({ ...options, maxRating: Number(e.target.value) })} />
      </label>
      {options.excludeIds.length > 0 && (
        <div className="kept">
          <h3>Kept out of SBCs</h3>
          <ul>
            {options.excludeIds.map((id) => {
              const p = clubById.get(id);
              return (
                <li key={id}>
                  <b>{p?.rating ?? '?'}</b> {p?.name ?? `#${id}`}
                  <button
                    type="button"
                    className="icon"
                    aria-label={`Allow ${p?.name ?? 'player'} again`}
                    onClick={() => onChange({ ...options, excludeIds: options.excludeIds.filter((x) => x !== id) })}
                  >
                    <X weight="bold" />
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" className="text" onClick={() => onChange({ ...options, excludeIds: [] })}>
            Allow all again
          </button>
        </div>
      )}
    </section>
  );
}

function Onboarding({ error }: { error: string | null }) {
  return (
    <div className="onboarding">
      <div className="brand">
        <span className="brand-mark">SBC</span>
        <span className="brand-name">Builder</span>
      </div>
      <h1>Cheapest SBC squads from your own club</h1>
      <p className="lede">
        A small Chrome extension hands your FC27 web app session to the builder. It reads your club and SBCs; it never buys, sells
        or submits anything. Setup takes two minutes.
      </p>
      <SetupGuide />
      {error && <p className="banner">{error}</p>}
    </div>
  );
}
