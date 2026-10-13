// Pure helpers for the live stream (/api/stream): split server-sent events, and which data to reload.
export interface SseEvent {
  event: string;
  data: string;
}

export function parseSse(buf: string): { events: SseEvent[]; rest: string } {
  const parts = buf.replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop() ?? '';
  const events: SseEvent[] = [];
  for (const part of parts) {
    let event = 'message';
    const data: string[] = [];
    for (const line of part.split('\n')) {
      if (line.startsWith(':')) continue; // heartbeat
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length) events.push({ event, data: data.join('\n') });
  }
  return { events, rest };
}

const CLUB_KEYS = new Set(['club', 'storage', 'squad', 'unassigned', 'chemProfiles']);

/** Changed cache keys (accounts/<id>/<key>) → what the dashboard reloads. */
export function refetchPlan(keys: string[], openSetId: number | null) {
  const plan = { club: false, sets: false, challenges: false, other: false };
  for (const k of keys) {
    if (CLUB_KEYS.has(k)) plan.club = true;
    else if (k === 'sets') plan.sets = true;
    else if (k.startsWith('challenges/')) {
      plan.sets = true; // a points target on a tile comes from the challenges
      if (openSetId !== null && k === `challenges/${openSetId}`) plan.challenges = true;
    } else plan.other = true; // evolutions, gallery ledger, objectives, a web app edit
  }
  return plan;
}

/**
 * One request at a time per resource: a trigger while one is in flight marks it dirty, and exactly
 * one more run follows when it lands, so the last answer applied is always the newest. `reset()`
 * (account switch) drops the answer in flight.
 */
export function singleFlight<T>(run: () => Promise<T>, apply: (v: T) => void) {
  let inFlight = false;
  let dirty = false;
  let seq = 0;
  const start = () => {
    inFlight = true;
    const my = ++seq;
    void run()
      .then(
        (v) => {
          if (my === seq) apply(v);
        },
        () => {},
      )
      .finally(() => {
        if (my !== seq) return; // reset meanwhile: a newer run owns the state
        inFlight = false;
        if (dirty) {
          dirty = false;
          start();
        }
      });
  };
  return {
    trigger() {
      if (inFlight) dirty = true;
      else start();
    },
    reset() {
      seq++;
      inFlight = false;
      dirty = false;
    },
  };
}

interface StatusLike {
  running: string | null;
  jobs?: { kind: string; state: string }[];
}

/** A club sync is loading pages for this account right now (client job, or legacy server sync). */
export function clubJobRunning(s: StatusLike | null): boolean {
  return !!s && (s.running === 'club' || !!s.jobs?.some((j) => j.kind === 'club' && j.state === 'running'));
}

export interface SeenStatus {
  running: string | null;
  editedAt: number | null;
  clubAt: number | null;
  sbcAt: number | null;
}

/** The stream is back after a gap: what its first status says changed while nobody announced it. */
export function gapReload(prev: SeenStatus, next: SeenStatus) {
  return {
    club: prev.clubAt !== next.clubAt,
    sets: prev.sbcAt !== next.sbcAt || prev.editedAt !== next.editedAt,
    syncEnded: !!prev.running && !next.running,
  };
}
