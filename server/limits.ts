// In-memory fixed-window rate limits, per key (usually the client IP). One process serves the
// site, so no shared store is needed.

export interface Limiter {
  /** Counts a hit for `key`; false once `max` hits happened in the current window. */
  (key: string): boolean;
  size(): number;
}

export function createLimiter({ windowMs, max, now = Date.now }: { windowMs: number; max: number; now?: () => number }): Limiter {
  const windows = new Map<string, { start: number; count: number }>();
  let sweptAt = now();
  const hit = ((key: string) => {
    const t = now();
    if (t - sweptAt > windowMs) {
      for (const [k, w] of windows) if (t - w.start >= windowMs) windows.delete(k);
      sweptAt = t;
    }
    let w = windows.get(key);
    if (!w || t - w.start >= windowMs) windows.set(key, (w = { start: t, count: 0 }));
    return ++w.count <= max;
  }) as Limiter;
  hit.size = () => windows.size;
  return hit;
}
