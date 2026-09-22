// Keeps a local copy of each account's club + SBC data. EA is only hit when the cache
// is older than 24h (automatic) or when the user presses Sync (manual).
import type { ClubItem, Challenge, SbcSet, ChemProfilesResponse } from './ea.js';
import { SessionError } from './ea.js';
import { readCache, writeCache, isStale, type Cached } from './store.js';
import { loadMeta, invalidateMeta } from './meta.js';
import { listAccounts, type Account } from './accounts.js';

export interface SetsData {
  categories: { categoryId: number; name: string; sets: SbcSet[] }[];
}

export interface SyncStatus {
  ea: Awaited<ReturnType<Account['meter']['summary']>>;
  running: string | null;
  error: string | null;
  clubAt: number | null;
  sbcAt: number | null;
  editedAt: number | null; // last local edit (e.g. an SBC submitted in the web app)
  unassigned: number; // players from opened packs not sent to the club yet
}

const running = new Map<number, string>();
const errors = new Map<number, string | null>();
const edited = new Map<number, number>();

export function markEdited(acc: Account) {
  edited.set(acc.id, Date.now());
}

export async function getStatus(acc: Account): Promise<SyncStatus> {
  return {
    ea: await acc.meter.summary(),
    running: running.get(acc.id) ?? null,
    error: errors.get(acc.id) ?? null,
    editedAt: edited.get(acc.id) ?? null,
    unassigned: (await readCache<unknown[]>(acc.key('unassigned')))?.data.length ?? 0,
    clubAt: (await readCache(acc.key('club')))?.fetchedAt ?? null,
    sbcAt: (await readCache(acc.key('sets')))?.fetchedAt ?? null,
  };
}

function utasOf(acc: Account) {
  if (!acc.utas) throw new SessionError('No EA session for this account. Open the FC web app with the extension.', 401);
  return acc.utas;
}

async function run<T>(acc: Account, label: string, fn: () => Promise<T>): Promise<T> {
  const busy = running.get(acc.id);
  if (busy) throw new Error(`Sync already running (${busy})`);
  running.set(acc.id, label);
  errors.set(acc.id, null);
  try {
    return await fn();
  } catch (e) {
    errors.set(acc.id, (e as Error).message);
    throw e;
  } finally {
    running.delete(acc.id);
  }
}

export function syncClub(acc: Account): Promise<Cached<ClubItem[]>> {
  return run(acc, 'club', async () => {
    const utas = utasOf(acc);
    const items = await utas.clubPlayers();
    // anything the fresh club already contains is no longer waiting in Unassigned
    const pending = await readCache<ClubItem[]>(acc.key('unassigned'));
    if (pending) {
      const inClub = new Set(items.map((i) => i.id));
      await writeCache(acc.key('unassigned'), pending.data.filter((p) => !inClub.has(p.id)));
    }
    const squad = await utas.activeSquad().catch(() => null);
    if (squad) await writeCache(acc.key('squad'), squad);
    const prof = await utas.chemistryProfiles().catch(() => null);
    if (prof) {
      await writeCache<ChemProfilesResponse>(acc.key('chemProfiles'), prof);
      invalidateMeta(acc.key('chemProfiles'));
    }
    return writeCache(acc.key('club'), items);
  });
}

/** Refresh the SBC list; only re-fetch challenges for sets that are new or changed. */
export function syncSbcs(acc: Account): Promise<Cached<SetsData>> {
  return run(acc, 'sbc', async () => {
    const utas = utasOf(acc);
    const prev = await readCache<SetsData>(acc.key('sets'));
    const next = await utas.sets();
    const prevSets = new Map(prev?.data.categories.flatMap((c) => c.sets).map((s) => [s.setId, s]) ?? []);
    for (const set of next.categories.flatMap((c) => c.sets)) {
      const old = prevSets.get(set.setId);
      const changed =
        !old ||
        old.challengesCompletedCount !== set.challengesCompletedCount ||
        old.timesCompleted !== set.timesCompleted ||
        old.timesCompletedInInterval !== set.timesCompletedInInterval ||
        old.challengesCount !== set.challengesCount;
      const cached = await readCache(acc.key(`challenges/${set.setId}`));
      if (cached && !changed) continue;
      // finished one-off sets are only loaded if the user opens them
      if (!cached && set.challengesCompletedCount >= set.challengesCount && !set.repeatable) continue;
      const ch = await utas.challenges(set.setId);
      await writeCache(acc.key(`challenges/${set.setId}`), ch.challenges);
    }
    return writeCache(acc.key('sets'), next);
  });
}

/**
 * Challenges of a set, from cache only. Opening an SBC or solving never reaches EA; the cache is
 * filled by syncs and by the extension when the user opens the set in the web app.
 * `refresh` is an explicit user request and the only way this asks EA.
 */
export async function getChallenges(acc: Account, setId: number, refresh = false): Promise<Cached<Challenge[]> | null> {
  const key = acc.key(`challenges/${setId}`);
  const cached = await readCache<Challenge[]>(key);
  if (!refresh || !acc.utas) return cached;
  const ch = await acc.utas.challenges(setId);
  return writeCache(key, ch.challenges);
}

/** Start (unix s) of the current refresh window of a REFRESH set; windows tick from its release. */
function refreshWindowStart(set: SbcSet, now: number): number {
  const interval = set.repeatRefreshInterval ?? 86400;
  const anchor = set.releaseTime ?? 0;
  return anchor + Math.floor((now - anchor) / interval) * interval;
}

/**
 * The user submitted an SBC in the web app (reported by the extension): drop the used
 * items from the cached club/squad and mark the challenge done, without asking EA.
 * Cache timestamps are kept so the regular sync schedule is unchanged.
 */
export async function applySubmittedSbc(acc: Account, challengeId: number, itemIds: number[]) {
  const used = new Set(itemIds);
  const club = await readCache<ClubItem[]>(acc.key('club'));
  let removed = 0;
  if (club) {
    const left = club.data.filter((i) => !used.has(i.id));
    removed = club.data.length - left.length;
    await writeCache(acc.key('club'), left, club.fetchedAt);
  }
  const squad = await readCache<{ starters: number[]; bench: number[] }>(acc.key('squad'));
  if (squad) {
    const keep = (ids: number[]) => ids.filter((id) => !used.has(id));
    await writeCache(acc.key('squad'), { starters: keep(squad.data.starters), bench: keep(squad.data.bench) }, squad.fetchedAt);
  }

  // Find the set that owns the challenge and bump its progress.
  const sets = await readCache<SetsData>(acc.key('sets'));
  for (const set of sets?.data.categories.flatMap((c) => c.sets) ?? []) {
    const chKey = acc.key(`challenges/${set.setId}`);
    const chs = await readCache<Challenge[]>(chKey);
    const ch = chs?.data.find((c) => c.challengeId === challengeId);
    if (!chs || !ch) continue;
    const firstTime = ch.status !== 'COMPLETED';
    ch.status = 'COMPLETED';
    ch.timesCompleted = (ch.timesCompleted ?? 0) + 1;
    await writeCache(chKey, chs.data, chs.fetchedAt);
    if (firstTime) set.challengesCompletedCount = Math.min(set.challengesCount, set.challengesCompletedCount + 1);
    // the set counts as done once more when every challenge has been done that many times
    const rounds = Math.min(...chs.data.map((c) => c.timesCompleted ?? 0));
    if (rounds > set.timesCompleted) {
      const now = Math.floor(Date.now() / 1000);
      if (set.repeatabilityMode === 'REFRESH') {
        const sameWindow = set.lastCompletedTime !== undefined && set.lastCompletedTime >= refreshWindowStart(set, now);
        set.timesCompletedInInterval = sameWindow ? (set.timesCompletedInInterval ?? 0) + 1 : 1;
      }
      set.timesCompleted = rounds;
      set.lastCompletedTime = now;
    }
    await writeCache(acc.key('sets'), sets!.data, sets!.fetchedAt);
    break;
  }
  markEdited(acc);
  return { removed };
}

// New SBCs drop (and daily ones reset) at 18:00 UK = 20:00 Romania. We refresh a minute later.
const DROP_TZ = process.env.SBC_DROP_TZ ?? 'Europe/Bucharest';
const [DROP_H, DROP_M] = (process.env.SBC_DROP_TIME ?? '20:01').split(':').map(Number);

/** Wall-clock parts of `date` in `tz`, read back as if they were UTC (gives the tz offset). */
function wallAsUtc(date: Date, tz: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
}

/** Most recent SBC drop moment (epoch ms). */
export function lastSbcDrop(now = new Date()): number {
  const offset = wallAsUtc(now, DROP_TZ) - now.getTime();
  const wall = new Date(now.getTime() + offset);
  let drop = Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate(), DROP_H, DROP_M);
  if (drop > wall.getTime()) drop -= 24 * 60 * 60 * 1000;
  return drop - offset;
}

/**
 * Club: refreshed when older than 24h. SBCs: refreshed when fetched before the latest
 * daily drop. Runs on startup, when a session arrives, and every minute (cheap: it only
 * reads cache timestamps unless something is actually due).
 */
// A fresh session means the web app just opened: give it time to load club/SBCs itself
// (the extension relays those responses), so the scheduled sync often has nothing to fetch.
const SESSION_GRACE_MS = 3 * 60 * 1000;

export async function autoSync(acc: Account): Promise<void> {
  if (!acc.utas || running.has(acc.id)) return;
  if (Date.now() - acc.info.sidUpdatedAt < SESSION_GRACE_MS) return;
  try {
    await loadMeta(acc.key('chemProfiles'));
    if (isStale(await readCache(acc.key('club')))) await syncClub(acc);
    const sets = await readCache(acc.key('sets'));
    if (!sets || sets.fetchedAt < lastSbcDrop()) await syncSbcs(acc);
  } catch (e) {
    console.warn(`auto sync failed for ${acc.info.personaName}:`, (e as Error).message);
  }
}

export async function autoSyncAll() {
  for (const acc of listAccounts()) await autoSync(acc);
}
