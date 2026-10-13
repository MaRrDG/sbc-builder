// Limits CP-SAT runs for the whole server: `max` at once (each takes 4 cores for up to 10-30 s),
// the rest wait in arrival order; past `maxQueue` waiting, a solve is refused at once.
export class GateFull extends Error {}

export function createGate(max: number, maxQueue: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  // Hand-off: a finishing run gives its slot straight to the first waiter (`running` stays put),
  // so the count never exceeds `max` and a newcomer cannot overtake a waiter.
  const next = () => {
    const w = waiting.shift();
    if (w) w();
    else running--;
  };
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (running >= max) {
        if (waiting.length >= maxQueue) throw new GateFull('solver queue full');
        await new Promise<void>((resolve) => waiting.push(resolve)); // woken with the slot already counted
      } else {
        running++;
      }
      try {
        return await fn();
      } finally {
        next();
      }
    },
    stats: () => ({ running, queued: waiting.length }),
  };
}

/** One run per key (user) at a time. */
export function userLock() {
  const held = new Set<string>();
  return {
    take: (key: string) => (held.has(key) ? false : (held.add(key), true)),
    release: (key: string) => void held.delete(key),
  };
}
