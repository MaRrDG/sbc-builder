// What the bot gets for /sbc and /stats: small, already decided, no EA ids it does not need. Types shared with discord/.
export interface BotReason { code: string; req?: string; have?: number; need?: number; all?: number }

export interface BotSolution {
  found: boolean;
  set: string;
  challenge: string;
  setId: number;
  challengeId: number;
  rating: number;
  chemistry: number;
  slots: { pos: string; name: string; rating: number; chem: number; storage: boolean; brick: boolean }[];
  points: { target: number; total: number; cards: { name: string; rating: number; points: number }[] } | null;
  reasons: BotReason[];
  quota: { used: number; limit: number; resetsAt: number | null } | null;
  lang: 'en' | 'ro';
}

export interface BotStats { sbcs: number; challenges: number; objectives: number; club: number; streak: number; since: number | null; lang: 'en' | 'ro' }

/** The parts of a runSolve answer the bot needs (squad, points and not-found answers all fit). */
export interface SolveLike {
  found: boolean;
  eval: { rating: number; chemistry: number };
  slots: { position: { name: string }; player: { name: string; rating: number; inStorage?: boolean } | null; chem: number; brick?: unknown }[];
  points?: { target: number; total: number; cards: { name: string; rating: number; points: number }[] };
  reasons?: unknown[];
  quota: { used: number; limit: number; resetsAt: number | null } | null;
}

function reasonOf(r: unknown): BotReason {
  if (typeof r === 'string') return { code: 'text', req: r };
  const o = (r ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
  return {
    code: typeof o.code === 'string' ? o.code : 'combo',
    ...(typeof o.req === 'string' ? { req: o.req } : {}),
    ...(num(o.have) !== undefined ? { have: num(o.have) } : {}),
    ...(num(o.need) !== undefined ? { need: num(o.need) } : {}),
    ...(num(o.all) !== undefined ? { all: num(o.all) } : {}),
  };
}

export function toBotSolution(a: SolveLike, ctx: { set: string; challenge: string; setId: number; challengeId: number; lang: 'en' | 'ro' }): BotSolution {
  return {
    found: a.found,
    set: ctx.set,
    challenge: ctx.challenge,
    setId: ctx.setId,
    challengeId: ctx.challengeId,
    rating: a.eval.rating,
    chemistry: a.eval.chemistry,
    slots: a.slots.map((s) => ({
      pos: s.position.name,
      name: s.player?.name ?? '',
      rating: s.player?.rating ?? 0,
      chem: s.chem,
      storage: !!s.player?.inStorage,
      brick: !s.player && !!s.brick,
    })),
    points: a.points ? { target: a.points.target, total: a.points.total, cards: a.points.cards.map((c) => ({ name: c.name, rating: c.rating, points: c.points })) } : null,
    reasons: (a.reasons ?? []).slice(0, 3).map(reasonOf),
    quota: a.quota,
    lang: ctx.lang,
  };
}
