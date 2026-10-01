// Every minute: trainings that just ended -> one email per owner (Premium, emails on), sent in Resend batches.
// Delivery is at least once, made effectively once by Resend idempotency keys; rows close only after a send.
// One process runs the ticker (`busy` keeps ticks from overlapping); several API instances would need a DB lock.
import { alertKey, chunk, evoDigest, planAlerts, unsubToken, type AlertKey, type AlertOwner } from './evo-rules.js';
import { dueTrainings, failedTry, markNotified, ownersOf, type TrainingRow } from './db/evos.js';
import { planFor } from './plans.js';
import { loadMeta } from './meta.js';
import { BATCH_MAX, sendMails, type Mail, type SendResult } from './mail.js';
import { publicOrigin } from './origins.js';

/** Canonical origin for links in emails (SITE_URL, else our first https origin); never the request's host. */
export const siteUrl = () => publicOrigin('').replace(/\/+$/, '');
export const emailSecret = () => process.env.EMAIL_SECRET || process.env.CLERK_SECRET_KEY || '';

const ROWS_PER_TICK = 2000; // the rest waits a minute; keeps one tick short
const BATCH_GAP_MS = 600; // under Resend's default 2 requests/s

const keyOf = (r: TrainingRow): AlertKey => ({ personaId: r.personaId, slotId: r.slotId, level: r.level });
const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

let busy = false;
let pauseUntil = 0; // Resend asked us to wait (rate limit, quota, outage)

export async function checkEvoAlerts(now = Date.now()): Promise<void> {
  if (busy || now < pauseUntil) return;
  busy = true;
  try {
    const rows = await dueTrainings(new Date(now), ROWS_PER_TICK);
    if (!rows.length) return;

    const owners = await ownersOf([...new Set(rows.map((r) => r.personaId))]);
    const tiers = new Map<string, 'free' | 'premium' | null>();
    for (const userId of new Set([...owners.values()].map((o) => o.userId))) {
      tiers.set(userId, await planFor(userId).then((p) => p.tier, (e) => {
        console.error(`[evos] plan of ${userId} failed: ${(e as Error).message}`);
        return null; // its rows wait for the next tick
      }));
    }
    const ownerOf = (personaId: number): AlertOwner | null => {
      const o = owners.get(personaId);
      return o ? { ...o, tier: tiers.get(o.userId) ?? null } : null;
    };
    const { mails, skip } = planAlerts(rows, ownerOf);
    if (skip.length) await markNotified(skip.map(keyOf)); // closed: never mailed later

    const meta = mails.length ? await loadMeta() : null;
    const fallback = { en: 'Your player', ro: 'Jucătorul tău', it: 'Il tuo giocatore' };
    const prepared = mails.map((m) => {
      const unsubUrl = `${siteUrl()}/api/evos/unsubscribe?u=${encodeURIComponent(m.userId)}&t=${unsubToken(m.userId, emailSecret())}`;
      const items = m.rows.map((r) => ({
        player: meta?.players[String((r.player as { assetId?: number } | null)?.assetId)]?.name ?? fallback[m.lang],
        evo: r.slotName, level: r.level, levelCount: r.levelCount,
      }));
      const mail: Mail = {
        to: m.email,
        ...evoDigest(m.lang, items, { evosUrl: `${siteUrl()}/dashboard/evolutions`, unsubUrl }),
        headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      };
      return { mail, userId: m.userId, keys: m.rows.map(keyOf) };
    });

    let sent = 0;
    const batches = chunk(prepared, BATCH_MAX);
    for (const [i, batch] of batches.entries()) {
      if (i) await sleep(BATCH_GAP_MS);
      const keys = batch.flatMap((b) => b.keys);
      let res = await sendMails(batch.map((b) => b.mail), alertKey(batch.map((b) => b.userId).join('+'), keys));
      if (res.kind === 'fail' && batch.length > 1) {
        // a batch is all or nothing: one bad address must not fail the others, so send them one by one
        for (const b of batch) {
          await sleep(BATCH_GAP_MS);
          res = await sendMails([b.mail], alertKey(b.userId, b.keys));
          if (!(await settle(res, b.keys))) return;
          if (res.kind === 'ok') sent++;
        }
        continue;
      }
      if (!(await settle(res, keys))) return;
      if (res.kind === 'ok') sent += batch.length;
    }
    if (sent || skip.length) console.log(`[evos] ${sent} mail(s) sent, ${skip.length} training(s) closed without a mail`);
  } catch (e) {
    console.error(`[evos] alert tick failed: ${(e as Error).message}`);
  } finally {
    busy = false;
  }
}

/** Applies a send result to its rows; false = stop this tick (Resend wants us to wait). */
async function settle(res: SendResult, keys: AlertKey[]): Promise<boolean> {
  if (res.kind === 'ok') await markNotified(keys);
  else if (res.kind === 'fail') await failedTry(keys);
  else {
    pauseUntil = Date.now() + res.pauseMs;
    console.warn(`[evos] sending paused for ${Math.round(res.pauseMs / 1000)} s`);
    return false;
  }
  return true;
}
