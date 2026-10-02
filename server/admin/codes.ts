// Admin: promo codes (created here) and gift codes (bought by users), with who used them.
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { codes, pointLedger, redemptions, users } from '../db/schema.js';
import { generateCode, type parsePromo } from '../referrals.js';
import { PAGE_SIZE } from './query.js';

const row = (c: typeof codes.$inferSelect, ownerEmail: string | null) => ({
  code: c.code, kind: c.kind, ownerEmail, days: c.days, maxUses: c.maxUses, uses: c.uses,
  expiresAt: c.expiresAt?.getTime() ?? null, disabled: c.disabled, note: c.note, createdAt: c.createdAt.getTime(),
});
export type AdminCodeRow = ReturnType<typeof row>;

export async function listCodes(kind: 'promo' | 'gift', page: number) {
  const where = eq(codes.kind, kind);
  const [{ n }] = await db.select({ n: count() }).from(codes).where(where);
  const rows = await db.select({ c: codes, email: users.email }).from(codes).leftJoin(users, eq(users.id, codes.ownerId))
    .where(where).orderBy(desc(codes.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  return { rows: rows.map((r) => row(r.c, r.email)), total: n, page, pageSize: PAGE_SIZE };
}

export async function createPromo(p: NonNullable<ReturnType<typeof parsePromo>>): Promise<AdminCodeRow | 'codeTaken'> {
  const code = p.code ?? generateCode(8);
  const [c] = await db.insert(codes).values({ code, kind: 'promo', days: p.days, maxUses: p.maxUses, expiresAt: p.expiresAt, note: p.note })
    .onConflictDoNothing().returning();
  return c ? row(c, null) : 'codeTaken';
}

export async function setDisabled(code: string, disabled: boolean): Promise<boolean> {
  return (await db.update(codes).set({ disabled }).where(eq(codes.code, code)).returning({ c: codes.code })).length > 0;
}

export async function codeDetail(code: string) {
  const [c] = await db.select({ c: codes, email: users.email }).from(codes).leftJoin(users, eq(users.id, codes.ownerId)).where(eq(codes.code, code));
  if (!c) return null;
  const uses = await db.select({ userId: redemptions.userId, email: users.email, status: redemptions.status, at: redemptions.at })
    .from(redemptions).leftJoin(users, eq(users.id, redemptions.userId)).where(eq(redemptions.code, code)).orderBy(desc(redemptions.at));
  return { code: row(c.c, c.email), uses: uses.map((u) => ({ ...u, email: u.email ?? '', at: u.at.getTime() })) };
}

/** Points, inviter and invite count for the admin user screen. */
export async function referralOf(userId: string, invitedBy: string | null) {
  const [p] = await db.select({ n: sql<number>`coalesce(sum(${pointLedger.delta}),0)::int` }).from(pointLedger).where(eq(pointLedger.userId, userId));
  const [inv] = await db.select({ code: codes.code }).from(codes).where(and(eq(codes.ownerId, userId), eq(codes.kind, 'invite')));
  const [{ n }] = inv ? await db.select({ n: count() }).from(redemptions).where(and(eq(redemptions.code, inv.code), eq(redemptions.status, 'granted'))) : [{ n: 0 }];
  const [by] = invitedBy ? await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, invitedBy)) : [];
  return { points: p?.n ?? 0, invitedBy: by ?? null, invited: n, inviteCode: inv?.code ?? null };
}
