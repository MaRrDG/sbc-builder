// Document names, kept apart from docs.ts (the whole texts) so the footer links stay in the small first chunk.
import type { Lang } from '../i18n';

export type LegalDoc = 'terms' | 'privacy' | 'cookies' | 'refunds';
export const LEGAL_DOCS: LegalDoc[] = ['terms', 'privacy', 'cookies', 'refunds'];

export const LEGAL_TITLES: Record<Lang, Record<LegalDoc, string>> = {
  en: { terms: 'Terms of use', privacy: 'Privacy policy', cookies: 'Cookie policy', refunds: 'Refund policy' },
  ro: { terms: 'Termeni de utilizare', privacy: 'Politica de confidențialitate', cookies: 'Politica de cookie-uri', refunds: 'Politica de rambursare' },
  it: { terms: "Termini d'uso", privacy: 'Informativa sulla privacy', cookies: 'Cookie policy', refunds: 'Politica di rimborso' },
};
