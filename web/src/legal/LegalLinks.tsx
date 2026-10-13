// Footer links to the legal pages. Apart from LegalPage so the first chunk does not carry the legal texts.
import type { MouseEvent } from 'react';
import { useI18n } from '../i18n';
import type { Route } from '../route';
import { LEGAL_DOCS, LEGAL_TITLES } from './titles';

/** Real links (crawlable, open in a new tab) that stay inside the app on a plain click. */
export const linkTo = (navigate: (r: Route) => void) => (r: Route) => (e: MouseEvent) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(r);
  window.scrollTo(0, 0);
};

/** Terms · Privacy · Cookies, for footers. */
export function LegalLinks({ navigate, className = 'text' }: { navigate: (r: Route) => void; className?: string }) {
  const { t, lang } = useI18n();
  const go = linkTo(navigate);
  return (
    <nav className="legal-links" aria-label={t('legal.nav')}>
      {LEGAL_DOCS.map((k) => (
        <a key={k} className={className} href={`/${k}`} onClick={go({ view: 'legal', doc: k })}>
          {LEGAL_TITLES[lang][k]}
        </a>
      ))}
    </nav>
  );
}
