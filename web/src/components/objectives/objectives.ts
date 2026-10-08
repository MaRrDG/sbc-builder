// Pure helpers for the Objectives screen.
import type { Meta, ObjCondition } from '../../api';

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

export const pickKey = (personaId: number) => `sbc-objectives-pick-${personaId}`;
export const resultKey = (personaId: number) => `sbc-objectives-result-${personaId}`;
