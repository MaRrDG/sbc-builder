// Premium pricing shown on the landing page. Display only: billing does not exist yet.
export type Billing = 'monthly' | 'yearly';

export const FREE_WEEKLY_SOLVES = 20; // display only; the server's FREE_WEEKLY_SOLVES decides

const MONTHLY = 5;
const YEARLY_PER_MONTH = 3;

export function proPrice(b: Billing): { perMonth: number; billed: number } {
  return b === 'monthly' ? { perMonth: MONTHLY, billed: MONTHLY } : { perMonth: YEARLY_PER_MONTH, billed: YEARLY_PER_MONTH * 12 };
}

/** What a year costs less when paid yearly. */
export const yearlySaving = () => MONTHLY * 12 - YEARLY_PER_MONTH * 12;

export const formatEur = (n: number, lang: string) => {
  const formatted = new Intl.NumberFormat(lang, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
  return formatted.replace('EUR', '€');
};
