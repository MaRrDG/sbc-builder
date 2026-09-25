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

/** A date input value → end of that day in the admin's local time, as ISO (see docs/api.md admin/plan). */
export const untilEndOfDay = (date: string) => (date ? new Date(`${date}T23:59:59`).toISOString() : null);
