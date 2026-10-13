// Which cached EA accounts (data/accounts/<personaId>/) the daily prune deletes. Pure.
// Conservative: an account goes only when every signal is known and says "nobody, for 90 days".
// Anything missing or unreadable keeps it.

export const PRUNE_AFTER_DAYS = 90;
export const PRUNE_MAX_PER_RUN = 50;
const DAY = 24 * 60 * 60 * 1000;

export interface PruneSignals {
  personaId: number;
  /** a personas row exists (personas.user_id is never null): someone owns it now */
  owned: boolean;
  /** an admin trusted it (trusted_accounts): a decision, not ours to undo */
  trusted: boolean;
  /** a web app tab polled for it in the last few seconds, or it has a running / queued job */
  live: boolean;
  /** newest file change in its cache folder (ms); null when the folder could not be read or holds no file */
  lastCache: number | null;
  /** newest event logged against it (ms), null when none */
  lastEvent: number | null;
  /** newest persona_links row (ms), null when none */
  lastLink: number | null;
  /** the signals could not all be read (a DB query failed): keep */
  unknown?: boolean;
}

/** True when this account may be deleted now. */
export function isPrunable(s: PruneSignals, now: number, days = PRUNE_AFTER_DAYS): boolean {
  if (!Number.isSafeInteger(s.personaId) || s.personaId <= 0) return false;
  if (s.unknown || s.owned || s.trusted || s.live) return false;
  if (s.lastCache === null || !Number.isFinite(s.lastCache) || s.lastCache <= 0) return false; // no readable cache: unsure
  const cutoff = now - days * DAY;
  const times = [s.lastCache, s.lastEvent ?? 0, s.lastLink ?? 0];
  if (times.some((t) => !Number.isFinite(t) || t > now + DAY)) return false; // a clock in the future: unsure
  return times.every((t) => t < cutoff);
}

/** The accounts to delete this run, oldest activity first, at most `max`. */
export function selectPrunable(all: PruneSignals[], now: number, days = PRUNE_AFTER_DAYS, max = PRUNE_MAX_PER_RUN): number[] {
  const last = (s: PruneSignals) => Math.max(s.lastCache ?? 0, s.lastEvent ?? 0, s.lastLink ?? 0);
  return all
    .filter((s) => isPrunable(s, now, days))
    .sort((a, b) => last(a) - last(b) || a.personaId - b.personaId)
    .slice(0, max)
    .map((s) => s.personaId);
}
