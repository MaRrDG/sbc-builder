// ETags for the big dashboard GETs (/api/club, /api/meta, /api/sets): the browser revalidates and an
// unchanged answer costs a 304 with no body.
import { createHash } from 'node:crypto';

export const etagOf = (json: string) => `"${createHash('sha1').update(json).digest('base64url').slice(0, 22)}"`;

export function notModified(ifNoneMatch: string | string[] | undefined, etag: string): boolean {
  const raw = Array.isArray(ifNoneMatch) ? ifNoneMatch.join(',') : ifNoneMatch ?? '';
  return raw.split(',').some((t) => t.trim().replace(/^W\//, '') === etag);
}
