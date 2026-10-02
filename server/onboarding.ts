// The short onboarding survey: where a user heard of FC Solver and how long they have played FUT.
// Pure rules; the answers live on the users row (heard_from, fut_years, onboarded_at).
export const HEARD_FROM = ['tiktok', 'youtube', 'reddit', 'friends', 'google', 'other'] as const;
export const FUT_YEARS = ['lt1', '1-3', '4-7', '8+'] as const;
export type HeardFrom = (typeof HEARD_FROM)[number];
export type FutYears = (typeof FUT_YEARS)[number];

export type OnboardingAnswer = { heardFrom: HeardFrom; futYears: FutYears } | { skip: true };

/** A request body as an answer, or null when it is neither both known answers nor a skip. */
export function parseOnboarding(body: unknown): OnboardingAnswer | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.skip === true) return { skip: true };
  const heardFrom = HEARD_FROM.find((v) => v === b.heardFrom);
  const futYears = FUT_YEARS.find((v) => v === b.futYears);
  return heardFrom && futYears ? { heardFrom, futYears } : null;
}

/** Counts per answer in catalogue order, every answer present (0 when nobody picked it). */
export function tally<T extends string>(values: readonly T[], rows: { value: string | null; n: number }[]): { value: T; count: number }[] {
  return values.map((value) => ({ value, count: rows.find((r) => r.value === value)?.n ?? 0 }));
}
