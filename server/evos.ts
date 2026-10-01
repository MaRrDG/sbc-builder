// Timed EA Evolutions ("Academy" in the API): which players are in Training Camp and until when.
// A timed level's objective carries the training start in `currentProgress` (unix seconds, UTC)
// and its length in `multiplier` (seconds); once over, `currentProgress === multiplier` and the
// level waits for a claim in the web app. Pure: the caller stores what this returns.

export interface EvoTraining {
  slotId: number;
  level: number;
  levelCount: number;
  slotName: string;
  itemId: number | null;
  player: Record<string, unknown> | null; // EA item as sent (slot.player), for toPlayer()
  startedAt: number | null; // unix seconds; null when only seen ready
  endsAt: number | null;
  ready: boolean;
  slotEndsAt: number | null;
}

const SKEW = 300; // device clocks drift: a start up to 5 min "in the future" is still fine
const MAX_TRAINING = 7 * 86400;
const MIN_EPOCH = 1_000_000_000; // below this `currentProgress` is a counter, not a time

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const int = (v: unknown): number | null => (Number.isInteger(v) ? (v as number) : null);

export function parseAcademy(response: unknown, nowSec: number): EvoTraining[] {
  const res = obj(response);
  if (!res || !Array.isArray(res.slots)) return [];
  const readyIds = new Set(Array.isArray(res.rewardReadySlotIds) ? res.rewardReadySlotIds : []);
  const out: EvoTraining[] = [];
  for (const raw of res.slots) {
    const s = obj(raw);
    const slotId = int(s?.id);
    if (!s || slotId === null || s.timed !== true || !Array.isArray(s.levels)) continue;
    const levels = s.levels.map(obj).filter((l): l is Record<string, unknown> => !!l && int(l.level) !== null);
    const levelCount = Math.max(0, ...levels.map((l) => l.level as number));
    const slotEndsAt = int(s.endTime) || null;
    const base = {
      slotId, levelCount, slotEndsAt,
      slotName: typeof s.slotName === 'string' ? s.slotName : '',
      itemId: int(s.realPlayerId),
      player: obj(s.player),
    };
    for (const l of levels) {
      if (l.levelState !== 'IN_PROGRESS') continue;
      const timed = (Array.isArray(l.objectives) ? l.objectives : []).map(obj).find((o) => (int(o?.multiplier) ?? 0) > 0);
      if (!timed) continue;
      const duration = timed.multiplier as number;
      const progress = int(timed.currentProgress);
      if (timed.state === 'COMPLETED' || (readyIds.has(slotId) && timed.state !== 'IN_PROGRESS')) {
        out.push({ ...base, level: l.level as number, startedAt: null, endsAt: null, ready: true });
        continue;
      }
      if (timed.state !== 'IN_PROGRESS' || progress === null || progress < MIN_EPOCH) continue;
      if (progress > nowSec + SKEW || duration > MAX_TRAINING) continue;
      const endsAt = progress + duration;
      if (slotEndsAt && endsAt > slotEndsAt) continue;
      out.push({ ...base, level: l.level as number, startedAt: progress, endsAt, ready: false });
    }
  }
  return out;
}

/** The web app's own Evolutions list: every started slot, so a slot missing from it was claimed or expired. */
export function isFullList(path: string, query: string, slotCount: number): boolean {
  if (path !== '/academy/hub/v2') return false;
  const q = new URLSearchParams(query);
  const count = Number(q.get('count'));
  return q.get('slotStatus') === 'STARTED' && q.get('offset') === '0' && count > 0 && slotCount < count;
}
