// Objectives squad (Premium), a three-step wizard: pick the objectives you are playing → pick a formation →
// the strongest squad from the club that covers their squad conditions. The step lives in the URL
// (/dashboard/objectives[/formation|/squad]), so browser Back goes back a step. Objective names / texts and
// player / nation / league names are EA's; only our own labels are translated.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowsClockwise, Check, HourglassMedium, CheckCircle, CheckSquare, Gift, HandPointing, SoccerBall, Square, UsersThree, Warning, XCircle } from '@phosphor-icons/react';
import { api, ApiError, type Challenge, type Meta, type ObjAward, type ObjCondition, type Player, type ObjectiveGroupView, type ObjectiveView, type ObjectivesResponse, type ObjectivesSolve, type SolveResult } from '../../api';
import { useAgo, useI18n } from '../../i18n';
import { errorText } from '../../messages';
import type { ObjStep } from '../../route';
import { layout, Pitch } from '../Pitch';
import { awardText, conditionLabel, doneKey, loansKey, formationKey, formationLabel, isStale, pickKey, pruneManual, radioMove, reachableStep, resultKey, splitGroups, timeLeft, objectiveCoverage, dropUncovered, type GroupSplit } from './objectives';

const ROLE_ICON = { score: SoccerBall, assist: HandPointing, xi: UsersThree } as const;
const NO_IDS = new Set<number>();
const NO_PLACED = new Map<number, Player>();
const STEPS: ObjStep[] = ['pick', 'formation', 'squad'];

/** The last answer plus the ticks it was solved for (saves from before this have no `picked`). */
type Saved = ObjectivesSolve & { picked?: number[]; loans?: boolean };

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

/** "Mark as done" / "Undo" for the user who plays on console while the web app (and EA's progress) stays shut. */
function MarkButton({ id, marked, onMark }: { id: number; marked: boolean; onMark: (id: number, done: boolean) => void }) {
  const { t } = useI18n();
  return (
    <button type="button" className="obj-link obj-mark" aria-describedby={`obj-name-${id}`} onClick={() => onMark(id, !marked)}>
      {marked ? t('obj.undo') : t('obj.markDone')}
    </button>
  );
}

/** Done objectives of one group (EA says so, or marked by the user), folded away: ✓ + "Done", never tickable. */
function DoneObjectives({ objectives, manual, onMark }: {
  objectives: ObjectiveView[]; manual: Set<number>; onMark?: (id: number, done: boolean) => void;
}) {
  const { t } = useI18n();
  if (!objectives.length) return null;
  return (
    <details className="obj-done">
      <summary>{t('obj.doneList', { n: objectives.length })}</summary>
      <ul>
        {objectives.map((o) => {
          const mine = manual.has(o.id) && !o.done;
          return (
            <li key={o.id}>
              <span className="obj-done-state">
                <CheckCircle weight="fill" aria-hidden="true" /> {t('obj.done')}
              </span>
              <span className="obj-name" id={`obj-name-${o.id}`}>{o.name}</span>
              <span className="obj-progress">{o.progress}/{o.target}</span>
              {mine && (
                <span className="obj-done-mine">
                  {t('obj.markedByYou')}
                  {onMark && <MarkButton id={o.id} marked onMark={onMark} />}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** The groups' tickable objectives, one checkbox each, done ones folded per group (also the Premium demo). Pass groups through splitGroups first. */
export function ObjectiveGroups({ groups, meta, picked, onToggle, now, manual = NO_IDS, onMark }: {
  groups: GroupSplit[]; meta: Pick<Meta, 'names'>; picked: number[]; onToggle: (id: number) => void; now: number;
  manual?: Set<number>; onMark?: (id: number, done: boolean) => void;
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
            {g.objectives.length > 0 && (
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
                        <span className="obj-name" id={`obj-name-${o.id}`}>{o.name}</span>
                        <span className="obj-progress">{o.progress}/{o.target}</span>
                      </button>
                      <div className="obj-body">
                        <p className="obj-desc" id={`obj-desc-${o.id}`}>{o.description}</p>
                        <Pills conditions={o.conditions} meta={meta} />
                        {(o.awards.length > 0 || onMark) && (
                          <div className="obj-foot">
                            <Rewards awards={o.awards} />
                            {onMark && <MarkButton id={o.id} marked={false} onMark={onMark} />}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <DoneObjectives objectives={g.done} manual={manual} onMark={onMark} />
          </article>
        );
      })}
    </div>
  );
}

/** Objectives FC Solver cannot build a squad for, folded into one block so they never mix with the tickable ones. */
function OtherObjectives({ groups, count, onMark }: { groups: ObjectiveGroupView[]; count: number; onMark: (id: number, done: boolean) => void }) {
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
                <span className="obj-name" id={`obj-name-${o.id}`}>{o.name}</span>
                <span className="obj-progress">{o.progress}/{o.target}</span>
                <MarkButton id={o.id} marked={false} onMark={onMark} />
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
  // objectives the user marked done (played on console, EA's progress not refreshed yet)
  const [manual, setManual] = useState<number[]>(() => readJson(doneKey(personaId), []));
  // loan players run out after a few matches: only used when the user says so
  const [loans, setLoans] = useState<boolean>(() => readJson<unknown>(loansKey(personaId), false) === true);
  const [solving, setSolving] = useState(false);
  // the last Build failed outright (network / server): shown on step 3 instead of an older squad
  const [buildError, setBuildError] = useState<unknown>(null);
  // step 3 was reached through Build: the stale hint is only for someone who comes back to an old squad
  const [fresh, setFresh] = useState(false);
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
        // EA now says it is done, or it is gone: the manual mark is no longer needed
        setManual((m) => pruneManual(m, d.groups));
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
  useEffect(() => writeJson(doneKey(personaId), manual), [personaId, manual]);
  useEffect(() => writeJson(loansKey(personaId), loans), [personaId, loans]);
  useEffect(() => {
    if (chosen) writeJson(formationKey(personaId), chosen);
  }, [personaId, chosen]);

  const split = useMemo(() => splitGroups(data?.groups ?? [], manual), [data, manual]);
  const manualSet = useMemo(() => new Set(manual), [manual]);
  const open = useMemo(() => new Map(split.squad.flatMap((g) => g.objectives.map((o) => [o.id, o] as const))), [split]);
  // a ticked objective that has since been done (or has left the web app) drops out
  const active = picked.filter((id) => open.has(id));
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const mark = (id: number, done: boolean) => {
    setManual((m) => (done ? (m.includes(id) ? m : [...m, id]) : m.filter((x) => x !== id)));
    if (done) setPicked((p) => p.filter((x) => x !== id));
  };

  // picked here, else the active squad's (if the web app loaded it), else 4-3-3
  const valid = (f: string | null | undefined): f is string => !!f && Object.hasOwn(meta.formations, f);
  const mine = valid(data?.formation) ? data.formation : null;
  const formation = valid(chosen) ? chosen : mine ?? (valid('f433') ? 'f433' : Object.keys(meta.formations)[0] ?? '');
  const formations = useMemo(
    () => Object.keys(meta.formations).sort((a, b) => formationLabel(a).localeCompare(formationLabel(b), undefined, { numeric: true })),
    [meta],
  );

  // a deep link past what is done lands on the earliest incomplete step (judged once the objectives are in)
  const hasSquad = !!result || solving || buildError !== null;
  const reach = reachableStep('squad', active.length, hasSquad);
  const shownStep = data ? reachableStep(step, active.length, hasSquad) : step;
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

  // leaving step 3 ends that visit: an outright failure is forgotten, a later return may see the stale hint
  useEffect(() => {
    if (shownStep === 'squad') return;
    setFresh(false);
    setBuildError(null);
  }, [shownStep]);

  const build = async () => {
    if (!active.length || solving) return;
    setSolving(true);
    setBuildError(null);
    setFresh(true);
    if (step !== 'squad') onStep('squad');
    try {
      const r = await api.solveObjectives({ objectiveIds: active, formation, options: { excludeIds, maxRating, includeLoans: loans } });
      const saved: Saved = { ...r, picked: active, loans };
      setResult(saved);
      writeJson(resultKey(personaId), saved);
    } catch (e) {
      // persona errors go to App (reloads who we are); anything else is shown in place on step 3
      if (e instanceof ApiError && (e.code === 'personaNotYours' || e.code === 'personaTakenOver')) onError(e);
      setBuildError(e);
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
        {open.size === 0 && (
          <div className="obj-empty">
            <Warning weight="bold" aria-hidden="true" />
            <p>{t('obj.noneTickable')}</p>
          </div>
        )}
        <ObjectiveGroups groups={split.squad} meta={meta} picked={active} onToggle={toggle} now={now} manual={manualSet} onMark={mark} />
        <OtherObjectives groups={split.other} count={split.otherCount} onMark={mark} />
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
          <p className="obj-summary-loans">
            <HourglassMedium weight="bold" aria-hidden="true" /> {loans ? t('obj.loansOn') : t('obj.loansOff')}
          </p>
        </div>
        <div className="obj-step-head">
          <h2 ref={headRef} tabIndex={-1} id="obj-formation-title">{t('obj.formationTitle')}</h2>
        </div>
        <FormationTiles meta={meta} formations={formations} value={formation} mine={mine} onChange={setChosen} labelledBy="obj-formation-title" />
        <label className="obj-setting">
          <input type="checkbox" checked={loans} onChange={(e) => setLoans(e.target.checked)} aria-describedby="obj-loans-hint" />
          <span>
            <span className="obj-setting-label">{t('obj.useLoans')}</span>
            <span className="obj-setting-hint" id="obj-loans-hint">{t('obj.useLoansHint')}</span>
          </span>
        </label>
        <div className="obj-bar">
          <button type="button" className="ghost" onClick={() => onStep('pick')}>{t('obj.back')}</button>
          <button type="button" className="solve-sm" disabled={!active.length || solving} onClick={() => void build()}>
            {t('obj.build')}
          </button>
        </div>
      </section>
    );

  // Step 3. While solving: the picked conditions on an empty squad; after: the answer (or why there is none).
  const shown = result && !solving && buildError === null ? result : null;
  // the stale hint is for someone who comes back to an older squad, never right after Build
  const stale = !!shown && !fresh && isStale(shown, active, formation, loans);
  // partial: a full XI that covers some of the picks (as many as fit); failed: no XI, or none of the picks covered
  const partial = !!shown && !shown.found && shown.partial === true;
  const failed = !!shown && !shown.found && !partial;
  const coverage = shown ? objectiveCoverage(shown.covers) : [];
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
  // many: more than one objective picked (only then can a reason point at "your other picks")
  const reasonText = (r: ObjectivesSolve['reasons'][number], formationName: string, many: boolean): string => {
    switch (r.code) {
      case 'noMatch':
        return t('obj.reason.noMatch', { what: conditionLabel(r.condition, meta, t) });
      case 'noSlot': {
        const pos = r.condition.filter.position;
        const head = pos
          ? t('obj.reason.noSlotPos', { formation: formationName, position: pos })
          : t('obj.reason.noSlot', { formation: formationName, what: conditionLabel(r.condition, meta, t) });
        const tail = r.formations.length
          ? t('obj.reason.tryFormations', { list: r.formations.map(formationLabel).join(', ') })
          : t('obj.reason.pickFormation');
        return `${head} ${tail}`;
      }
      case 'selfClash':
        return t('obj.reason.selfClash', { formation: formationName });
      case 'timeout':
        return many ? t('obj.reason.timeout', { formation: formationName }) : t('obj.reason.timeoutAlone', { formation: formationName });
      default: // combo: per objective it clashes with the others; the old whole-problem answer has no objectiveId
        return r.objectiveId !== undefined && many
          ? t('obj.reason.clash', { formation: formationName })
          : t('obj.reason.combo', { formation: formationName });
    }
  };
  const many = coverage.length > 1;
  const partialPanel = partial && shown && (
    <div className="obj-partial" role="status">
      <h3>
        <Warning weight="fill" aria-hidden="true" />{' '}
        {t('obj.partialTitle', { covered: coverage.filter((c) => c.met).length, count: coverage.length })}
      </h3>
      <ul className="obj-covers">
        {coverage.map((c) => (
          <li key={c.objectiveId} className={c.met ? 'is-met' : 'is-miss'}>
            {c.met ? <CheckCircle className="tick" weight="fill" aria-label={t('obj.met')} /> : <XCircle className="tick" weight="fill" aria-label={t('obj.notMet')} />}
            <span>
              <strong>{nameOf(c.objectiveId) || `#${c.objectiveId}`}</strong>
              {!c.met &&
                shown.reasons
                  .filter((r) => r.objectiveId === c.objectiveId)
                  .map((r, i) => <span key={i} className="obj-why">{reasonText(r, formationLabel(shown.formation), many)}</span>)}
            </span>
          </li>
        ))}
      </ul>
      {shown.optimal === false && <p className="obj-why">{t('obj.partialNotProven')}</p>}
      {!stale && (
        // Change formation / Edit objectives are in the bar below; this one also unticks what is not covered
        <div className="obj-fail-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              setPicked((p) => dropUncovered(p, coverage));
              onStep('pick');
            }}
          >
            {t('obj.dropUncovered')}
          </button>
        </div>
      )}
    </div>
  );
  const buildAgain = (
    <button type="button" className="solve-sm" disabled={!active.length || solving} onClick={() => void build()}>
      {t('obj.buildAgain')}
    </button>
  );

  return (
    <section className="objectives-view">
      {head}
      {stepper}
      <div className="obj-step-head">
        <h2 ref={headRef} tabIndex={-1}>{t('obj.resultTitle')}</h2>
        <p className="muted">{t('obj.inFormation', { formation: formationLabel(shown?.formation ?? formation) })}</p>
      </div>
      {stale && (
        <p className="obj-stale" role="status">
          <ArrowsClockwise weight="bold" aria-hidden="true" /> {t('obj.stale')}
        </p>
      )}

      {buildError !== null && !solving ? (
        <div className="obj-fail" role="alert">
          <h3>
            <XCircle weight="fill" aria-hidden="true" /> {t('obj.buildFailed')}
          </h3>
          <p className="obj-fail-text">{errorText(buildError, t)}</p>
          <div className="obj-fail-actions">
            {buildAgain}
            {backActions}
          </div>
        </div>
      ) : failed ? (
        // no squad: the reasons and the ways out, not an empty pitch
        <div className="obj-fail" role="alert">
          <h3>
            <XCircle weight="fill" aria-hidden="true" /> {t('obj.failTitle')}
          </h3>
          {shown.reasons.length > 0 && (
            <ul>
              {shown.reasons.map((r, i) => (
                <li key={i}>
                  {r.objectiveId !== undefined && nameOf(r.objectiveId) && <strong>{nameOf(r.objectiveId)}: </strong>}
                  {reasonText(r, formationLabel(shown.formation), many)}
                </li>
              ))}
            </ul>
          )}
          <div className="obj-fail-actions">
            {stale && buildAgain}
            {backActions}
          </div>
        </div>
      ) : (
        <>
          {partialPanel}
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
                loanBadge
                badges={badges}
              />
            </div>
            <aside className="obj-side" aria-label={t('obj.summary')}>
              {solving || !shown ? (
                <p className="muted" role="status">{t('obj.solving')}</p>
              ) : (
                <>
                  <dl className="obj-stats">
                    <div>
                      <dt>{t('pitch.rating')}</dt>
                      <dd>{shown.eval?.rating ?? 0}</dd>
                    </div>
                    <div>
                      <dt>{t('pitch.chemistry')}</dt>
                      <dd>{shown.eval?.chemistry ?? 0}/33</dd>
                    </div>
                  </dl>
                  <h3>{t('obj.step.pick')}</h3>
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
                </>
              )}
            </aside>
          </div>
        </>
      )}

      {!failed && buildError === null && (
        <div className="obj-bar">
          <div className="obj-bar-left">{backActions}</div>
          {stale && buildAgain}
        </div>
      )}
    </section>
  );
}
