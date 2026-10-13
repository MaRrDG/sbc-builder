// Salted, truncated IP hashes for the admin event log (`ipHash` on redeem / points / daily_win events): two
// accounts on one network share a hash, so an admin can group them, but the raw IP is never stored. Pure apart
// from `ipHash()`, which reads the salt from the env.
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { limitKey } from './limits.js';

/** The network an address belongs to: IPv4 → its /24, IPv6 → its /64 (an IPv4-mapped one → the IPv4 /24); null for a non-IP. */
export function ipPrefix(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const ip = raw.trim().split('%')[0]!;
  const v = isIP(ip);
  if (!v) return null;
  const key = v === 6 ? limitKey(ip) : ip; // limitKey: IPv6 → "a:b:c:d::/64", IPv4-mapped (any spelling) → "x.y.z.w"
  if (isIP(key) === 4) return `${key.split('.').slice(0, 3).join('.')}.0/24`;
  return key;
}

/** First 16 hex of SHA-256(salt + prefix); null when there is no IP. */
export function hashIp(raw: string | null | undefined, salt: string): string | null {
  const p = ipPrefix(raw);
  return p === null ? null : createHash('sha256').update(salt + p).digest('hex').slice(0, 16);
}

/** IP_HASH_SALT, else a hash of an existing server secret (the secret itself is never used or logged as is). */
export function ipSalt(env: Record<string, string | undefined> = process.env): string {
  if (env.IP_HASH_SALT) return env.IP_HASH_SALT;
  const base = env.EMAIL_SECRET || env.CLERK_SECRET_KEY || env.DAILY_SECRET || '';
  return createHash('sha256').update(`fc-solver ip-hash salt:${base}`).digest('hex');
}

let salt: string | null = null;
/** The hash for a request IP with the server's salt. */
export function ipHash(raw: string | null | undefined): string | null {
  return hashIp(raw, (salt ??= ipSalt()));
}
