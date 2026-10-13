// Limits CP-SAT runs for the whole server: `max` at once (each takes 4 cores for up to 10-30 s),
// the rest wait in arrival order; past `maxQueue` waiting, a solve is refused at once.
export class GateFull extends Error {}

export function createGate(max: number, maxQueue: number, opts: { maxWaitMs?: number } = {}) {
  let running = 0;
  const waiting: (() => void)[] = [];
  // Hand-off: a finishing run gives its slot straight to the first waiter (`running` stays put),
  // so the count never exceeds `max` and a newcomer cannot overtake a waiter. A waiter that gave
  // up (maxWaitMs) has already left `waiting`, so it can never be handed the slot.
  const next = () => {
    const w = waiting.shift();
    if (w) w();
    else running--;
  };
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (running >= max) {
        if (waiting.length >= maxQueue) throw new GateFull('solver queue full');
        // woken with the slot already counted; past maxWaitMs (under nginx's 60 s proxy timeout)
        // the waiter leaves the queue and the request is refused as busy
        await new Promise<void>((resolve, reject) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const wake = () => {
            if (timer) clearTimeout(timer);
            resolve();
          };
          waiting.push(wake);
          if (opts.maxWaitMs !== undefined)
            timer = setTimeout(() => {
              const i = waiting.indexOf(wake);
              if (i < 0) return; // already handed the slot
              waiting.splice(i, 1);
              reject(new GateFull('solver queue wait too long'));
            }, opts.maxWaitMs);
        });
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
