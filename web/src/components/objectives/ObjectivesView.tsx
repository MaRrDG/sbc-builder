// Objectives squad (Premium): tick the objectives you are playing, get the strongest squad from the
// club that covers their squad conditions. Objective names / texts and player / nation / league names
// are EA's; only our own labels are translated.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowsClockwise, CheckCircle, CheckSquare, HandPointing, SoccerBall, Square, UsersThree, Warning, XCircle } from '@phosphor-icons/react';
import { api, ApiError, type Challenge, type Meta, type ObjCondition, type Player, type ObjectiveGroupView, type ObjectivesResponse, type ObjectivesSolve, type SolveResult } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { errorText } from '../../messages';
import { Pitch } from '../Pitch';
import { conditionLabel, formationLabel, pickKey, resultKey, timeLeft } from './objectives';

const ROLE_ICON = { score: SoccerBall, assist: HandPointing, xi: UsersThree } as const;
const NO_IDS = new Set<number>();
const NO_PLACED = new Map<number, Player>();

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function writeJson(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* private window: the pick just isn't remembered */
  }
}

/** The objective groups with a checkbox per objective that has a squad condition (also the Premium demo). */
export function ObjectiveGroups({ groups, meta, picked, onToggle, now }: {
  groups: ObjectiveGroupView[]; meta: Pick<Meta, 'names'>; picked: number[]; onToggle: (id: number) => void; now: number;
}) {
  const { t } = useI18n();
  return (
    <div className="obj-groups">
      {groups.map((g) => {
        const left = timeLeft(g.endsAt, now);
        return (
          <article key={g.id} className="obj-group">
            <header>
              <h2>{g.title}</h2>
              <p className="muted">
                {g.category}
                {left ? ` · ${t('obj.timeLeft', { days: left.days, hours: left.hours })}` : ''}
              </p>
            </header>
            <ul className="obj-list">
              {g.objectives.map((o) => {
                const can = o.conditions.length > 0;
                const on = can && picked.includes(o.id);
                return (
                  <li key={o.id} className={`obj-item${can ? '' : ' is-dim'}`}>
                    <button
                      type="button" className="obj-check" role="checkbox" aria-checked={on} disabled={!can}
                      aria-describedby={`obj-desc-${o.id}`} onClick={() => onToggle(o.id)}
                    >
                      {on ? <CheckSquare weight="fill" aria-hidden="true" /> : <Square weight="bold" aria-hidden="true" />}
                      <span className="obj-name">{o.name}</span>
                      <span className="obj-progress">{o.progress}/{o.target}</span>
                    </button>
                    <p className="obj-desc" id={`obj-desc-${o.id}`}>{o.description}</p>
                    {can ? (
                      <ul className="obj-pills">
                        {o.conditions.map((c, k) => {
                          const Icon = ROLE_ICON[c.role];
                          return (
                            <li key={k} className="obj-pill">
                              <Icon weight="bold" aria-hidden="true" /> {conditionLabel(c, meta, t)}
                            </li>
                          );
                        })}
                      </ul>
                    ) : (
                      <p className="muted obj-none">{t('obj.noCondition')}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

export function ObjectivesView({ meta, personaId, extVersionOk, excludeIds, maxRating, onError, onSettings }: {
  meta: Meta; personaId: number; extVersionOk: boolean; excludeIds: number[]; maxRating: number;
  onError: (e: unknown) => void; onSettings: () => void;
}) {
  const { t } = useI18n();
  const ago = useAgo();
  const [data, setData] = useState<ObjectivesResponse | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [tries, setTries] = useState(0);
  const [picked, setPicked] = useState<number[]>(() => readJson(pickKey(personaId), []));
  const [chosen, setChosen] = useState('');
  const [result, setResult] = useState<ObjectivesSolve | null>(() => {
    const r = readJson<ObjectivesSolve | null>(resultKey(personaId), null);
    return r && Array.isArray(r.slots) && Array.isArray(r.covers) && Array.isArray(r.reasons) ? r : null; // ignore a damaged save
  });
  const [solving, setSolving] = useState(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const now = Date.now();
  // a ref, so a language switch (new onError) does not refetch
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    let alive = true;
    setLoadError(null);
    api.objectives().then(
      (d) => {
        if (!alive) return;
        setData(d);
      },
      (e) => {
        if (!alive) return;
        if (e instanceof ApiError && (e.code === 'personaNotYours' || e.code === 'personaTakenOver')) onErrorRef.current(e);
        else setLoadError(e); // shown in place with "Try again"
      },
    );
    return () => {
      alive = false;
    };
  }, [personaId, tries]);

  useEffect(() => writeJson(pickKey(personaId), picked), [personaId, picked]);

  const open = useMemo(
    () => new Map(data?.groups.flatMap((g) => g.objectives.filter((o) => o.conditions.length).map((o) => [o.id, o] as const)) ?? []),
    [data],
  );
  // a ticked objective that has since been done (or has left the web app) drops out
  const active = picked.filter((id) => open.has(id));
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const solve = async () => {
    if (!active.length || solving) return;
    setSolving(true);
    try {
      const r = await api.solveObjectives({ objectiveIds: active, formation, options: { excludeIds, maxRating } });
      setResult(r);
      writeJson(resultKey(personaId), r);
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      requestAnimationFrame(() => resultRef.current?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }));
    } catch (e) {
      onError(e);
    } finally {
      setSolving(false);
    }
  };

  // picked here, else the active squad's (if the web app loaded it), else 4-3-3
  const valid = (f: string | null | undefined): f is string => !!f && Object.hasOwn(meta.formations, f);
  const formation = valid(chosen) ? chosen : valid(data?.formation) ? data.formation : valid('f433') ? 'f433' : Object.keys(meta.formations)[0] ?? '';
  const formations = useMemo(
    () => Object.keys(meta.formations).sort((a, b) => formationLabel(a).localeCompare(formationLabel(b), undefined, { numeric: true })),
    [meta],
  );

  if (loadError !== null && !data)
    return (
      <div className="gallery-error" role="alert">
        <p className="muted">{errorText(loadError, t)}</p>
        <button type="button" className="ghost" onClick={() => setTries((n) => n + 1)}>
          <ArrowsClockwise weight="bold" aria-hidden="true" /> {t('auth.retry')}
        </button>
      </div>
    );
  if (!data) return <p className="muted" role="status">{t('admin.loading')}</p>;

  // The pitch: while solving, the picked conditions on an empty squad; after, the answer.
  const showPitch = solving || !!result;
  const shown = result && !solving ? result : null;
  const conds: ObjCondition[] = shown ? shown.covers.map((c) => c.condition) : active.flatMap((id) => open.get(id)?.conditions ?? []);
  const challenge: Challenge = {
    challengeId: 0, setId: 0, name: '', description: '', status: '', formation: shown?.formation ?? formation,
    elgOperation: 'AND', timesCompleted: 0, repeatable: false, layout: null, needsLayout: false,
    requirements: conds.map((c, i) => ({ slot: i, scope: 0, count: c.min, combined: false, text: conditionLabel(c, meta, t) })),
  };
  const pitchResult: SolveResult | null = shown && {
    found: shown.found,
    ms: shown.ms,
    slots: shown.slots,
    eval: {
      rating: shown.eval?.rating ?? 0,
      chemistry: shown.eval?.chemistry ?? 0,
      results: shown.covers.map((c) => ({ text: conditionLabel(c.condition, meta, t), met: c.met, actual: c.itemIds.length })),
      allMet: shown.found,
    },
  };
  const nameOf = (id: number) => open.get(id)?.name ?? '';
  const badges = new Map<number, string>();
  for (const c of shown?.covers ?? [])
    for (const id of c.itemIds) badges.set(id, [badges.get(id), `${nameOf(c.objectiveId) || conditionLabel(c.condition, meta, t)}`].filter(Boolean).join(', '));

  return (
    <section className="objectives-view">
      <header className="page-head">
        <div>
          <h1>{t('obj.title')}</h1>
          <p className="muted">{t('obj.lede')}</p>
          {data.fetchedAt ? <p className="muted obj-fetched">{t('obj.fetched', { ago: ago(data.fetchedAt) })}</p> : null}
        </div>
      </header>

      {!data.fetchedAt ? (
        <div className="obj-empty">
          <Warning weight="bold" aria-hidden="true" />
          <p>{extVersionOk ? t('obj.emptyOpenWebApp') : t('obj.emptyUpdateExtension')}</p>
        </div>
      ) : data.groups.length === 0 ? (
        <div className="obj-empty">
          <Warning weight="bold" aria-hidden="true" />
          <p>{t('obj.noGroups')}</p>
        </div>
      ) : (
        <ObjectiveGroups groups={data.groups} meta={meta} picked={active} onToggle={toggle} now={now} />
      )}

      {showPitch && (
        <div className="obj-result" ref={resultRef}>
          <h2>{t('obj.resultTitle')}</h2>
          <div className="obj-pitch">
            <Pitch
              meta={meta}
              challenge={challenge}
              result={pitchResult}
              solving={solving}
              onSolve={() => void solve()}
              onToggleOptions={onSettings}
              lock={null}
              localOptions={false}
              placed={NO_PLACED}
              selectedId={null}
              onPlayerClick={() => {}}
              outOfSolves={!active.length}
              marked={NO_IDS}
              cheaper={false}
              badges={badges}
            />
          </div>
          {shown && (
            <>
              <ul className="obj-covers">
                {shown.covers.map((c, i) => {
                  const ids = new Set(c.itemIds);
                  const who = shown.slots.flatMap((s) => (s.player && ids.has(s.player.id) ? [`${s.player.name} (${s.position.name})`] : []));
                  return (
                    <li key={i} className={c.met ? 'is-met' : 'is-miss'}>
                      {c.met ? <CheckCircle className="tick" weight="fill" aria-label={t('obj.met')} /> : <XCircle className="tick" weight="fill" aria-label={t('obj.notMet')} />}
                      <span>
                        {nameOf(c.objectiveId) && <strong>{nameOf(c.objectiveId)}: </strong>}
                        {conditionLabel(c.condition, meta, t)}
                        {who.length ? <span className="obj-who"> → {who.join(', ')}</span> : null}
                      </span>
                    </li>
                  );
                })}
              </ul>
              {!shown.found && shown.reasons.length > 0 && (
                <ul className="obj-reasons" role="alert">
                  {shown.reasons.map((r, i) => (
                    <li key={i}>
                      {r.code === 'noMatch'
                        ? t('obj.reason.noMatch', { what: conditionLabel(r.condition, meta, t) })
                        : t('obj.reason.combo', { formation: formationLabel(shown.formation) })}
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}

      <div className="obj-bar">
        <label>
          <span>{t('obj.formation')}</span>
          <select value={formation} onChange={(e) => setChosen(e.target.value)}>
            {formations.map((f) => (
              <option key={f} value={f}>{formationLabel(f)}</option>
            ))}
          </select>
        </label>
        <span className="muted obj-count" aria-live="polite">{t('obj.picked', { count: active.length })}</span>
        <button type="button" className="solve-sm" disabled={!active.length || solving} onClick={() => void solve()}>
          {solving ? t('obj.solving') : t('obj.find')}
        </button>
      </div>
    </section>
  );
}
