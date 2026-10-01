// Every minute: trainings that just ended -> one email to the persona's owner (Premium, emails on).
import { decide, evoMail, unsubToken } from './evo-rules.js';
import { dueTrainings, failedTry, markNotified, ownerOf } from './db/evos.js';
import { planFor } from './plans.js';
import { loadMeta, type Meta } from './meta.js';
import { sendMail } from './mail.js';

export const siteUrl = () => (process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, '');
export const emailSecret = () => process.env.EMAIL_SECRET || process.env.CLERK_SECRET_KEY || '';

let busy = false;
export async function checkEvoAlerts(now = Date.now()): Promise<void> {
  if (busy) return; // a slow Resend call must not overlap the next tick
  busy = true;
  try {
    let meta: Meta | null = null; // loaded once per tick, only when a mail is going out
    for (const r of await dueTrainings(new Date(now))) {
      const owner = await ownerOf(r.personaId);
      const tier = owner ? (await planFor(owner.userId)).tier : 'free';
      if (!owner || decide({ tier, evoEmails: owner.evoEmails, email: owner.email }) === 'skip') {
        await markNotified(r.personaId, r.slotId, r.level); // closed: never mailed later
        continue;
      }
      meta ??= await loadMeta();
      const assetId = Number((r.player as { assetId?: number } | null)?.assetId);
      const player = meta.players[String(assetId)]?.name ?? { en: 'Your player', ro: 'Jucătorul tău', it: 'Il tuo giocatore' }[owner.lang];
      const unsubUrl = `${siteUrl()}/api/evos/unsubscribe?u=${encodeURIComponent(owner.userId)}&t=${unsubToken(owner.userId, emailSecret())}`;
      const mail = evoMail(owner.lang, { player, evo: r.slotName, level: r.level, levelCount: r.levelCount, evosUrl: `${siteUrl()}/dashboard/evolutions`, unsubUrl });
      const ok = await sendMail({ to: owner.email, ...mail, headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
      if (ok) await markNotified(r.personaId, r.slotId, r.level);
      else await failedTry(r.personaId, r.slotId, r.level);
    }
  } catch (e) {
    console.error(`[evos] alert tick failed: ${(e as Error).message}`);
  } finally {
    busy = false;
  }
}
