// Account deletion (docs/superpowers/specs/2026-10-13-gdpr-account-design.md, section 1): a request schedules it
// 7 days ahead and stops the Paddle renewal; signing in and cancelling undoes both; an hourly ticker purges
// the users whose date has come. Paddle calls never write `subscriptions` (only the signed webhook does).
import { eq } from 'drizzle-orm';
import { forgetAccount as forgetAccountMem } from './accounts.js';
import { forgetJobs } from './jobs.js';
import { forgetSync } from './sync.js';
import { alert } from './alert.js';
import { clerkApi } from './auth.js';
import { billingConfig, cancelSubscription, getSubscription, PaddleError, removeScheduledChange, type BillingConfig } from './billing/paddle.js';
import { subscriptionsOf } from './db/billing.js';
import {
  addDeleteSubs,
  anonymizeEvents,
  anonymizePersonaEvents,
  clearDeletion,
  deleteAtOf,
  deleteSubsOf,
  dueDeletions,
  ownerOf,
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

/**
 * Cancel at period end. 'scheduled': this call stopped the renewal (Cancel deletion may restart it);
 * 'already': Paddle had it cancelled / scheduled to cancel (not ours to undo); 'now': a past_due subscription
 * Paddle would not cancel at period end, cancelled immediately instead (no refund either way, nothing to undo).
 */
async function stopRenewal(c: BillingConfig, id: string, status: string): Promise<'scheduled' | 'already' | 'now'> {
  try {
    await cancelSubscription(c, id, 'next_billing_period');
    return 'scheduled';
  } catch (e) {
    if (!is4xx(e)) throw e;
    const s = await getSubscription(c, id);
    if (s.status === 'canceled' || s.scheduled_change?.action === 'cancel') return 'already';
    if (status !== 'past_due' && s.status !== 'past_due') throw e;
    await cancelSubscription(c, id, 'immediately');
    return 'now';
  }
}

/** POST /api/me/delete. Idempotent: a second request keeps the first date (and sends no second email). */
export async function requestDeletion(userId: string, confirm: unknown): Promise<{ deleteAt: number }> {
  if (!isConfirmWord(confirm)) throw new SessionError('Type the confirm word to delete your account.', 400, 'deleteConfirm');
  const fresh = await scheduleDeletion(userId, deleteDate(Date.now())); // only when no date yet: one request wins
  const at = await deleteAtOf(userId);
  if (!at) throw new SessionError('Sign in first.', 401, 'signIn'); // the user row is gone
  const c = billingConfig();
  if (c) {
    const mine: string[] = [];
    let cancelledNow = false;
    try {
      for (const s of await subscriptionsOf(userId)) {
        if (!RENEWING.has(s.status) || s.cancelAt) continue;
        const r = await stopRenewal(c, s.id, s.status);
        if (r === 'scheduled') mine.push(s.id);
        if (r === 'now') cancelledNow = true;
      }
      await addDeleteSubs(userId, mine);
    } catch (e) {
      console.warn(`[deletion] renewal stop failed: ${(e as Error).message}`);
      if (fresh) {
        // nothing stays scheduled while a renewal still runs: undo this call's cancels, the user retries
        const notUndone: string[] = [];
        for (const id of mine) {
          await removeScheduledChange(c, id).catch((x) => {
            console.warn(`[deletion] undo failed: ${(x as Error).message}`);
            notUndone.push(id);
          });
        }
        // a stop that could not be undone (or a past_due subscription already cancelled) must stay visible:
        // keep the date, so the banner and Cancel deletion (which retries these) stay available
        if (notUndone.length || cancelledNow) await addDeleteSubs(userId, notUndone).catch(() => {});
        else await clearDeletion(userId);
      } else await addDeleteSubs(userId, mine).catch(() => {});
      throw new SessionError('Could not stop the subscription renewal. Try again in a minute.', 502, 'deletePaddle');
    }
  }
  if (fresh) {
    logEvent({ type: 'account', userId, data: { action: 'deleteRequested' } });
    await mailRequested(userId, at).catch((e) => console.warn(`[deletion] email failed: ${(e as Error).message}`));
  }
  return { deleteAt: at.getTime() };
}

async function mailRequested(userId: string, at: Date): Promise<void> {
  const [[row], prefs] = await Promise.all([db.select({ email: users.email }).from(users).where(eq(users.id, userId)), prefsOf(userId)]);
  if (!row?.email) return;
  const mail = deletionMail(prefs.lang, at, { siteUrl: `${siteUrl()}/dashboard`, logoUrl: `${siteUrl()}/icon-192.png` });
  const r = await sendMails([{ to: row.email, ...mail }], `account-delete/${userId}/${at.getTime()}`);
  if (r.kind !== 'ok') console.warn(`[deletion] confirmation email not sent: ${r.kind}`);
}

/** POST /api/me/delete/cancel: the account stays; only renewals the request itself stopped restart. Nothing scheduled: nothing to do. */
export async function cancelDeletion(userId: string, now = Date.now()): Promise<{ deleteAt: null }> {
  const at = await deleteAtOf(userId);
  if (!at) return { deleteAt: null };
  // the date has come: the hourly purge may already be running, too late to keep the account
  if (at.getTime() <= now) throw new SessionError('Your account is being deleted.', 409, 'deleteInProgress');
  const c = billingConfig();
  const subs = await deleteSubsOf(userId);
  if (c) {
    for (const id of subs) {
      try {
        await removeScheduledChange(c, id);
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
  } else if (subs.length) console.warn(`[deletion] billing is off: ${subs.length} renewal(s) not restarted at Paddle`);
  await clearDeletion(userId);
  logEvent({ type: 'account', userId, data: { action: 'deleteCancelled' } });
  return { deleteAt: null };
}

export interface PurgeDeps {
  subsToCancel(userId: string): Promise<string[]>;
  paddleCancelNow(subIds: string[]): Promise<void>;
  clerkDelete(userId: string): Promise<void>;
  personasForPurge: typeof personasForPurge;
  /** fresh read of personas.user_id right before acting on one EA account */
  ownerOf(personaId: number): Promise<string | null>;
  forgetAccount(personaId: number): void;
  dropKeys(prefix: string): Promise<void>;
  anonymizePersonaEvents(personaId: number): Promise<void>;
  purgePersonaRows(personaId: number, userId: string): Promise<void>;
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
  ownerOf,
  forgetAccount: (id: number) => {
    forgetAccountMem(id);
    forgetJobs(id);
    forgetSync(id);
  },
  dropKeys,
  anonymizePersonaEvents,
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
  const purged: number[] = [];
  for (const id of plan.purge) {
    const owner = await deps.ownerOf(id); // another user may have linked it since the plan was read
    if (owner && owner !== userId) {
      await deps.unlinkUser(id, userId);
      continue;
    }
    purged.push(id);
    deps.forgetAccount(id); // first: an in-flight cache write must not find the account any more
    await deps.dropKeys(`accounts/${id}`);
    await deps.anonymizePersonaEvents(id); // before the rows: once they are gone the next run no longer sees this persona
    await deps.purgePersonaRows(id, userId);
  }
  for (const id of plan.unlinkOnly) await deps.unlinkUser(id, userId);
  await deps.anonymizeEvents(userId, purged);
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
        const at = await deleteAtOf(userId); // cancelled since the list was read: keep the account
        if (!at || at > now) continue;
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
