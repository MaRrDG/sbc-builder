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
