// Per-user cooldown for /sbc (the solver is the expensive part). In memory: one bot process.
export function createCooldown(ms: number, now: () => number = Date.now): (key: string) => number {
  const until = new Map<string, number>();
  return (key) => {
    const t = now();
    const u = until.get(key) ?? 0;
    if (u > t) return u - t;
    until.set(key, t + ms);
    if (until.size > 5000) for (const [k, v] of until) if (v <= t) until.delete(k);
    return 0;
  };
}
