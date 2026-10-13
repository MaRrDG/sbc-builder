// Counts every request FC Solver sends to EA for one account and enforces a daily budget,
// so a bug or a loop can never hammer EA with the user's session.
import { readCache, writeCache } from './store.js';
import { SessionError } from './ea.js';
import { logEvent } from './db/events.js';

export const DAILY_LIMIT = Number(process.env.EA_DAILY_LIMIT ?? 150);
const TZ = process.env.SBC_DROP_TZ ?? 'Europe/Bucharest';
const RECENT = 30;

export interface MeterData {
  day: string; // YYYY-MM-DD in the drop timezone
  count: number;
  byPath: Record<string, number>;
  recent: { at: number; method: string; path: string; status: number | null }[];
  pausedUntil?: number; // EA throttling pause, kept across restarts
  overLogged?: boolean; // the over-budget log entry was written today
}

const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
export const meterDay = today;
/** "/sbs/setId/16/challenges" -> "/sbs/setId/:id/challenges", so counts group by endpoint. */
const endpoint = (path: string) => path.split('?')[0].replace(/\/\d+(?=\/|$)/g, '/:id');

const COOLDOWN_MS = 15 * 60 * 1000;

/** Whether a day that just rolled over is worth an `ea_day` admin-log entry (nothing to show for an idle day). */
export function shouldLogRollover(stale: MeterData | null): boolean {
  return !!stale && stale.count > 0;
}

export class RequestMeter {
  private data: MeterData | null = null;

  constructor(
    private cacheKey: string,
    private personaId: number,
  ) {}

  private async load(): Promise<MeterData> {
    if (!this.data) this.data = (await readCache<MeterData>(this.cacheKey))?.data ?? null;
    if (!this.data || this.data.day !== today()) {
      const stale = this.data;
      // the finished day, for the admin chart
      if (shouldLogRollover(stale)) logEvent({ type: 'ea_day', personaId: this.personaId, data: { day: stale!.day, count: stale!.count } });
      this.data = { day: today(), count: 0, byPath: {}, recent: stale?.recent ?? [], pausedUntil: stale?.pausedUntil };
      if (stale) {
        // persist the rollover now, not just on the next record(): otherwise a restart before then
        // (tsx watch, a redeploy) reads the old day from cache again and logs it a second time
        try {
          await writeCache(this.cacheKey, this.data);
        } catch (e) {
          console.error(`[meter] persisting day rollover failed: ${(e as Error).message}`);
        }
      }
    }
    return this.data;
  }

  private async pausedUntil(): Promise<number | null> {
    const until = (await this.load()).pausedUntil ?? 0;
    return until > Date.now() ? until : null;
  }

  /** Throws before the request is sent when today's budget is used up. */
  async check() {
    const until = await this.pausedUntil();
    if (until) {
      const min = Math.ceil((until - Date.now()) / 60000);
      throw new SessionError(`EA asked us to slow down. FC Solver pauses its EA requests for ${min} more min.`, 429, 'paused', { min });
    }
    const d = await this.load();
    if (d.count >= DAILY_LIMIT)
      throw new SessionError(
        `Daily limit of ${DAILY_LIMIT} EA requests reached. FC Solver keeps working from cache; browsing the web app still updates it.`,
        429,
        'budget',
        { limit: DAILY_LIMIT },
      );
  }

  async record(method: string, path: string, status: number | null, kind?: string) {
    const d = await this.load();
    const ep = endpoint(path);
    d.count++;
    d.byPath[ep] = (d.byPath[ep] ?? 0) + 1;
    d.recent = [{ at: Date.now(), method, path: ep, status }, ...d.recent].slice(0, RECENT);
    // a job ran past the cap (its cost estimate was low): once a day in the admin log, to tune job-cost.ts
    if (d.count > DAILY_LIMIT && !d.overLogged) {
      d.overLogged = true;
      logEvent({ type: 'ea_error', personaId: this.personaId, data: { code: 'overBudget', kind: kind ?? null, count: d.count } });
    }
    await writeCache(this.cacheKey, d);
  }

  /** EA signalled throttling: stop sending anything for this account for a while (kept across restarts). */
  async pause() {
    const d = await this.load();
    d.pausedUntil = Date.now() + COOLDOWN_MS;
    await writeCache(this.cacheKey, d);
    logEvent({ type: 'ea_error', personaId: this.personaId, data: { code: 'throttle' } });
  }

  async summary() {
    const d = await this.load();
    return { today: d.count, limit: DAILY_LIMIT, pausedUntil: await this.pausedUntil(), byPath: d.byPath, recent: d.recent.slice(0, 10) };
  }
}
