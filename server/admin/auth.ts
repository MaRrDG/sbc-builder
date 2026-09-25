// Admins are users whose (Clerk primary) email is in ADMIN_EMAILS.
import type { FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { SessionError } from '../ea.js';
import { siteUser } from '../auth.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';

// read on use: .env is loaded by initDb(), after this module is imported
export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? 'dragutmariotheodor1@gmail.com')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export async function isAdmin(userId: string): Promise<boolean> {
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  const email = row?.email.toLowerCase() ?? '';
  return !!email && adminEmails().includes(email);
}

export async function requireAdmin(req: FastifyRequest): Promise<string> {
  const userId = await siteUser(req);
  if (!(await isAdmin(userId))) throw new SessionError('Admins only.', 403, 'adminOnly');
  return userId;
}
