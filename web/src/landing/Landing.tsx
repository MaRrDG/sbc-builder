// Public landing page (/): what FC Solver does and why it beats market-price solvers.
// Lazy-loaded by Root for everyone (signed in or not); the app itself lives under /dashboard.
import { LegalLinks } from '../legal/LegalPage';
import { useEffect, type MouseEvent, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { LangMenu } from '../components/LangMenu';
import { routePath, type Route } from '../route';
import { Hero } from './Hero';
import { Pillars } from './Pillars';
import { Steps } from './Steps';
import { Pricing } from './Pricing';
import { Faq } from './Faq';
import { ToTop } from './ToTop';
import './landing.css';

interface Props {
  signedIn: boolean;
  authReady: boolean;
  navigate: (r: Route, replace?: boolean) => void;
}

export default function Landing({ signedIn, authReady, navigate }: Props) {
  const { t, lang, setLang } = useI18n();
  // the page is lazy-loaded, so the browser's own jump to /#why happened before the section existed
  useEffect(() => {
    let id = window.location.hash.slice(1);
    try {
      id = decodeURIComponent(id);
    } catch {
      // malformed escape (/#%): keep the raw hash, which matches no section
    }
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  /** A real link (open in new tab works) that navigates in place on a plain click. */
  const link = (r: Route, className: string, children: ReactNode) => (
    <a
      className={className}
      href={routePath(r)}
      onClick={(e: MouseEvent) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(r);
        window.scrollTo(0, 0);
      }}
    >
      {children}
    </a>
  );
  const app: Route = { view: 'sbcs', setId: null, challengeId: null };
  const signin: Route = { view: 'signin', next: '/dashboard' };
  // Clerk hasn't said yet whether we're signed in: reserve the space with an invisible
  // placeholder instead of guessing (a guess flashes "Start free"/"Sign in" at signed-in users).
  const placeholder = (className: string, text: string) => (
    <span className={className} aria-hidden="true" style={{ visibility: 'hidden' }}>
      {text}
    </span>
  );
  const cta = (className = 'lp-btn') =>
    !authReady ? placeholder(className, t('landing.start'))
    : signedIn ? link(app, className, t('landing.open'))
    : link(signin, className, t('landing.start'));

  return (
    <div className="landing">
      <a className="lp-skip" href="#main">
        {t('landing.skip')}
      </a>
      <header className="lp-top">
        <div className="lp-top-in">
          <a className="lp-logo" href="/" aria-label={t('top.home')}>
            <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="140" height="36" />
          </a>
          <nav className="lp-nav" aria-label={t('landing.nav.label')}>
            <a href="#why">{t('landing.nav.why')}</a>
            <a href="#how">{t('landing.nav.how')}</a>
            <a href="#pricing">{t('landing.nav.pricing')}</a>
            <a href="#faq">{t('landing.nav.faq')}</a>
          </nav>
          <div className="lp-top-end">
            <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
            {!authReady ? placeholder('lp-signin', t('landing.signIn'))
            : !signedIn && link(signin, 'lp-signin', t('landing.signIn'))}
            {cta('lp-btn lp-btn-sm')}
          </div>
        </div>
      </header>

      <main id="main">
        <Hero cta={cta()} />
        <Pillars />
        <Steps link={link} />
        <Pricing cta={cta()} />
        <Faq />
      </main>

      <footer className="lp-footer">
        <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="124" height="32" />
        <nav aria-label={t('landing.footer.nav')}>
          {link({ view: 'setup' }, 'lp-link', t('landing.footer.setup'))}
          {link({ view: 'guide' }, 'lp-link', t('landing.footer.guide'))}
        </nav>
        <p>{t('landing.footer.legal')}</p>
        <LegalLinks navigate={navigate} className="lp-link" />
      </footer>
      <ToTop ctaKey={`${authReady}-${signedIn}`} />
    </div>
  );
}
