// The Discord bot's calls to /api/bot/*: a shared secret (BOT_API_TOKEN), compared in constant time.
import { createHash, timingSafeEqual } from 'node:crypto';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** False when the token is not configured (or under 32 chars): the bot API is then off. */
export function botTokenOk(sent: unknown, expected: string | undefined): boolean {
  if (!expected || expected.length < 32 || typeof sent !== 'string' || !sent) return false;
  return timingSafeEqual(digest(sent), digest(expected));
}
