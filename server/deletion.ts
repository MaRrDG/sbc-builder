// Account deletion (docs/superpowers/specs/2026-10-13-gdpr-account-design.md, section 1): a request schedules it
// 7 days ahead and stops the Paddle renewal; signing in and cancelling undoes both; an hourly ticker purges
// the users whose date has come. Paddle calls never write `subscriptions` (only the signed webhook does).
import { eq } from 'drizzle-orm';
import { forgetAccount } from './accounts.js';
import { alert } from './alert.js';
import { clerkApi } from './auth.js';
import { billingConfig, cancelSubscription, getSubscription, PaddleError, removeScheduledChange, type BillingConfig } from './billing/paddle.js';
import { subscriptionsOf } from './db/billing.js';
import {
  anonymizeEvents,
  clearDeletion,
  deleteAtOf,
  dueDeletions,
  personasForPurge,
  purgePersonaRows,
  purgeUserRows,
  scheduleDeletion,
  unlinkUser,
} from './db/deletion.js';
import { logEvent } from './db/events.js';
import { prefsOf } from './db/evos.js';
import { db } from './db/index.js';
import { users } from './db/schema.js';
import { deletionMail } from './deletion-mail.js';
import { deleteDate, isConfirmWord, purgePlan } from './deletion-rules.js';
import { SessionError } from './ea.js';
import { siteUrl } from './evo-alerts.js';
import { sendMails } from './mail.js';
import { dropKeys } from './store.js';

const RENEWING = new Set(['active', 'trialing', 'past_due']);
const is4xx = (e: unknown) => e instanceof PaddleError && e.status >= 400 && e.status < 500;

/** Cancel at period end; a refusal because it is already cancelled / scheduled to cancel counts as done. */
async function stopRenewal(c: BillingConfig, id: string): Promise<void> {
  try {
    await cancelSubscription(c, id, 'next_billing_period');
  } catch (e) {
    if (!is4xx(e)) throw e;
    const s = await getSubscription(c, id);
    if (s.status !== 'canceled' && s.scheduled_change?.action !== 'cancel') throw e;
  }
}

/** POST /api/me/delete. Idempotent: a second request keeps the first date (and sends no second email). */
export async function requestDeletion(userId: string, confirm: unknown): Promise<{ deleteAt: number }> {
  if (!isConfirmWord(confirm)) throw new SessionError('Type the confirm word to delete your account.', 400, 'deleteConfirm');
  const had = await deleteAtOf(userId);
  const at = had ?? deleteDate(Date.now());
  if (!had) await scheduleDeletion(userId, at);
  const c = billingConfig();
  if (c) {
    try {
      for (const s of await subscriptionsOf(userId)) if (RENEWING.has(s.status) && !s.cancelAt) await stopRenewal(c, s.id);
    } catch (e) {
      console.warn(`[deletion] renewal stop failed: ${(e as Error).message}`);
      if (!had) await clearDeletion(userId); // nothing scheduled while the renewal still runs: the user retries
      throw new SessionError('Could not stop the subscription renewal. Try again in a minute.', 502, 'deletePaddle');
    }
  }
  if (!had) {
    logEvent({ type: 'account', userId, data: { action: 'deleteRequested' } });
    await mailRequested(userId, at).catch((e) => console.warn(`[deletion] email failed: ${(e as Error).message}`));
  }
  return { deleteAt: at.getTime() };
}

async function mailRequested(userId: string, at: Date): Promise<void> {
  const [[row], prefs] = await Promise.all([db.select({ email: users.email }).from(users).where(eq(users.id, userId)), prefsOf(userId)]);
  if (!row?.email) return;
  const mail = deletionMail(prefs.lang, at, { siteUrl: `${siteUrl()}/dashboard`, logoUrl: `${siteUrl()}/icon-192.png` });
  await sendMails([{ to: row.email, ...mail }], `account-delete/${userId}/${at.getTime()}`);
}

/** POST /api/me/delete/cancel: the account stays and scheduled cancels renew again. Nothing scheduled: nothing to do. */
export async function cancelDeletion(userId: string): Promise<{ deleteAt: null }> {
  if (!(await deleteAtOf(userId))) return { deleteAt: null };
  const c = billingConfig();
  if (c) {
    for (const s of await subscriptionsOf(userId)) {
      if (!s.cancelAt || s.status === 'canceled') continue;
      try {
        await removeScheduledChange(c, s.id);
      } catch (e) {
        if (is4xx(e)) {
          console.warn(`[deletion] nothing to undo on a subscription: ${(e as Error).message}`);
          continue;
        }
        console.warn(`[deletion] renewal restart failed: ${(e as Error).message}`);
        // the date stays, so the banner (and this retry) stays too
        throw new SessionError('Could not restart the subscription renewal. Try again in a minute.', 502, 'deleteCancelPaddle');
      }
    }
  }
  await clearDeletion(userId);
  logEvent({ type: 'account', userId, data: { action: 'deleteCancelled' } });
  return { deleteAt: null };
}

export interface PurgeDeps {
  subsToCancel(userId: string): Promise<string[]>;
  paddleCancelNow(subIds: string[]): Promise<void>;
  clerkDelete(userId: string): Promise<void>;
  personasForPurge: typeof personasForPurge;
  forgetAccount(personaId: number): void;
  dropKeys(prefix: string): Promise<void>;
  purgePersonaRows(personaId: number): Promise<void>;
  unlinkUser(personaId: number, userId: string): Promise<void>;
  anonymizeEvents(userId: string, purgedPersonas: number[]): Promise<void>;
  purgeUserRows(userId: string): Promise<void>;
}

const defaultDeps: PurgeDeps = {
  subsToCancel: async (userId) => (await subscriptionsOf(userId)).filter((s) => s.status !== 'canceled').map((s) => s.id),
  async paddleCancelNow(ids) {
    const c = billingConfig();
    if (!c) {
      console.warn(`[deletion] billing is off: ${ids.length} subscription(s) not cancelled at Paddle`);
      return;
    }
    for (const id of ids) {
      try {
        await cancelSubscription(c, id, 'immediately');
      } catch (e) {
        if (!is4xx(e) || (await getSubscription(c, id)).status !== 'canceled') throw e; // already cancelled: done
      }
    }
  },
  clerkDelete: async (userId) => void (await clerkApi().users.deleteUser(userId)),
  personasForPurge,
  forgetAccount,
  dropKeys,
  purgePersonaRows,
  unlinkUser,
  anonymizeEvents,
  purgeUserRows,
};

const notFound = (e: unknown) => typeof e === 'object' && e !== null && (e as { status?: unknown }).status === 404;

/**
 * Remove a user for good. Every step is idempotent and the users row goes last, so a failure anywhere leaves
 * the user due and the next run picks up where this one stopped.
 */
export async function purgeUser(userId: string, deps: PurgeDeps = defaultDeps): Promise<void> {
  const subs = await deps.subsToCancel(userId);
  if (subs.length) await deps.paddleCancelNow(subs);
  try {
    await deps.clerkDelete(userId);
  } catch (e) {
    if (!notFound(e)) throw e; // 404: already gone
  }
  const { personas, links } = await deps.personasForPurge(userId);
  const plan = purgePlan(userId, personas, links);
  for (const id of plan.purge) {
    deps.forgetAccount(id); // first: an in-flight cache write must not find the account any more
    await deps.dropKeys(`accounts/${id}`);
    await deps.purgePersonaRows(id);
  }
  for (const id of plan.unlinkOnly) await deps.unlinkUser(id, userId);
  await deps.anonymizeEvents(userId, plan.purge);
  await deps.purgeUserRows(userId);
}

let running = false;

/** Purge every due user, one at a time; one failure alerts and moves on (that user is retried next hour). */
export async function runDueDeletions(now = new Date()): Promise<void> {
  if (running) return;
  running = true;
  try {
    for (const userId of await dueDeletions(now)) {
      try {
        await purgeUser(userId);
        logEvent({ type: 'account', data: { action: 'deleted' } });
        console.log('[deletion] purged one account');
      } catch (e) {
        console.error(`[deletion] purge failed: ${(e as Error).message}`);
        await alert('deletion', e);
      }
    }
  } catch (e) {
    console.error(`[deletion] run failed: ${(e as Error).message}`);
    await alert('deletion', e);
  } finally {
    running = false;
  }
}

/** Once at start, then every hour. */
export function scheduleDeletions(): void {
  void runDueDeletions();
  setInterval(() => void runDueDeletions(), 60 * 60 * 1000).unref();
}
