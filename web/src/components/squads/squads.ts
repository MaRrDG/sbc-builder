// Pure helpers for My Squads.

/** EA-style compact coins under a card: 950, 171.9K, 1.6M (decimal separator per language). */
export function compactCoins(n: number, lang: string): string {
  const one = (x: number) => new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }).format(x);
  const k = Math.round(n / 100) / 10;
  if (n < 1000) return new Intl.NumberFormat(lang, { maximumFractionDigits: 0 }).format(n);
  if (k < 1000) return `${one(k)}K`;
  return `${one(Math.round(n / 100_000) / 10)}M`;
}

/** Starters (index < 11, by slot) and bench (by index) from a squad's slots. */
export function splitSlots<T extends { index: number }>(slots: T[]): { starters: T[]; bench: T[] } {
  const sorted = [...slots].sort((a, b) => a.index - b.index);
  return { starters: sorted.filter((s) => s.index < 11), bench: sorted.filter((s) => s.index >= 11) };
}
