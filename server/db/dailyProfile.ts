// Daily leaderboard profile of a user (username, opt-in, asked once) and the leaderboard's source rows.
import { and, eq, isNotNull, sql } from 'drizzle-orm';
import { db } from './index.js';
import { dailyPlays, users } from './schema.js';
import type { Play } from '../daily/streak.js';

export interface DailyProfile { username: string | null; leaderboard: boolean; asked: boolean }

export async function profileOf(userId: string): Promise<DailyProfile> {
  const [r] = await db.select({ username: users.username, leaderboard: users.leaderboard, askedAt: users.leaderboardAskedAt })
    .from(users).where(eq(users.id, userId));
  return { username: r?.username ?? null, leaderboard: !!r?.leaderboard, asked: !!r?.askedAt };
}

/** Any update also marks the prompt as answered. A taken username maps the unique-index error. */
export async function updateProfile(userId: string, p: { username?: string; leaderboard?: boolean; asked?: boolean }):
  Promise<DailyProfile | 'usernameTaken' | 'usernameRequired'> {
  const cur = await profileOf(userId);
  const username = p.username ?? cur.username;
  if (p.leaderboard && !username) return 'usernameRequired';
  try {
    await db.update(users).set({
      ...(p.username !== undefined ? { username: p.username } : {}),
      ...(p.leaderboard !== undefined ? { leaderboard: p.leaderboard } : {}),
      leaderboardAskedAt: sql`coalesce(${users.leaderboardAskedAt}, now())`,
    }).where(eq(users.id, userId));
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    if (err.code === '23505' || err.cause?.code === '23505') return 'usernameTaken';
    throw e;
  }
  return profileOf(userId);
}

export async function clearUsername(userId: string): Promise<boolean> {
  const r = await db.update(users).set({ username: null, leaderboard: false }).where(eq(users.id, userId)).returning({ id: users.id });
  return r.length > 0;
}

/** Finished plays per user; public = opted in with a username, admin = everyone who played. */
export async function leaderboardSource(all: boolean) {
  const rows = await db.select({
    userId: dailyPlays.userId, day: dailyPlays.day, won: dailyPlays.won, guesses: dailyPlays.guesses,
    username: users.username, email: users.email, leaderboard: users.leaderboard,
  }).from(dailyPlays).innerJoin(users, eq(users.id, dailyPlays.userId))
    .where(all ? isNotNull(dailyPlays.finishedAt) : and(isNotNull(dailyPlays.finishedAt), eq(users.leaderboard, true), isNotNull(users.username)));
  const by = new Map<string, { userId: string; username: string | null; email: string; leaderboard: boolean; plays: Play[] }>();
  for (const r of rows) {
    let u = by.get(r.userId);
    if (!u) by.set(r.userId, (u = { userId: r.userId, username: r.username, email: r.email, leaderboard: r.leaderboard, plays: [] }));
    u.plays.push({ day: r.day, won: r.won, guesses: r.guesses.length });
  }
  return [...by.values()];
}
