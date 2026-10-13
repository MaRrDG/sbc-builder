// In-memory fixed-window rate limits, per key (usually the client IP, or a user id). One process serves the
// site, so no shared store is needed. An IPv6 key counts per /64 (one host usually holds the whole /64).
import { isIP } from 'node:net';

export interface Limiter {
  /** Counts a hit for `key`; false once `max` hits happened in the current window. */
  (key: string): boolean;
  size(): number;
}

/** The bucket for a key: an IPv6 address becomes its /64, an IPv4-mapped one (::ffff:a.b.c.d) the IPv4; anything else stays as is. */
export function limitKey(key: string): string {
  const ip = key.split('%')[0]!; // drop a zone id
  if (isIP(ip) !== 6) return key;
  const lower = ip.toLowerCase();
  if (lower.startsWith('::ffff:') && isIP(lower.slice(7)) === 4) return lower.slice(7);
  const [head, tail] = lower.includes('::') ? lower.split('::') : [lower, null];
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const width = (g: string[]) => g.reduce((n, x) => n + (x.includes('.') ? 2 : 1), 0); // an IPv4 tail fills 2 groups
  const groups = tail === null ? h : [...h, ...Array(Math.max(0, 8 - width(h) - width(t))).fill('0'), ...t];
  return `${groups.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(':')}::/64`;
}

export function createLimiter({ windowMs, max, now = Date.now }: { windowMs: number; max: number; now?: () => number }): Limiter {
  const windows = new Map<string, { start: number; count: number }>();
  let sweptAt = now();
  const hit = ((raw: string) => {
    const key = limitKey(raw);
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
