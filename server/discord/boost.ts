// Discord boosts → FC Solver Premium (server/plan.ts boostState). The bot reports; this decides who starts / stops.
import { isDiscordId } from './link.js';

export interface BoostRow { userId: string; discordId: string; boostSince: number | null }

/** `linked`: users with a Discord link who boost now or are marked as boosting. `boosters`: Discord id → boosting since (ms). */
export function reconcileBoosts(linked: BoostRow[], boosters: ReadonlyMap<string, number>) {
  const start: { userId: string; discordId: string; since: number }[] = [];
  const stop: { userId: string; discordId: string }[] = [];
  for (const u of linked) {
    const since = boosters.get(u.discordId);
    if (since !== undefined && u.boostSince === null) start.push({ userId: u.userId, discordId: u.discordId, since });
    else if (since === undefined && u.boostSince !== null) stop.push({ userId: u.userId, discordId: u.discordId });
  }
  return { start, stop };
}

export function parseBoosters(body: unknown): Map<string, number> | null {
  const list = (body as { boosters?: unknown } | null)?.boosters;
  if (!Array.isArray(list) || list.length > 10_000) return null;
  const out = new Map<string, number>();
  for (const b of list) {
    const { discordId, since } = (b ?? {}) as { discordId?: unknown; since?: unknown };
    if (typeof discordId !== 'string' || !isDiscordId(discordId) || !Number.isInteger(since) || (since as number) < 0) return null;
    out.set(discordId, since as number);
  }
  return out;
}
