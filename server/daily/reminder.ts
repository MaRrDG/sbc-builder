// Every minute between 17:00 and 20:00 Europe/Bucharest: one Daily reminder per eligible user (Premium,
// opted in, win streak alive, today's game unplayed), sent in Resend batches like the evolution emails.
// A row in daily_reminders closes a user's day only after Resend accepted the mail; the Resend idempotency
// key covers a retry after a timeout. One process runs the ticker (`busy`), like server/evo-alerts.ts.
import { chunk } from '../evo-rules.js';
import { emailSecret, siteUrl } from '../evo-alerts.js';
import { BATCH_MAX, sendMails, type Mail, type SendResult } from '../mail.js';
import { planFor } from '../plans.js';
import { lastSbcDrop } from '../sync.js';
import { playsOf } from '../db/daily.js';
import { failedReminder, markReminded, reminderCandidates } from '../db/dailyReminders.js';
import { nextDropAfter } from './day.js';
import { eligibility, inWindow, reminderKey, reminderMail, reminderUnsubToken } from './reminder-rules.js';
import { currentDay } from './service.js';

const USERS_PER_TICK = 2000; // the rest waits a minute
const BATCH_GAP_MS = 600; // under Resend's default 2 requests/s

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

let busy = false;
let pauseUntil = 0; // Resend asked us to wait (rate limit, quota, outage)
let doneDay = 0; // every candidate of this day was handled: no more queries until the next day

export async function checkDailyReminders(now = Date.now()): Promise<void> {
  if (busy || now < pauseUntil) return;
  if (!inWindow(now, nextDropAfter((d) => lastSbcDrop(d), now))) return;
  busy = true;
  try {
    const day = await currentDay(now);
    if (day === doneDay) return;
    const cands = await reminderCandidates(day, USERS_PER_TICK);

    const prepared: { mail: Mail; userId: string }[] = [];
    let waiting = false; // a plan lookup failed: that user is tried again next tick
    for (const c of cands) {
      const tier = await planFor(c.userId).then((p) => p.tier, (e) => {
        console.error(`[daily-reminder] plan of ${c.userId} failed: ${(e as Error).message}`);
        return null;
      });
      const e = eligibility({ dailyReminder: true, tier, email: c.email, plays: await playsOf(c.userId) }, day);
      if (!e.send) {
        if (e.reason === 'plan') waiting = true;
        continue; // Free now (preference kept), or nothing at stake: no mail
      }
      const unsubUrl = `${siteUrl()}/api/daily/unsubscribe?u=${encodeURIComponent(c.userId)}&t=${reminderUnsubToken(c.userId, emailSecret())}`;
      prepared.push({
        userId: c.userId,
        mail: {
          to: c.email,
          ...reminderMail(c.lang, e.streak, { dailyUrl: `${siteUrl()}/daily`, unsubUrl, logoUrl: `${siteUrl()}/icon-192.png` }),
          headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
        },
      });
    }

    let sent = 0;
    let failed = 0;
    for (const [i, batch] of chunk(prepared, BATCH_MAX).entries()) {
      if (i) await sleep(BATCH_GAP_MS);
      const ids = batch.map((b) => b.userId);
      let res = await sendMails(batch.map((b) => b.mail), reminderKey(day, ids));
      if (res.kind === 'fail' && batch.length > 1) {
        // a batch is all or nothing: one bad address must not fail the others
        for (const b of batch) {
          await sleep(BATCH_GAP_MS);
          res = await sendMails([b.mail], reminderKey(day, [b.userId]));
          if (!(await settle(res, [b.userId], day))) return;
          if (res.kind === 'ok') sent++;
          else failed++;
        }
        continue;
      }
      if (!(await settle(res, ids, day))) return;
      if (res.kind === 'ok') sent += batch.length;
      else failed += batch.length;
    }
    // failed mails are retried next tick (up to MAX_TRIES); a full list may have more users behind it
    if (!waiting && !failed && cands.length < USERS_PER_TICK) doneDay = day;
    if (sent || failed) console.log(`[daily-reminder] day ${day}: ${sent} mail(s) sent, ${failed} failed`);
  } catch (e) {
    console.error(`[daily-reminder] tick failed: ${(e as Error).message}`);
  } finally {
    busy = false;
  }
}

/** Applies a send result; false = stop this tick (Resend wants us to wait). */
async function settle(res: SendResult, userIds: string[], day: number): Promise<boolean> {
  if (res.kind === 'ok') await markReminded(userIds, day);
  else if (res.kind === 'fail') await failedReminder(userIds, day);
  else {
    pauseUntil = Date.now() + res.pauseMs;
    console.warn(`[daily-reminder] sending paused for ${Math.round(res.pauseMs / 1000)} s`);
    return false;
  }
  return true;
}
