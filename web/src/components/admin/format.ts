export const getQuery = (query: string) => Object.fromEntries(new URLSearchParams(query));

/** New query string with `patch` applied; empty values are removed, `page` resets unless patched. */
export function setQuery(query: string, patch: Record<string, string | number | null>): string {
  const p = new URLSearchParams(query);
  if (!('page' in patch)) p.delete('page');
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === '' || v === 'all' || (k === 'page' && Number(v) <= 1)) p.delete(k);
    else p.set(k, String(v));
  }
  return p.toString();
}

export const shortDay = (day: string, lang: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(lang, { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** An SBC solve event's name as EA spells it: "Set › Challenge", just the set when the challenge
 * repeats it (single-challenge sets) or has no name, `null` (fall back to ids) when the set is unknown. */
export function solveTarget(setName?: string | null, challengeName?: string | null): string | null {
  const set = setName?.trim();
  if (!set) return null;
  const ch = challengeName?.trim();
  return ch && ch.toLowerCase() !== set.toLowerCase() ? `${set} › ${ch}` : set;
}

/** A date input value → end of that day in the admin's local time, as ISO (see docs/api.md admin/plan). */
export const untilEndOfDay = (date: string) => (date ? new Date(`${date}T23:59:59`).toISOString() : null);
