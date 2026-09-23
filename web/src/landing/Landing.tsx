// Public landing page (/): what FC Solver does and why it beats market-price solvers.
// Lazy-loaded by Root for everyone (signed in or not); the app itself lives under /dashboard.
import type { MouseEvent, ReactNode } from 'react';
import { useI18n } from '../i18n';
import { LangMenu } from '../components/LangMenu';
import { routePath, type Route } from '../route';
import { Hero } from './Hero';
import { Pillars } from './Pillars';
import './landing.css';

interface Props {
  signedIn: boolean;
  navigate: (r: Route, replace?: boolean) => void;
}

export default function Landing({ signedIn, navigate }: Props) {
  const { t, lang, setLang } = useI18n();
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
  const cta = (className = 'lp-btn') =>
    signedIn ? link(app, className, t('landing.open')) : link(signin, className, t('landing.start'));

  return (
    <div className="landing">
      <a className="lp-skip" href="#main">
        {t('landing.skip')}
      </a>
      <header className="lp-top">
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
          {!signedIn && link(signin, 'lp-signin', t('landing.signIn'))}
          {cta('lp-btn lp-btn-sm')}
        </div>
      </header>

      <main id="main">
        <Hero cta={cta()} />
        <Pillars />
        <section id="how" className="lp-section" />
        <section id="pricing" className="lp-section" />
        <section id="faq" className="lp-section" />
      </main>

      <footer className="lp-footer">
        <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="124" height="32" />
        <nav aria-label={t('landing.nav.label')}>
          {link({ view: 'setup' }, 'lp-link', t('landing.footer.setup'))}
          {link({ view: 'guide' }, 'lp-link', t('landing.footer.guide'))}
        </nav>
        <p>{t('landing.footer.legal')}</p>
      </footer>
    </div>
  );
}
