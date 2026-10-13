// In-memory fixed-window rate limits, per key (usually the client IP, or a user id). One process serves the
// site, so no shared store is needed. An IPv6 key counts per /64 (one host usually holds the whole /64).
import { isIP } from 'node:net';

export interface Limiter {
  /** Counts a hit for `key`; false once `max` hits happened in the current window. */
  (key: string): boolean;
  size(): number;
}

/** The 8 groups of an IPv6 address as numbers (an embedded IPv4 tail fills the last 2); null when it is not IPv6. */
export function ipv6Groups(raw: string): number[] | null {
  const ip = raw.split('%')[0]!.toLowerCase(); // drop a zone id
  if (isIP(ip) !== 6) return null;
  const parts = (g: string) => (g ? g.split(':') : []).flatMap((x) => {
    if (!x.includes('.')) return [parseInt(x, 16)];
    const [a, b, c, d] = x.split('.').map(Number) as [number, number, number, number];
    return [(a << 8) | b, (c << 8) | d];
  });
  const [head, tail] = ip.includes('::') ? ip.split('::') : [ip, null];
  const h = parts(head!);
  if (tail === null) return h;
  const t = parts(tail);
  return [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill(0), ...t];
}

/**
 * The IPv4 inside an IPv4-mapped IPv6 address (::ffff:0:0/96) in any spelling: `::ffff:1.2.3.4`,
 * `::ffff:102:304`, `0:0:0:0:0:ffff:1.2.3.4`. null for anything else.
 */
export function mappedIpv4(raw: string): string | null {
  const g = ipv6Groups(raw);
  if (!g || g.length !== 8 || g.slice(0, 5).some((x) => x !== 0) || g[5] !== 0xffff) return null;
  return [g[6]! >> 8, g[6]! & 255, g[7]! >> 8, g[7]! & 255].join('.');
}

/** The bucket for a key: an IPv6 address becomes its /64, an IPv4-mapped one (any spelling) the IPv4; anything else stays as is. */
export function limitKey(key: string): string {
  const groups = ipv6Groups(key);
  if (!groups) return key;
  const v4 = mappedIpv4(key);
  if (v4) return v4;
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
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
