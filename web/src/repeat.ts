// How often a set can still be done, from EA's repeatability fields.
import type { SbcSet } from './api';

export interface Repeat {
  kind: 'once' | 'unlimited' | 'limited';
  /** Times done: whole set for unlimited, this refresh window for limited, challenges for once. */
  done: number;
  limit: number | null; // null = no limit
  available: boolean;
  resetAt: number | null; // ms; limited sets only, when the window rolls over
}

/** Start (ms) of the current refresh window; windows tick from the set's release (the daily drop). */
function windowStart(set: SbcSet, now: number) {
  const interval = (set.repeatRefreshInterval ?? 86400) * 1000;
  const anchor = (set.releaseTime ?? 0) * 1000;
  return anchor + Math.floor((now - anchor) / interval) * interval;
}

export function repeatOf(set: SbcSet, now = Date.now()): Repeat {
  const mode = set.repeatabilityMode ?? (set.repeatable ? 'UNLIMITED' : 'NON_REPEATABLE');
  if (mode === 'UNLIMITED') return { kind: 'unlimited', done: set.timesCompleted, limit: null, available: true, resetAt: null };
  if (mode === 'REFRESH') {
    const limit = set.repeats ?? 1;
    const start = windowStart(set, now);
    // completions from an earlier window no longer count
    const fresh = (set.lastCompletedTime ?? 0) * 1000 >= start;
    const done = fresh ? Math.min(limit, set.timesCompletedInInterval ?? 0) : 0;
    const resetAt = start + (set.repeatRefreshInterval ?? 86400) * 1000;
    return { kind: 'limited', done, limit, available: done < limit, resetAt };
  }
  const done = set.challengesCompletedCount;
  return { kind: 'once', done, limit: set.challengesCount, available: done < set.challengesCount, resetAt: null };
}

type T = (key: string, params?: Record<string, string | number>) => string;

/** "25m" / "3h 10m" until a moment, in the user's language. */
export function untilText(t: T, ts: number, now = Date.now()) {
  const m = Math.max(1, Math.round((ts - now) / 60000));
  return m < 60 ? t('time.until.min', { m }) : t('time.until.hmin', { h: Math.floor(m / 60), m: m % 60 });
}
