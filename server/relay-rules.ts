// Pure rules for what the extension relays (/api/webapp-event): a per-account budget of requests and
// bytes, and which relays may add a cache file. A key holder must not be able to fill the disk or the
// database: the budget caps the rate, the file rules cap what stays.

export interface RelayBudgetLimits {
  hourRequests: number;
  hourBytes: number;
  dayRequests: number;
  dayBytes: number;
}

const MB = 1024 * 1024;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/**
 * Far above a real session (a 5000-player club relayed twice is ~100 pages / ~15 MB; the SBC list,
 * challenges and squads are a few hundred kB) and far below what fills a disk.
 */
export const RELAY_LIMITS: RelayBudgetLimits = { hourRequests: 1500, hourBytes: 150 * MB, dayRequests: 6000, dayBytes: 500 * MB };

export interface RelayBudget {
  /** Counts one relay of `bytes` for this account; false (and nothing counted) once a window is used up. */
  (accountId: number, bytes: number): boolean;
  size(): number;
}

type Window = { start: number; requests: number; bytes: number };

export function createRelayBudget(limits: RelayBudgetLimits = RELAY_LIMITS, now: () => number = Date.now): RelayBudget {
  const hours = new Map<number, Window>();
  const days = new Map<number, Window>();
  let sweptAt = now();
  const current = (map: Map<number, Window>, id: number, len: number, t: number) => {
    let w = map.get(id);
    if (!w || t - w.start >= len) map.set(id, (w = { start: t, requests: 0, bytes: 0 }));
    return w;
  };
  const budget = ((id: number, bytes: number) => {
    const t = now();
    if (t - sweptAt > HOUR) {
      for (const [k, w] of hours) if (t - w.start >= HOUR) hours.delete(k);
      for (const [k, w] of days) if (t - w.start >= DAY) days.delete(k);
      sweptAt = t;
    }
    const size = Math.max(0, bytes) || 0;
    const h = current(hours, id, HOUR, t);
    const d = current(days, id, DAY, t);
    if (h.requests + 1 > limits.hourRequests || d.requests + 1 > limits.dayRequests) return false;
    if (h.bytes + size > limits.hourBytes || d.bytes + size > limits.dayBytes) return false;
    h.requests++;
    d.requests++;
    h.bytes += size;
    d.bytes += size;
    return true;
  }) as RelayBudget;
  budget.size = () => days.size;
  return budget;
}

/** Cache folders a relay can grow, one file per id, and how many files each may hold per account. */
export const RELAY_FILE_CAP = { challenges: 400, challengeSquads: 400, squads: 200 } as const;
/** One SBC's challenges or one challenge squad is a few kB; nothing real comes near this. */
export const RELAY_FILE_MAX_BYTES = 512 * 1024;

export type RelayFolder = keyof typeof RELAY_FILE_CAP;

/**
 * Why a relay may not write `<folder>/<id>` for this account, or null when it may.
 * `exists`: the file is already there (an update never adds a file); `files`: files in the folder now;
 * `known`: for challengeSquads, the challenge is in one of this account's cached challenge lists.
 */
export function relayFileRefusal(
  folder: RelayFolder, o: { bytes: number; exists: boolean; files: number; known?: boolean },
): 'tooBig' | 'unknownChallenge' | 'tooManyFiles' | null {
  if (o.bytes > RELAY_FILE_MAX_BYTES) return 'tooBig';
  if (folder === 'challengeSquads' && !o.known) return 'unknownChallenge';
  if (!o.exists && o.files >= RELAY_FILE_CAP[folder]) return 'tooManyFiles';
  return null;
}
