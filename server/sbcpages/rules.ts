// Which SBC sets get a public page and how they are addressed. Pure: no DB, no clock reads.

export const SITEMAP_GRACE_DAYS = 60;
export const STATS_MIN_SOLVERS = 5;

export function slugify(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

export const setPath = (setId: number, name: string) => `/sbcs/${slugify(name) || 'sbc'}-${setId}`;

/** `marquee-matchups-16` → id 16; the slug part is only used to redirect to the current one. */
export function parseSetSlug(segment: string): { setId: number; slug: string } | null {
  const m = /^(?:([a-z0-9-]*)-)?(\d{1,9})$/.exec(segment);
  if (!m) return null;
  const setId = Number(m[2]);
  return setId > 0 ? { setId, slug: m[1] ?? '' } : null;
}

export function isPublic(s: { raw: { releaseTime?: number; hidden?: boolean } }, vouchedCount: number, nowSec: number): boolean {
  if (!(vouchedCount >= 1) || s.raw.hidden === true) return false;
  return !s.raw.releaseTime || s.raw.releaseTime <= nowSec;
}

export const isExpired = (endTime: number | null, nowSec: number) => !!endTime && endTime < nowSec;
export const inSitemap = (endTime: number | null, nowSec: number) => !endTime || endTime + SITEMAP_GRACE_DAYS * 86400 >= nowSec;

/** One reward line in English (EA sends no pack names with SBC awards). */
export function formatAward(a: unknown): string | null {
  if (!a || typeof a !== 'object') return null;
  const x = a as { type?: unknown; value?: unknown; count?: number; isUntradeable?: boolean; itemDataReduced?: { description?: unknown } };
  if (typeof x.type !== 'string' || !x.type) return null;
  const times = x.count && x.count > 1 ? `${x.count}× ` : '';
  if (x.type === 'coin') {
    return typeof x.value === 'number' && Number.isFinite(x.value) ? `${x.value.toLocaleString('en-US')} coins` : null;
  }
  if (x.type === 'pack') return `${times}Pack${x.isUntradeable ? ' (untradeable)' : ''}`;
  if (x.type === 'item') {
    const d = x.itemDataReduced?.description;
    return typeof d === 'string' && d ? d : 'Item';
  }
  return `${times}${x.type[0].toUpperCase()}${x.type.slice(1)}`;
}
