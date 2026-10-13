// Live updates for the site: a persona's cache or jobs changed, pushed to its open dashboards over
// GET /api/stream (server-sent events). In memory only: a restart drops the streams and the site reconnects.
import { onCacheWrite } from './store.js';

type Listener = (keys: string[]) => void;
const subs = new Map<number, Set<Listener>>();

export function subscribe(personaId: number, fn: Listener): () => void {
  let set = subs.get(personaId);
  if (!set) subs.set(personaId, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (!set!.size) subs.delete(personaId);
  };
}

/** Something about this persona changed; `keys` are cache keys under accounts/<id>/ (empty: only the status). */
export function notify(personaId: number, keys: string[] = []) {
  for (const fn of subs.get(personaId) ?? []) fn(keys);
}

export function keyOwner(key: string): { personaId: number; name: string } | null {
  const m = /^accounts\/(\d+)\/(.+)$/.exec(key);
  return m ? { personaId: Number(m[1]), name: m[2] } : null;
}

export const sseFrame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export const MAX_STREAMS = 3;
const open = new Map<string, number>();
export function takeStream(userId: string): boolean {
  const n = open.get(userId) ?? 0;
  if (n >= MAX_STREAMS) return false;
  open.set(userId, n + 1);
  return true;
}
export function dropStream(userId: string) {
  const n = (open.get(userId) ?? 1) - 1;
  if (n > 0) open.set(userId, n);
  else open.delete(userId);
}

onCacheWrite((key) => {
  const o = keyOwner(key);
  if (o) notify(o.personaId, [o.name]);
});
