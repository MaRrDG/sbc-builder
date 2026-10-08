// Postgres side of the Daily game (rules live in server/daily/*).
import { and, asc, desc, eq, gte, isNotNull, sql } from 'drizzle-orm';
import { db } from './index.js';
import { dailyAnonStats, dailyAnswers, dailyGuessCounts, dailyPlays, players, pointLedger, users } from './schema.js';
import type { PlayerRow } from '../daily/types.js';
import { applyGuess, type GuessError, type Progress } from '../daily/game.js';
import { pointsFor, streakOf, type Play } from '../daily/streak.js';
import type { AnonDay } from '../daily/summary.js';

const toRow = (r: typeof players.$inferSelect): PlayerRow => ({
  ...r, cardType: r.cardType as PlayerRow['cardType'], firstSeen: r.firstSeen.getTime(), lastSeen: r.lastSeen.getTime(),
});

export async function allPlayers(): Promise<PlayerRow[]> {
  return (await db.select().from(players)).map(toRow);
}

export async function upsertPlayers(rows: PlayerRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += 500) {
    const chunk = rows.slice(i, i + 500).map((r) => ({ ...r, firstSeen: new Date(r.firstSeen), lastSeen: new Date(r.lastSeen) }));
    await db.insert(players).values(chunk).onConflictDoUpdate({
      target: players.assetId,
      set: {
        name: sql`excluded.name`, fullName: sql`excluded.full_name`, nation: sql`excluded.nation`, league: sql`excluded.league`,
        club: sql`excluded.club`, position: sql`excluded.position`, rating: sql`excluded.rating`, rareflag: sql`excluded.rareflag`,
        cardType: sql`excluded.card_type`, baseClubs: sql`excluded.base_clubs`, lastSeen: sql`excluded.last_seen`,
      },
    });
  }
}

export async function firstAnswer(): Promise<{ day: number; dropAt: number } | null> {
  const [r] = await db.select({ day: dailyAnswers.day, dropAt: dailyAnswers.dropAt }).from(dailyAnswers).orderBy(asc(dailyAnswers.day)).limit(1);
  return r ? { day: r.day, dropAt: r.dropAt.getTime() } : null;
}

export async function answerFor(day: number): Promise<{ day: number; date: string; assetId: number } | null> {
  const [r] = await db.select({ day: dailyAnswers.day, date: dailyAnswers.date, assetId: dailyAnswers.assetId }).from(dailyAnswers).where(eq(dailyAnswers.day, day));
  return r ?? null;
}

export async function insertAnswer(a: { day: number; date: string; dropAt: number; assetId: number }): Promise<void> {
  await db.insert(dailyAnswers).values({ ...a, dropAt: new Date(a.dropAt) }).onConflictDoNothing();
}

export async function answersSince(day: number): Promise<number[]> {
  return (await db.select({ a: dailyAnswers.assetId }).from(dailyAnswers).where(gte(dailyAnswers.day, day))).map((r) => r.a);
}

export async function playsOf(userId: string, tx: Pick<typeof db, 'select'> = db): Promise<Play[]> {
  const rows = await tx.select({ day: dailyPlays.day, won: dailyPlays.won, guesses: dailyPlays.guesses }).from(dailyPlays)
    .where(and(eq(dailyPlays.userId, userId), isNotNull(dailyPlays.finishedAt)));
  return rows.map((r) => ({ day: r.day, won: r.won, guesses: r.guesses.length }));
}

export async function playOf(userId: string, day: number): Promise<number[]> {
  const [r] = await db.select({ g: dailyPlays.guesses }).from(dailyPlays).where(and(eq(dailyPlays.userId, userId), eq(dailyPlays.day, day)));
  return r?.g ?? [];
}

/** One guess of a signed-in user, under a row lock: two tabs cannot add two guesses or two point grants. */
export async function guessDaily(userId: string, day: number, answer: number, guess: number, known: (id: number) => boolean):
  Promise<{ progress: Progress; points: { added: number; streak: number } | null } | { error: GuessError }> {
  return db.transaction(async (tx) => {
    await tx.insert(dailyPlays).values({ userId, day }).onConflictDoNothing();
    const [cur] = await tx.select({ g: dailyPlays.guesses }).from(dailyPlays)
      .where(and(eq(dailyPlays.userId, userId), eq(dailyPlays.day, day))).for('update');
    const res = applyGuess(cur?.g ?? [], guess, answer, known);
    if ('error' in res) return res;
    await tx.update(dailyPlays).set({ guesses: res.guesses, won: res.won, finishedAt: res.finished ? new Date() : null })
      .where(and(eq(dailyPlays.userId, userId), eq(dailyPlays.day, day)));
    if (!res.won) return { progress: res, points: null };
    const streak = streakOf(await playsOf(userId, tx), day).current;
    const added = pointsFor(streak);
    if (added > 0)
      await tx.insert(pointLedger).values({ userId, delta: added, reason: 'daily_streak', ref: String(day) }).onConflictDoNothing();
    return { progress: res, points: { added, streak } };
  });
}

/** A signed-out daily guess: count the tried player; when it finished the game, count the game. */
export async function recordAnonGuess(day: number, assetId: number, finish: { won: boolean; guesses: number } | null): Promise<void> {
  await db.insert(dailyGuessCounts).values({ day, assetId, count: 1 })
    .onConflictDoUpdate({ target: [dailyGuessCounts.day, dailyGuessCounts.assetId], set: { count: sql`${dailyGuessCounts.count} + 1` } });
  if (!finish) return;
  const d = finish.won && finish.guesses >= 1 && finish.guesses <= 5 ? (`d${finish.guesses}` as 'd1' | 'd2' | 'd3' | 'd4' | 'd5') : null;
  await db.insert(dailyAnonStats).values({ day, finished: 1, won: finish.won ? 1 : 0, ...(d ? { [d]: 1 } : {}) })
    .onConflictDoUpdate({
      target: dailyAnonStats.day,
      set: {
        finished: sql`${dailyAnonStats.finished} + 1`,
        won: sql`${dailyAnonStats.won} + ${finish.won ? 1 : 0}`,
        ...(d ? { [d]: sql`${dailyAnonStats[d]} + 1` } : {}),
      },
    });
}

export async function anonDay(day: number): Promise<AnonDay | null> {
  const [r] = await db.select().from(dailyAnonStats).where(eq(dailyAnonStats.day, day));
  return r ? { finished: r.finished, won: r.won, dist: [r.d1, r.d2, r.d3, r.d4, r.d5] } : null;
}

export async function anonGuessCounts(day: number) {
  return db.select({ assetId: dailyGuessCounts.assetId, count: dailyGuessCounts.count }).from(dailyGuessCounts).where(eq(dailyGuessCounts.day, day));
}

export async function signedGamesOf(day: number) {
  const rows = await db.select({
    userId: dailyPlays.userId, email: users.email, username: users.username, guesses: dailyPlays.guesses,
    won: dailyPlays.won, finishedAt: dailyPlays.finishedAt,
  }).from(dailyPlays).innerJoin(users, eq(users.id, dailyPlays.userId)).where(eq(dailyPlays.day, day));
  return rows.map((r) => ({ ...r, finishedAt: r.finishedAt ? r.finishedAt.getTime() : null }));
}

export async function answerDays() {
  return db.select({ day: dailyAnswers.day, date: dailyAnswers.date, assetId: dailyAnswers.assetId }).from(dailyAnswers).orderBy(desc(dailyAnswers.day));
}
