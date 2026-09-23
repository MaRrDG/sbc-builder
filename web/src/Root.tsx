// Auth gate in front of the app: Clerk loading, the Google redirect, signed-out pages
// (sign in, how it works, extension setup) and the signed-in app. Owns the one useRoute().
import { lazy, Suspense, useEffect, useState } from 'react';
import { HandleSSOCallback, useAuth, useClerk } from '@clerk/react';
import { WarningCircle } from '@phosphor-icons/react';
import { configureAuth } from './api';
import { safeNext } from './next';
import { useRoute, type Route } from './route';
import { useI18n } from './i18n';
import { LangMenu } from './components/LangMenu';
import { SignIn } from './components/SignIn';
import { Guide } from './components/Guide';
import { SetupGuide } from './components/SetupGuide';

// the signed-in app loads after the sign-in screen, which stays small
const App = lazy(() => import('./App'));

const here = () => window.location.pathname + window.location.search;

export default function Root() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [route, navigate] = useRoute();
  const { t, lang, setLang } = useI18n();
  const { signOut } = useClerk();
  const toSignIn = (next = here()): Route => ({ view: 'signin', next: safeNext(next) });
  // Clerk says signed in but the server refused even a fresh token (e.g. SITE_ORIGINS): going to
  // /signin would bounce straight back and reload forever, so say so instead
  const [refused, setRefused] = useState(false);

  // set during render: children's effects run before ours and already call the API
  configureAuth(
    isSignedIn ? (fresh) => getToken(fresh ? { skipCache: true } : undefined) : null,
    isSignedIn ? () => setRefused(true) : () => navigate(toSignIn(), true),
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

  if (refused)
    return (
      <div className="onboarding">
        <div className="brand onboarding-top">
          <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="186" height="48" />
          <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
        </div>
        <p className="signin-error" role="alert">
          <WarningCircle weight="bold" aria-hidden="true" /> {t('auth.refused')}
        </p>
        <div className="signin-row">
          <button type="button" className="ghost wide" onClick={() => window.location.reload()}>
            {t('auth.retry')}
          </button>
          <button type="button" className="ghost wide" onClick={() => void signOut({ redirectUrl: '/signin' })}>
            {t('auth.signOut')}
          </button>
        </div>
      </div>
    );

  if (route.view === 'signin') return <div className="boot" aria-busy="true" />;
  return (
    <Suspense fallback={<div className="boot" aria-busy="true" />}>
      <App route={route} navigate={navigate} />
    </Suspense>
  );
}
