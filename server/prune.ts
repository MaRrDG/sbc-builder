// Daily prune of cached EA accounts nobody owns and nobody used for 90 days (rules: prune-rules.ts).
// Each step is guarded and idempotent: the DB rows go first, and only when no personas row appeared
// meanwhile; then the persona's events lose its id, the in-memory account is dropped, and the folder goes.
import { accountById, forgetAccount } from './accounts.js';
import { alert } from './alert.js';
import { anonymizePersonaEvents, ownerOf, pruneSignalsOf, purgeOrphanPersonaRows } from './db/deletion.js';
import { logEvent } from './db/events.js';
import { forgetJobs, jobList, webAppOpen } from './jobs.js';
import { forgetSync } from './sync.js';
import { selectPrunable, type PruneSignals } from './prune-rules.js';
import { cachedAccountIds, dropKeys, newestAccountWrite } from './store.js';

export interface PruneDeps {
  cachedAccountIds(): Promise<number[]>;
  newestAccountWrite(personaId: number): Promise<number | null>;
  pruneSignalsOf: typeof pruneSignalsOf;
  /** a web app tab is polling for it, or it has an unfinished job */
  isLive(personaId: number): boolean;
  ownerOf(personaId: number): Promise<string | null>;
  purgeOrphanPersonaRows(personaId: number): Promise<boolean>;
  anonymizePersonaEvents(personaId: number): Promise<void>;
  forgetAccount(personaId: number): void;
  dropKeys(prefix: string): Promise<void>;
  logPruned(): void;
  onError(e: unknown): Promise<void>;
}

const defaultDeps: PruneDeps = {
  cachedAccountIds,
  newestAccountWrite,
  pruneSignalsOf,
  isLive(id) {
    const acc = accountById(id);
    return !!acc && (webAppOpen(acc) || jobList(acc).some((j) => j.status === 'queued' || j.status === 'running'));
  },
  ownerOf,
  purgeOrphanPersonaRows,
  anonymizePersonaEvents,
  forgetAccount: (id: number) => {
    forgetAccount(id);
    forgetJobs(id);
    forgetSync(id);
  },
  dropKeys,
  logPruned: () => logEvent({ type: 'account', data: { action: 'pruned' } }), // no persona id: that is what goes
  onError: async (e) => {
    console.error(`[prune] failed: ${(e as Error).message}`);
    await alert('prune', e);
  },
};

/** Read every signal; any failure while reading marks the whole run unknown (nothing is pruned). */
export async function gatherSignals(deps: PruneDeps): Promise<PruneSignals[]> {
  const ids = await deps.cachedAccountIds();
  if (!ids.length) return [];
  const db = await deps.pruneSignalsOf(ids);
  const out: PruneSignals[] = [];
  for (const id of ids) {
    out.push({
      personaId: id,
      owned: db.owned.has(id),
      trusted: db.trusted.has(id),
      live: deps.isLive(id),
      lastCache: await deps.newestAccountWrite(id),
      lastEvent: db.lastEvent.get(id) ?? null,
      lastLink: db.lastLink.get(id) ?? null,
    });
  }
  return out;
}

/** One run. Returns the pruned persona ids (for tests and the log count). */
export async function pruneAccounts(now = Date.now(), deps: PruneDeps = defaultDeps): Promise<number[]> {
  let signals: PruneSignals[];
  try {
    signals = await gatherSignals(deps);
  } catch (e) {
    await deps.onError(e);
    return [];
  }
  const done: number[] = [];
  for (const id of selectPrunable(signals, now)) {
    try {
      // fresh checks right before acting: linked or opened since the signals were read → keep
      if ((await deps.ownerOf(id)) !== null || deps.isLive(id)) continue;
      // events first, like the deletion purge: once the persona rows are gone the next run no longer sees this persona
      await deps.anonymizePersonaEvents(id);
      if (!(await deps.purgeOrphanPersonaRows(id))) continue;
      deps.forgetAccount(id);
      await deps.dropKeys(`accounts/${id}`);
      deps.logPruned();
      done.push(id);
    } catch (e) {
      await deps.onError(e); // this one is retried tomorrow; the rest go on
    }
  }
  if (done.length) console.log(`[prune] removed ${done.length} unused EA account cache(s)`);
  return done;
}

let running = false;

/** Daily ticker (index.ts): first run 10 minutes after start, then every 24 h. */
export function schedulePrune(): void {
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await pruneAccounts();
    } finally {
      running = false;
    }
  };
  setTimeout(() => void run(), 10 * 60 * 1000).unref();
  setInterval(() => void run(), 24 * 60 * 60 * 1000).unref();
}
