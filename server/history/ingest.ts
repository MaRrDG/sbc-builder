// Feeds the completion history from every cache write (relay, syncs, applySubmittedSbc). No EA call.
import { onCacheWrite } from '../store.js';
import { softly } from '../db/index.js';
import { applyHistory } from '../db/history.js';
import { extract } from './extract.js';

// one chain per persona: two writes of the same persona never read the same marks at once
const chains = new Map<number, Promise<void>>();

/** Never rejects: a DB failure is logged and the next payload catches up (marks hold the last count). */
export function recordHistory(key: string, data: unknown): Promise<void> {
  const x = extract(key, data);
  if (!x || !x.seen.length) return Promise.resolve();
  const next = (chains.get(x.personaId) ?? Promise.resolve()).then(() =>
    softly(`history ${x.kind} ${x.personaId}`, () => applyHistory(x.personaId, x.kind, x.seen)),
  );
  chains.set(x.personaId, next);
  void next.finally(() => {
    if (chains.get(x.personaId) === next) chains.delete(x.personaId);
  });
  return next;
}

export function installHistory(): void {
  onCacheWrite((key, data) => void recordHistory(key, data));
}
