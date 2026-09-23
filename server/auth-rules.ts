// Pure rules for linking EA personas to FC Solver users.
import { createHash, randomBytes } from 'node:crypto';

export type LinkDecision = 'already' | 'link' | 'needSid' | 'takeover';

/**
 * A persona nobody owns (or already ours) links on the key the extension holds.
 * Owned by someone else: only a fresh EA session proof (SID) moves it.
 */
export function linkDecision(owner: string | null, userId: string, provedBySid: boolean): LinkDecision {
  if (owner === userId) return 'already';
  if (owner === null) return 'link';
  return provedBySid ? 'takeover' : 'needSid';
}

export const newLinkToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
