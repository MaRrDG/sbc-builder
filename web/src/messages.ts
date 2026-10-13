// Server errors and solver reasons, in the user's language. Codes come from the server; anything
// without a code (or an older saved result) is shown as the server wrote it.
import { ApiError, type Reason } from './api';

type T = (key: string, params?: Record<string, string | number>) => string;

export function errorText(e: unknown, t: T): string {
  if (e instanceof ApiError && e.code) {
    // a date from the server (YYYY-MM-DD) reads in the site language
    if (e.code === 'usernameCooldown' && typeof e.params?.date === 'string') {
      const d = new Date(`${e.params.date}T00:00:00Z`);
      if (!Number.isNaN(d.getTime()))
        return t('err.usernameCooldown', { ...e.params, date: d.toLocaleDateString(document.documentElement.lang || 'en', { dateStyle: 'long', timeZone: 'UTC' }) });
    }
    return t(`err.${e.code}`, e.params);
  }
  if (e instanceof TypeError) return t('err.network'); // fetch itself failed
  return (e as Error)?.message ?? String(e);
}

export function reasonText(r: Reason | string, t: T): string {
  if (typeof r === 'string') return r;
  const hidden = r.hidden ? ` ${t('reason.hidden', { count: r.hidden })}` : '';
  switch (r.code) {
    case 'points':
      return t('reason.points', { have: r.have ?? 0, need: r.need ?? 0, count: r.need ?? 0 }) + (r.hidden ? ` ${t('reason.pointsHidden', { count: r.hidden })}` : '');
    case 'pool':
      return t('reason.pool', { have: r.have ?? 0, need: r.need ?? 11 }) + hidden;
    case 'count':
      return t('reason.count', { req: r.req ?? '', have: r.have ?? 0 }) + hidden;
    case 'sameGroup':
      return t('reason.sameGroup', { req: r.req ?? '', have: r.have ?? 0 }) + hidden;
    case 'distinct':
      return t('reason.distinct', { req: r.req ?? '', have: r.have ?? 0 });
    case 'rating':
      return (
        t('reason.rating', { req: r.req ?? '', need: r.need ?? 11, have: r.have ?? 0 }) +
        (r.all && r.all > (r.have ?? 0) ? ` ${t('reason.ratingAll', { all: r.all })}` : '')
      );
    default:
      return t('reason.combo');
  }
}
