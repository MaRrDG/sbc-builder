// Objectives squad (Premium), a three-step wizard: pick the objectives you are playing → pick a formation →
// the strongest squad from the club that covers their squad conditions. The step lives in the URL
// (/dashboard/objectives[/formation|/squad]), so browser Back goes back a step. Objective names / texts and
// player / nation / league names are EA's; only our own labels are translated.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowsClockwise, Check, CheckCircle, CheckSquare, Gift, HandPointing, SoccerBall, Square, UsersThree, Warning, XCircle } from '@phosphor-icons/react';
import { api, ApiError, type Challenge, type Meta, type ObjAward, type ObjCondition, type Player, type ObjectiveGroupView, type ObjectivesResponse, type ObjectivesSolve, type SolveResult } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { errorText } from '../../messages';
import type { ObjStep } from '../../route';
import { layout, Pitch } from '../Pitch';
import { awardText, conditionLabel, formationKey, formationLabel, isStale, pickKey, radioMove, reachableStep, resultKey, splitGroups, timeLeft } from './objectives';

const ROLE_ICON = { score: SoccerBall, assist: HandPointing, xi: UsersThree } as const;
const NO_IDS = new Set<number>();
const NO_PLACED = new Map<number, Player>();
const STEPS: ObjStep[] = ['pick', 'formation', 'squad'];

/** The last answer plus the ticks it was solved for (saves from before this have no `picked`). */
type Saved = ObjectivesSolve & { picked?: number[] };

/** EA's reward texts as sent, in one quiet line. */
function Rewards({ awards }: { awards: ObjAward[] }) {
  const { t } = useI18n();
  if (!awards.length) return null;
  return (
    <p className="obj-rewards">
      <Gift weight="bold" aria-hidden="true" /> {t('obj.rewards', { list: awards.map(awardText).join(', ') })}
    </p>
  );
}

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

function Pills({ conditions, meta }: { conditions: ObjCondition[]; meta: Pick<Meta, 'names'> }) {
  const { t } = useI18n();
  return (
    <ul className="obj-pills">
      {conditions.map((c, k) => {
        const Icon = ROLE_ICON[c.role];
        return (
          <li key={k} className="obj-pill">
            <Icon weight="bold" aria-hidden="true" /> {conditionLabel(c, meta, t)}
          </li>
        );
      })}
    </ul>
  );
}

/** ① Objectives ── ② Formation ── ③ Squad. Done steps carry a tick and go back; unreachable ones are inert. */
export function ObjStepper({ step, reach, onStep }: { step: ObjStep; reach: ObjStep; onStep?: (s: ObjStep) => void }) {
  const { t } = useI18n();
  const at = STEPS.indexOf(step);
  const max = STEPS.indexOf(reach);
  return (
    <nav className="obj-stepper" aria-label={t('obj.steps')}>
      <ol>
        {STEPS.map((s, i) => {
          const done = i < at;
          const current = i === at;
          const can = !current && i <= max && !!onStep;
          const body = (
            <>
              <span className="obj-step-mark" aria-hidden="true">{done ? <Check weight="bold" /> : i + 1}</span>
              <span className="obj-step-label">{t(`obj.step.${s}`)}</span>
              {done && <span className="sr-only">{t('obj.stepDone')}</span>}
            </>
          );
          return (
            <li key={s} className={`obj-step${current ? ' is-current' : done ? ' is-done' : ''}${can || current ? '' : ' is-locked'}`}>
              {can ? (
                <button type="button" onClick={() => onStep(s)}>{body}</button>
              ) : (
                <span aria-current={current ? 'step' : undefined} aria-disabled={current ? undefined : true}>{body}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** The groups' tickable objectives, one checkbox each (also the Premium demo). Pass groups through splitGroups first. */
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
              <h3>{g.title}</h3>
              <p className="obj-group-meta">
                <span>{g.category}</span>
                {left && <span>{t('obj.timeLeft', { days: left.days, hours: left.hours })}</span>}
              </p>
              <Rewards awards={g.awards} />
            </header>
            <ul className="obj-list">
              {g.objectives.map((o) => {
                const on = picked.includes(o.id);
                return (
                  <li key={o.id} className={`obj-item${on ? ' is-on' : ''}`}>
                    <button
                      type="button" className="obj-check" role="checkbox" aria-checked={on}
                      aria-describedby={`obj-desc-${o.id}`} onClick={() => onToggle(o.id)}
                    >
                      {on ? <CheckSquare weight="fill" aria-hidden="true" /> : <Square weight="bold" aria-hidden="true" />}
                      <span className="obj-name">{o.name}</span>
                      <span className="obj-progress">{o.progress}/{o.target}</span>
                    </button>
                    <div className="obj-body">
                      <p className="obj-desc" id={`obj-desc-${o.id}`}>{o.description}</p>
                      <Pills conditions={o.conditions} meta={meta} />
                      <Rewards awards={o.awards} />
                    </div>
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

/** Objectives FC Solver cannot build a squad for, folded into one block so they never mix with the tickable ones. */
function OtherObjectives({ groups, count }: { groups: ObjectiveGroupView[]; count: number }) {
  const { t } = useI18n();
  if (!count) return null;
  return (
    <details className="obj-other">
      <summary>{t('obj.other', { count })}</summary>
      {groups.map((g) => (
        <section key={g.id}>
          <h3>{g.title}</h3>
          <ul>
            {g.objectives.map((o) => (
              <li key={o.id}>
                <span className="obj-name">{o.name}</span>
                <span className="obj-progress">{o.progress}/{o.target}</span>
                <p className="obj-desc">{o.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </details>
  );
}

/** A formation as dots on a small pitch, from the same layout as the big one. */
function MiniPitch({ positions }: { positions: { uniqueId: number }[] }) {
  const { pos } = layout(positions.map((p) => p.uniqueId));
  return (
    <svg className="obj-mini" viewBox="0 0 68 88" aria-hidden="true">
      <rect x="1" y="1" width="66" height="86" rx="3" />
      <line x1="1" y1="44" x2="67" y2="44" />
      <rect x="20" y="70" width="28" height="17" />
      {pos.map((p, i) => (
        <circle key={i} cx={(p.x / 100) * 68} cy={6 + ((p.y - 15) / 72) * 76} r="3.4" />
      ))}
    </svg>
  );
}

function FormationTiles({ meta, formations, value, mine, onChange, labelledBy }: {
  meta: Meta; formations: string[]; value: string; mine: string | null; onChange: (f: string) => void; labelledBy: string;
}) {
  const { t } = useI18n();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (i: number) => (e: KeyboardEvent) => {
    const n = radioMove(i, e.key, formations.length);
    if (n === null) return;
    e.preventDefault();
    onChange(formations[n]);
    refs.current[n]?.focus();
  };
  return (
    <div className="obj-tiles" role="radiogroup" aria-labelledby={labelledBy}>
      {formations.map((f, i) => {
        const on = f === value;
        return (
          <button
            key={f} ref={(el) => { refs.current[i] = el; }} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1}
            className={`obj-tile${on ? ' is-on' : ''}`} onClick={() => onChange(f)} onKeyDown={onKey(i)}
          >
            {on && <CheckCircle className="obj-tile-tick" weight="fill" aria-hidden="true" />}
            <MiniPitch positions={meta.formations[f] ?? []} />
            <span className="obj-tile-label">{formationLabel(f)}</span>
            {f === mine && <span className="obj-tile-tag">{t('obj.activeSquad')}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function ObjectivesView({ meta, personaId, extVersionOk, excludeIds, maxRating, step, onStep, onError }: {
  meta: Meta; personaId: number; extVersionOk: boolean; excludeIds: number[]; maxRating: number;
  step: ObjStep; onStep: (s: ObjStep, replace?: boolean) => void; onError: (e: unknown) => void;
}) {
  const { t } = useI18n();
  const ago = useAgo();
  const [data, setData] = useState<ObjectivesResponse | null>(null);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [tries, setTries] = useState(0);
  const [picked, setPicked] = useState<number[]>(() => readJson(pickKey(personaId), []));
  const [chosen, setChosen] = useState<string>(() => readJson(formationKey(personaId), ''));
  const [result, setResult] = useState<Saved | null>(() => {
    const r = readJson<Saved | null>(resultKey(personaId), null);
    return r && Array.isArray(r.slots) && Array.isArray(r.covers) && Array.isArray(r.reasons) ? r : null; // ignore a damaged save
  });
  const [solving, setSolving] = useState(false);
  const headRef = useRef<HTMLHeadingElement>(null);
  const firstStep = useRef(true);
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
        // persona errors also go to App (reloads who we are); either way the loading state ends
        if (e instanceof ApiError && (e.code === 'personaNotYours' || e.code === 'personaTakenOver')) onErrorRef.current(e);
        setLoadError(e); // shown in place with "Try again"
      },
    );
    return () => {
      alive = false;
    };
  }, [personaId, tries]);

  useEffect(() => writeJson(pickKey(personaId), picked), [personaId, picked]);
  useEffect(() => {
    if (chosen) writeJson(formationKey(personaId), chosen);
  }, [personaId, chosen]);

  const split = useMemo(() => splitGroups(data?.groups ?? []), [data]);
  const open = useMemo(() => new Map(split.squad.flatMap((g) => g.objectives.map((o) => [o.id, o] as const))), [split]);
  // a ticked objective that has since been done (or has left the web app) drops out
  const active = picked.filter((id) => open.has(id));
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // picked here, else the active squad's (if the web app loaded it), else 4-3-3
  const valid = (f: string | null | undefined): f is string => !!f && Object.hasOwn(meta.formations, f);
  const mine = valid(data?.formation) ? data.formation : null;
  const formation = valid(chosen) ? chosen : mine ?? (valid('f433') ? 'f433' : Object.keys(meta.formations)[0] ?? '');
  const formations = useMemo(
    () => Object.keys(meta.formations).sort((a, b) => formationLabel(a).localeCompare(formationLabel(b), undefined, { numeric: true })),
    [meta],
  );

  // a deep link past what is done lands on the earliest incomplete step (judged once the objectives are in)
  const reach = reachableStep('squad', active.length, !!result || solving);
  const shownStep = data ? reachableStep(step, active.length, !!result || solving) : step;
  useEffect(() => {
    if (data && shownStep !== step) onStep(shownStep, true);
  }, [data, shownStep, step, onStep]);

  // a new step starts at the top with focus on its heading (not on the first visit)
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
    headRef.current?.focus({ preventScroll: true });
  }, [shownStep]);

  const build = async () => {
    if (!active.length || solving) return;
    setSolving(true);
    if (step !== 'squad') onStep('squad');
    try {
      const r = await api.solveObjectives({ objectiveIds: active, formation, options: { excludeIds, maxRating } });
      const saved: Saved = { ...r, picked: active };
      setResult(saved);
      writeJson(resultKey(personaId), saved);
    } catch (e) {
      onError(e);
    } finally {
      setSolving(false);
    }
  };

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

  const head = (
    <header className="page-head">
      <div>
        <h1>{t('obj.title')}</h1>
        {data.fetchedAt ? <p className="muted obj-fetched">{t('obj.fetched', { ago: ago(data.fetchedAt) })}</p> : null}
      </div>
    </header>
  );

  if (!data.fetchedAt || data.groups.length === 0)
    return (
      <section className="objectives-view">
        {head}
        <div className="obj-empty">
          <Warning weight="bold" aria-hidden="true" />
          <p>{!data.fetchedAt ? (extVersionOk ? t('obj.emptyOpenWebApp') : t('obj.emptyUpdateExtension')) : t('obj.noGroups')}</p>
        </div>
      </section>
    );

  const stepper = <ObjStepper step={shownStep} reach={reach} onStep={(s) => onStep(s)} />;

  if (shownStep === 'pick')
    return (
      <section className="objectives-view">
        {head}
        {stepper}
        <div className="obj-step-head">
          <h2 ref={headRef} tabIndex={-1}>{t('obj.pickTitle')}</h2>
          <p className="muted">{t('obj.pickLede')}</p>
        </div>
        {split.squad.length ? (
          <ObjectiveGroups groups={split.squad} meta={meta} picked={active} onToggle={toggle} now={now} />
        ) : (
          <div className="obj-empty">
            <Warning weight="bold" aria-hidden="true" />
            <p>{t('obj.noneTickable')}</p>
          </div>
        )}
        <OtherObjectives groups={split.other} count={split.otherCount} />
        <div className="obj-bar">
          <span className="obj-count" aria-live="polite">{t('obj.picked', { count: active.length })}</span>
          <button type="button" className="solve-sm" disabled={!active.length} onClick={() => onStep('formation')}>
            {t('obj.continue')}
          </button>
        </div>
      </section>
    );

  if (shownStep === 'formation')
    return (
      <section className="objectives-view">
        {head}
        {stepper}
        <div className="obj-summary">
          <div className="obj-summary-head">
            <h3>{t('obj.picked', { count: active.length })}</h3>
            <button type="button" className="obj-link" onClick={() => onStep('pick')}>{t('obj.edit')}</button>
          </div>
          <Pills conditions={active.flatMap((id) => open.get(id)?.conditions ?? [])} meta={meta} />
        </div>
        <div className="obj-step-head">
          <h2 ref={headRef} tabIndex={-1} id="obj-formation-title">{t('obj.formationTitle')}</h2>
        </div>
        <FormationTiles meta={meta} formations={formations} value={formation} mine={mine} onChange={setChosen} labelledBy="obj-formation-title" />
        <div className="obj-bar">
          <button type="button" className="ghost" onClick={() => onStep('pick')}>{t('obj.back')}</button>
          <button type="button" className="solve-sm" disabled={!active.length || solving} onClick={() => void build()}>
            {t('obj.build')}
          </button>
        </div>
      </section>
    );

  // Step 3. While solving: the picked conditions on an empty squad; after: the answer.
  const shown = result && !solving ? result : null;
  const stale = !!shown && isStale(shown, active, formation);
  const failed = !!shown && !shown.found;
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
  const backActions = (
    <>
      <button type="button" className="ghost" onClick={() => onStep('formation')}>{t('obj.changeFormation')}</button>
      <button type="button" className="ghost" onClick={() => onStep('pick')}>{t('obj.editObjectives')}</button>
    </>
  );

  return (
    <section className="objectives-view">
      {head}
      {stepper}
      <div className="obj-step-head">
        <h2 ref={headRef} tabIndex={-1}>{t('obj.resultTitle')}</h2>
        <p className="muted">{t('obj.inFormation', { formation: formationLabel(shown?.formation ?? formation) })}</p>
      </div>
      {solving && <p className="sr-only" role="status">{t('obj.solving')}</p>}
      {stale && (
        <p className="obj-stale" role="status">
          <ArrowsClockwise weight="bold" aria-hidden="true" /> {t('obj.stale')}
        </p>
      )}
      {failed && (
        <div className="obj-fail" role="alert">
          <h3>
            <XCircle weight="fill" aria-hidden="true" /> {t('obj.failTitle')}
          </h3>
          {shown.reasons.length > 0 && (
            <ul>
              {shown.reasons.map((r, i) => (
                <li key={i}>
                  {r.code === 'noMatch'
                    ? t('obj.reason.noMatch', { what: conditionLabel(r.condition, meta, t) })
                    : t('obj.reason.combo', { formation: formationLabel(shown.formation) })}
                </li>
              ))}
            </ul>
          )}
          <div className="obj-fail-actions">{backActions}</div>
        </div>
      )}
      <div className="obj-result">
        <div className="obj-pitch">
          <Pitch
            meta={meta}
            challenge={challenge}
            result={pitchResult}
            solving={solving}
            onSolve={() => void build()}
            onToggleOptions={() => {}}
            lock={null}
            localOptions={false}
            placed={NO_PLACED}
            selectedId={null}
            onPlayerClick={() => {}}
            outOfSolves={!active.length}
            marked={NO_IDS}
            cheaper={false}
            corners={false}
            badges={badges}
          />
        </div>
        {shown && (
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
        )}
      </div>
      {(!failed || stale) && (
        <div className="obj-bar">
          {!failed && <div className="obj-bar-left">{backActions}</div>}
          {stale && (
            <button type="button" className="solve-sm" disabled={!active.length || solving} onClick={() => void build()}>
              {t('obj.buildAgain')}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
