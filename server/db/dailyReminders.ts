// Postgres side of the Daily reminder email (rules in server/daily/reminder-rules.ts).
import { and, eq, ne, sql } from 'drizzle-orm';
import { db } from './index.js';
import { dailyPlays, dailyReminders, users } from './schema.js';
import { asLang, type MailLang } from '../evo-rules.js';
import { MAX_TRIES } from '../daily/reminder-rules.js';

/**
 * Who may get today's reminder: opted in, an email, won yesterday's game (the streak is alive), today's game
 * not finished, not mailed today and under MAX_TRIES failed tries. Plan and streak length are checked after.
 */
export async function reminderCandidates(day: number, limit: number): Promise<{ userId: string; email: string; lang: MailLang }[]> {
  const rows = await db.select({ userId: users.id, email: users.email, lang: users.lang }).from(users).where(and(
    eq(users.dailyReminder, true),
    ne(users.email, ''),
    sql`exists (select 1 from ${dailyPlays} y where y.user_id = ${users.id} and y.day = ${day - 1} and y.won and y.finished_at is not null)`,
    sql`not exists (select 1 from ${dailyPlays} p where p.user_id = ${users.id} and p.day = ${day} and p.finished_at is not null)`,
    sql`not exists (select 1 from ${dailyReminders} r where r.user_id = ${users.id} and r.day = ${day} and (r.sent_at is not null or r.tries >= ${MAX_TRIES}))`,
  )).limit(limit);
  return rows.map((r) => ({ ...r, lang: asLang(r.lang) }));
}

export async function markReminded(userIds: string[], day: number): Promise<void> {
  if (!userIds.length) return;
  const now = new Date();
  await db.insert(dailyReminders).values(userIds.map((userId) => ({ userId, day, sentAt: now })))
    .onConflictDoUpdate({ target: [dailyReminders.userId, dailyReminders.day], set: { sentAt: now } });
}

export async function failedReminder(userIds: string[], day: number): Promise<void> {
  if (!userIds.length) return;
  await db.insert(dailyReminders).values(userIds.map((userId) => ({ userId, day, tries: 1 })))
    .onConflictDoUpdate({ target: [dailyReminders.userId, dailyReminders.day], set: { tries: sql`${dailyReminders.tries} + 1` } });
}

