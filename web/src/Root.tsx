// Auth gate in front of the app: Clerk loading, the Google redirect, signed-out pages
// (sign in, how it works, extension setup) and the signed-in app. Owns the one useRoute().
import { useEffect } from 'react';
import { HandleSSOCallback, useAuth } from '@clerk/react';
import App from './App';
import { configureAuth } from './api';
import { safeNext } from './next';
import { useRoute, type Route } from './route';
import { useI18n } from './i18n';
import { LangMenu } from './components/LangMenu';
import { SignIn } from './components/SignIn';
import { Guide } from './components/Guide';
import { SetupGuide } from './components/SetupGuide';

const here = () => window.location.pathname + window.location.search;

export default function Root() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [route, navigate] = useRoute();
  const { t, lang, setLang } = useI18n();
  const toSignIn = (next = here()): Route => ({ view: 'signin', next: safeNext(next) });

  // set during render: children's effects run before ours and already call the API
  configureAuth(isSignedIn ? (fresh) => getToken(fresh ? { skipCache: true } : undefined) : null, () =>
    navigate(toSignIn(), true),
  );

  const publicView = route.view === 'signin' || route.view === 'ssoCallback' || route.view === 'guide' || route.view === 'setup';
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn && !publicView) navigate(toSignIn(), true);
    if (isSignedIn && route.view === 'signin') window.location.replace(safeNext(route.next));
  }, [isLoaded, isSignedIn, publicView, route]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoaded) return <div className="boot" aria-busy="true" />;

  if (route.view === 'ssoCallback')
    return (
      <div className="boot" aria-busy="true">
        <span className="sr-only">{t('auth.finishing')}</span>
        <HandleSSOCallback
          navigateToApp={({ decorateUrl }) => {
            window.location.replace(decorateUrl('/'));
          }}
          navigateToSignIn={() => navigate(toSignIn('/'), true)}
          navigateToSignUp={() => navigate(toSignIn('/'), true)}
        />
      </div>
    );

  if (!isSignedIn) {
    const body =
      route.view === 'guide' ? <Guide clubSyncs={3} eaLimit={150} />
      : route.view === 'setup' ? <SetupGuide />
      : <SignIn next={route.view === 'signin' ? safeNext(route.next) : '/'} onDone={(p) => window.location.replace(p)} />;
    return (
      <div className="onboarding">
        <div className="brand onboarding-top">
          <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="186" height="48" />
          <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
        </div>
        {route.view !== 'signin' && (
          <p>
            <button type="button" className="text" onClick={() => navigate(toSignIn('/'))}>
              {t('auth.publicHome')}
            </button>
          </p>
        )}
        {body}
      </div>
    );
  }

  if (route.view === 'signin') return <div className="boot" aria-busy="true" />;
  return <App route={route} navigate={navigate} />;
}
