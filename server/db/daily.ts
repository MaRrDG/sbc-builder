// Postgres side of the Daily game (rules live in server/daily/*).
import { asc, eq, gte, sql } from 'drizzle-orm';
import { db } from './index.js';
import { dailyAnswers, players } from './schema.js';
import type { PlayerRow } from '../daily/types.js';

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
