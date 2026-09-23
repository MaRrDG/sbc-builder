// Who is calling from the site: a Clerk session token (Authorization: Bearer) plus the EA persona
// they are looking at (X-Persona). The extension does not come through here; it keeps its key.
import type { FastifyRequest } from 'fastify';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { SessionError } from './ea.js';
import { accountById, type Account } from './accounts.js';
import { personaRow, setUserEmail, touchUser } from './db/users.js';

let secretKey = '';
let clerk: ReturnType<typeof createClerkClient> | null = null;
// tokens minted for another site must not work here
const PARTIES = (process.env.SITE_ORIGINS ??
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5178,http://127.0.0.1:5178,https://sbc-builder.mario-theodor.ro')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Call after initDb() (which loads .env). */
export function initAuth(): void {
  secretKey = process.env.CLERK_SECRET_KEY ?? '';
  if (!secretKey) throw new Error('CLERK_SECRET_KEY is not set');
  clerk = createClerkClient({ secretKey });
}

const signIn = () => new SessionError('Sign in first.', 401, 'signIn');
const seenAt = new Map<string, number>();

/** Keep users.last_seen_at roughly fresh without a write per request; fetch the email once. */
async function remember(id: string) {
  if (Date.now() - (seenAt.get(id) ?? 0) < 5 * 60 * 1000) return;
  seenAt.set(id, Date.now());
  const { email } = await touchUser(id);
  if (email || !clerk) return;
  try {
    const u = await clerk.users.getUser(id);
    await setUserEmail(id, u.primaryEmailAddress?.emailAddress ?? '');
  } catch (e) {
    console.error(`[auth] email for ${id} failed: ${(e as Error).message}`);
  }
}

export async function siteUser(req: FastifyRequest): Promise<string> {
  const h = req.headers.authorization;
  const token = typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw signIn();
  // a malformed token throws instead of returning errors
  const { data, errors } = await verifyToken(token, { secretKey, authorizedParties: PARTIES }).catch(() => {
    throw signIn();
  });
  // Clerk's JwtPayload collapses to `never` under TS 7 (index signature & `org_id?: never` union), so read sub loosely
  const sub = (data as { sub?: unknown } | undefined)?.sub;
  if (errors || typeof sub !== 'string' || !sub) throw signIn();
  await remember(sub);
  return sub;
}

export async function siteAccount(req: FastifyRequest): Promise<Account> {
  const userId = await siteUser(req);
  const raw = req.headers['x-persona'];
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) throw new SessionError('Pick an EA account first.', 400, 'noPersona');
  const row = await personaRow(id);
  const acc = accountById(id);
  if (row?.userId === userId && acc) return acc;
  if (row?.previousUserId === userId)
    throw new SessionError('This EA account is now linked to another FC Solver user.', 403, 'personaTakenOver');
  throw new SessionError('This EA account is not linked to you.', 403, 'personaNotYours');
}

/** For endpoints that also work signed out (/api/meta). */
export async function optionalSiteAccount(req: FastifyRequest): Promise<Account | null> {
  if (!req.headers.authorization || !req.headers['x-persona']) return null;
  try {
    return await siteAccount(req);
  } catch {
    return null;
  }
}
