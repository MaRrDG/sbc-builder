// /changelog: what changed in FC Solver, newest first, in the site language. Public, like the legal pages.
import { useEffect, type MouseEvent } from 'react';
import { useI18n } from '../i18n';
import { LangMenu } from '../components/LangMenu';
import type { Route } from '../route';
import { APP_VERSION, CHANGELOG } from '../../../shared/changelog';
import { markSeen } from './seen';

export function ChangelogPage({ navigate, signedIn }: { navigate: (r: Route) => void; signedIn: boolean }) {
  const { t, lang, setLang } = useI18n();
  useEffect(() => {
    document.title = t('meta.changelog');
  }, [t]);
  useEffect(() => markSeen(), []);
  const go = (r: Route) => (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(r);
    window.scrollTo(0, 0);
  };
  const back: Route = signedIn ? { view: 'sbcs', setId: null, challengeId: null } : { view: 'landing' };
  const date = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  return (
    <div className="onboarding legal changelog">
      <div className="brand onboarding-top">
        <a href="/" onClick={go({ view: 'landing' })} aria-label={t('top.home')}>
          <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="186" height="48" />
        </a>
        <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
      </div>
      <article>
        <h1>
          {t('changelog.title')} <span className="changelog-version">{t('changelog.version', { v: APP_VERSION })}</span>
        </h1>
        <p className="legal-intro">{t('changelog.intro')}</p>
        {CHANGELOG.map((e) => (
          <section key={e.id} id={e.id}>
            <h2>
              <time dateTime={e.date}>{date(e.date)}</time>
              {e.version && <span className="changelog-version"> {t('changelog.version', { v: e.version })}</span>}
            </h2>
            <ul>
              {e.items[lang].map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
        ))}
      </article>
      <p>
        <a className="text" href={signedIn ? '/dashboard' : '/'} onClick={go(back)}>
          {signedIn ? t('changelog.toApp') : t('auth.publicHome')}
        </a>
      </p>
    </div>
  );
}
