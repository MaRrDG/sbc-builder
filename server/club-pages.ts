// The club pages one sync job loaded, keyed by their start offset. Pages may reach the server in
// any order; the club is only whole once page 0 through a short (last) page are all there.

/** start -> the page: its players, how many items EA returned, and whether that was fewer than asked (the last page). */
export type ClubPages = Map<number, { items: { id: number }[]; size: number; last: boolean }>;

/** `raw` is how many items EA returned, before non-players were filtered out. */
export function addClubPage<T extends { id: number }>(pages: ClubPages, start: number, count: number, items: T[], raw: number) {
  pages.set(start, { items, size: raw, last: raw < count });
}

/** Every player of the club, or null while a page is missing or the last page has not come. */
export function assembleClub<T extends { id: number }>(pages: ClubPages): T[] | null {
  const byId = new Map<number, T>();
  const starts = [...pages.keys()].sort((a, b) => a - b);
  let next = 0;
  for (const start of starts) {
    if (start > next) return null; // a gap
    const page = pages.get(start)!;
    for (const i of page.items) byId.set(i.id, i as T);
    next = Math.max(next, start + page.size);
    if (page.last) return [...byId.values()];
    if (page.size === 0) return null;
  }
  return null;
}
