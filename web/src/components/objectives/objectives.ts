// Pure helpers for the Objectives screen.
import type { Meta, ObjAward, ObjCondition, ObjectiveGroupView, ObjectiveView } from '../../api';
import type { ObjStep } from '../../route';

type TFn = (key: string, params?: Record<string, string | number>) => string;

/** "Score with: Netherlands", "Starting 11: 2 × Eredivisie" ... (names as EA sends them). */
export function conditionLabel(c: ObjCondition, meta: Pick<Meta, 'names'>, t: TFn): string {
  const f = c.filter;
  const name = (kind: 'nation' | 'league' | 'club' | 'rarity', ids?: number[]) =>
    ids?.length ? ids.map((id) => meta.names[kind][id] ?? `#${id}`).join(' / ') : undefined;
  const what =
    name('nation', f.nation) ?? name('league', f.league) ?? name('club', f.club) ?? name('rarity', f.rarity) ??
    (f.position ? (f.preferredOnly ? `${f.position} (${t('obj.preferredOnly')})` : f.position) : undefined) ??
    (f.attr ? `${f.attr.min}+ ${f.attr.stat}` : '');
  // xi has _one / _other forms; t() only picks a plural form when `count` is passed
  return c.role === 'xi' ? t('obj.role.xi', { what, count: c.min }) : t(`obj.role.${c.role}`, { what });
}

/** Whole days and hours until endsAt (ms); null without an end or once it is over. */
export function timeLeft(endsAt: number | null, now: number): { days: number; hours: number } | null {
  if (endsAt === null || endsAt <= now) return null;
  const h = Math.floor((endsAt - now) / 3_600_000);
  return { days: Math.floor(h / 24), hours: h % 24 };
}

/** EA formation name -> "4-3-3", "4-3-3 (2)" for the a / b / c variants. */
export function formationLabel(f: string): string {
  const m = /^f(\d+)([a-z]?)$/.exec(f);
  if (!m) return f;
  const base = m[1].split('').join('-');
  return m[2] ? `${base} (${m[2].charCodeAt(0) - 95})` : base;
}

/** A reward as EA words it; without EA's description, its value and type ("500 coins"). */
export function awardText(a: ObjAward): string {
  const d = a.itemDataReduced?.description?.trim();
  return d || `${a.value} ${a.awardType}`;
}

/** The solver settings a squad was built with (global exclusions and max OVR). */
export interface SolveSettings {
  excludeIds: number[];
  maxRating: number;
}

const sameIds = (a: number[], b: number[]) => {
  const x = [...a].sort((p, q) => p - q);
  const y = [...b].sort((p, q) => p - q);
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

/**
 * The shown answer was solved for other ticks, another formation, another loan setting or other solver settings.
 * Older saves without `picked` / `loans` / settings are not judged on them.
 */
export function isStale(
  last: { picked?: number[]; formation: string; loans?: boolean; excludeIds?: number[]; maxRating?: number },
  active: number[], formation: string, loans = false, settings?: SolveSettings,
): boolean {
  if (!last.picked) return false;
  if (last.formation !== formation) return true;
  if (last.loans !== undefined && last.loans !== loans) return true;
  if (settings && last.excludeIds !== undefined && !sameIds(last.excludeIds, settings.excludeIds)) return true;
  if (settings && last.maxRating !== undefined && last.maxRating !== settings.maxRating) return true;
  return !sameIds(last.picked, active);
}

/** What the solver settings keep out of the squad (for the step 2 line); null when they take nothing out. */
export function settingsSummary(excludeIds: number[], maxRating: number): { excluded: number; maxRating: number | null } | null {
  const max = maxRating < 99 ? maxRating : null;
  return excludeIds.length || max !== null ? { excluded: excludeIds.length, maxRating: max } : null;
}

export const pickKey = (personaId: number) => `sbc-objectives-pick-${personaId}`;
export const resultKey = (personaId: number) => `sbc-objectives-result-${personaId}`;
export const formationKey = (personaId: number) => `sbc-objectives-formation-${personaId}`;

/** The step a deep link may show: formation needs a tick, the squad also needs an answer. */
export function reachableStep(want: ObjStep, picked: number, hasResult: boolean): ObjStep {
  if (want === 'pick' || picked === 0) return 'pick';
  if (want === 'squad' && !hasResult) return 'formation';
  return want;
}

export const loansKey = (personaId: number) => `sbc-objectives-loans-${personaId}`;
export const doneKey = (personaId: number) => `sbc-objectives-done-${personaId}`;

export type GroupSplit = ObjectiveGroupView & { done: ObjectiveView[] };

/**
 * Groups cut three ways: open objectives with a squad condition (tickable, kept in their group), done ones
 * (EA says so, or marked done by the user in `manual`; kept per group, so an all-done group stays) and open
 * ones without a squad condition (folded away, still under their group).
 */
export function splitGroups(groups: ObjectiveGroupView[], manual: number[] = []) {
  const marked = new Set(manual);
  const squad: GroupSplit[] = [];
  const other: ObjectiveGroupView[] = [];
  for (const g of groups) {
    const done = g.objectives.filter((o) => o.done || marked.has(o.id));
    const open = g.objectives.filter((o) => !o.done && !marked.has(o.id));
    const can = open.filter((o) => o.conditions.length > 0);
    const cannot = open.filter((o) => o.conditions.length === 0);
    if (can.length || done.length) squad.push({ ...g, objectives: can, done });
    if (cannot.length) other.push({ ...g, objectives: cannot });
  }
  return { squad, other, otherCount: other.reduce((n, g) => n + g.objectives.length, 0) };
}

/** Marked-done ids still worth keeping: the objective still exists and EA does not say it is done yet. */
export function pruneManual(manual: number[], groups: ObjectiveGroupView[]): number[] {
  const open = new Set(groups.flatMap((g) => g.objectives.filter((o) => !o.done).map((o) => o.id)));
  return manual.filter((id) => open.has(id));
}

/** Radio group keys: arrows move (and wrap), Home / End jump; null for any other key. */
export function radioMove(i: number, key: string, count: number): number | null {
  if (count <= 0) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return (i + 1) % count;
  if (key === 'ArrowLeft' || key === 'ArrowUp') return (i - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}

/** One entry per objective (first-seen order): covered only when every one of its conditions is met. */
export function objectiveCoverage(covers: { objectiveId: number; met: boolean }[]): { objectiveId: number; met: boolean }[] {
  const out = new Map<number, boolean>();
  for (const c of covers) out.set(c.objectiveId, (out.get(c.objectiveId) ?? true) && c.met);
  return [...out].map(([objectiveId, met]) => ({ objectiveId, met }));
}

/** The ticked ids without the objectives this squad does not cover. */
export function dropUncovered(picked: number[], coverage: { objectiveId: number; met: boolean }[]): number[] {
  const out = new Set(coverage.filter((c) => !c.met).map((c) => c.objectiveId));
  return picked.filter((id) => !out.has(id));
}
