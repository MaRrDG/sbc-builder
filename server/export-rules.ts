// Data export (GDPR art. 15/20): the pure parts. Readers are injected so the assembler is testable
// without a database; server/export.ts supplies the real ones. Never exports secrets: extension keys,
// SIDs, link tokens, Paddle ids, other users' data.

type Json = Record<string, unknown>;
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

/** One cached account file without its secrets (access key, SID) and without any Paddle id. */
export function sanitizeAccountInfo(info: Json): Json {
  const out: Json = {};
  for (const [k, v] of Object.entries(info)) {
    if (k === 'accessKey' || k === 'sid' || k.toLowerCase().startsWith('paddle')) continue;
    out[k] = v;
  }
  return out;
}

export interface SubscriptionRow {
  status: string;
  interval: string;
  currentPeriodEnd: Date;
  cancelAt: Date | null;
  createdAt: Date;
}

/** A Paddle subscription as the user may see it: no subscription / customer / price ids. */
export function subscriptionExport(r: SubscriptionRow) {
  return { status: r.status, interval: r.interval, periodStart: iso(r.createdAt), periodEnd: iso(r.currentPeriodEnd), canceledAt: iso(r.cancelAt) };
}

const BILLING_IDS = ['customerId', 'subscriptionId', 'transactionId'];

/** `billing` events carry Paddle ids in `data`: strip them; other events stay as stored. */
export function sanitizeEvent<T extends { type: string; data: Json }>(e: T): T {
  if (e.type !== 'billing') return e;
  const data = { ...e.data };
  for (const k of BILLING_IDS) delete data[k];
  return { ...e, data };
}

export interface ExportReaders {
  user(userId: string): Promise<(Json & { deleteAt: Date | null; createdAt: Date }) | null>;
  plan(userId: string): Promise<Json>;
  subscriptions(userId: string): Promise<SubscriptionRow[]>;
  personas(userId: string): Promise<{ personaId: number; linkedAt: Date }[]>;
  accountInfo(personaId: number): Promise<Json | null>;
  club(personaId: number): Promise<{ fetchedAt: number; data: unknown } | null>;
  requestsToday(personaId: number): Promise<number | null>;
  completions(personaId: number): Promise<Json[]>;
  marks(personaId: number): Promise<Json[]>;
  evos(personaId: number): Promise<Json[]>;
  daily(userId: string): Promise<{ plays: Json[]; reminders: Json[] }>;
  invites(userId: string): Promise<{ codes: Json[]; redemptions: Json[]; points: Json[] }>;
  events(userId: string): Promise<(Json & { type: string; data: Json })[]>;
}

// users columns that are kept private to the export: never listed here, so never exported
const ACCOUNT_FIELDS = [
  'email', 'lang', 'plan', 'premiumUntil', 'quotaStart', 'quotaUsed', 'founderAt', 'evoEmails', 'dailyReminder', 'heardFrom', 'futYears',
  'onboardedAt', 'username', 'leaderboard', 'discordName', 'boostSince', 'boostEndedAt', 'createdAt', 'deleteAt',
];

export async function assembleExport(userId: string, r: ExportReaders): Promise<Json> {
  const [user, plan, subs, owned, daily, invites, events] = await Promise.all([
    r.user(userId), r.plan(userId), r.subscriptions(userId), r.personas(userId), r.daily(userId), r.invites(userId), r.events(userId),
  ]);
  const account: Json = {};
  for (const k of ACCOUNT_FIELDS) if (user && k in user) account[k] = user[k];
  const eaAccounts = await Promise.all(
    owned.map(async (p) => {
      const [info, club, requestsToday, completions, marks, evos] = await Promise.all([
        r.accountInfo(p.personaId), r.club(p.personaId), r.requestsToday(p.personaId), r.completions(p.personaId), r.marks(p.personaId), r.evos(p.personaId),
      ]);
      const safe = info ? sanitizeAccountInfo(info) : {};
      return {
        personaId: p.personaId,
        personaName: safe.personaName ?? null,
        clubName: safe.clubName ?? null,
        linkedAt: iso(p.linkedAt),
        club: club ? { fetchedAt: club.fetchedAt, items: club.data } : null,
        completions, completionMarks: marks, evoTrainings: evos, requestsToday,
      };
    }),
  );
  return {
    exportedAt: new Date().toISOString(),
    account: { ...account, plan: plan },
    subscriptions: subs.map(subscriptionExport),
    eaAccounts,
    daily,
    invites,
    events: events.map(sanitizeEvent),
  };
}
