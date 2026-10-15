// Auth gate in front of the app: Clerk loading, the Google redirect, signed-out pages
// (sign in, how it works, extension setup) and the signed-in app. Owns the one useRoute().
import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { HandleSSOCallback, useAuth, useClerk } from '@clerk/react';
import { WarningCircle, Wrench } from '@phosphor-icons/react';
import { api, configureAuth, onMaintenance } from './api';
import { safeNext } from './next';
import { useRoute, type Route } from './route';
import { useI18n } from './i18n';
import { LangMenu } from './components/LangMenu';
import { LegalLinks } from './legal/LegalLinks';
import { BootSkeleton } from './components/BootSkeleton';
import { LoadBoundary } from './components/LoadBoundary';
import { cacheClear, cacheKeep } from './cache';
import { SignIn } from './components/SignIn';
import { track, yn } from './track';

// the signed-in app loads after the sign-in screen, which stays small
const loadApp = () => import('./App');
// the dashboard's code downloads while Clerk loads, not after
if (window.location.pathname.startsWith('/dashboard')) void loadApp();
const App = lazy(loadApp);
const LegalPage = lazy(() => import('./legal/LegalPage').then((m) => ({ default: m.LegalPage })));
const ChangelogPage = lazy(() => import('./changelog/ChangelogPage').then((m) => ({ default: m.ChangelogPage })));
const Guide = lazy(() => import('./components/Guide').then((m) => ({ default: m.Guide })));
const SetupGuide = lazy(() => import('./components/SetupGuide').then((m) => ({ default: m.SetupGuide })));
const Landing = lazy(() => import('./landing/Landing'));
const Daily = lazy(() => import('./daily/Daily'));
const NotFound = lazy(() => import('./notfound/NotFound'));

/** A blank page in the site's background: what public pages show while their code or Clerk loads. */
const Blank = () => <div className="boot" aria-busy="true" />;

/** A lazy screen: the dashboard skeleton (`app`) or a blank page while its code loads, a reload note if the code cannot load. */
const Lazy = ({ children, app = false }: { children: ReactNode; app?: boolean }) => (
  <LoadBoundary>
    <Suspense fallback={app ? <BootSkeleton /> : <Blank />}>{children}</Suspense>
  </LoadBoundary>
);

const here = () => window.location.pathname + window.location.search;

export default function Root() {
  const { isLoaded, isSignedIn, getToken, userId } = useAuth();
  const [route, navigate] = useRoute();
  const { t, lang, setLang } = useI18n();
  const clerk = useClerk();
  const { signOut } = clerk;
  const toSignIn = (next = here()): Route => ({ view: 'signin', next: safeNext(next) });
  // Clerk says signed in but the server refused even a fresh token (e.g. SITE_ORIGINS): going to
  // /signin would bounce straight back and reload forever, so say so instead
  const [refused, setRefused] = useState(false);
  // maintenance mode: the admin's note ('' without one); null while the site is open
  const [maint, setMaint] = useState<string | null>(null);
  onMaintenance(() => void api.maintenance().then((s) => setMaint(s.maintenance ? s.note : null), () => setMaint('')));
  // back as soon as the admin switches it off
  useEffect(() => {
    if (maint === null) return;
    const id = setInterval(() => void api.maintenance().then((s) => { if (!s.maintenance) window.location.reload(); }, () => {}), 60_000);
    return () => clearInterval(id);
  }, [maint]);

  // set during render: children's effects run before ours and already call the API
  configureAuth(
    isSignedIn ? (fresh) => getToken(fresh ? { skipCache: true } : undefined) : null,
    isSignedIn ? () => setRefused(true) : () => navigate(toSignIn(), true),
  );

  const publicView = route.view === 'landing' || route.view === 'legal' || route.view === 'changelog' || route.view === 'signin' || route.view === 'ssoCallback' || route.view === 'guide' || route.view === 'setup' || route.view === 'daily' || route.view === 'notFound';
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn && !publicView) navigate(toSignIn(), true);
    if (isSignedIn && route.view === 'signin') window.location.replace(safeNext(route.next));
  }, [isLoaded, isSignedIn, publicView, route]); // eslint-disable-line react-hooks/exhaustive-deps

  // a shared PC: nothing of the last user stays in this browser
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) void cacheClear();
    else if (userId) void cacheKeep(userId);
  }, [isLoaded, isSignedIn, userId]);

  // public pages name the tab themselves (the server fills <head> only on a full load, see server/seo.ts);
  // the signed-in app sets its own titles
  useEffect(() => {
    const titled = route.view === 'landing' || route.view === 'guide' || route.view === 'setup' || route.view === 'signin' || route.view === 'daily';
    if (titled && (route.view === 'landing' || route.view === 'daily' || !isSignedIn)) document.title = t(`meta.${route.view}`);
  }, [route.view, isSignedIn, t]);

  // legal pages, like the landing page, are for everyone and do not wait for Clerk
  if (route.view === 'legal')
    return (
      <Lazy>
        <LegalPage doc={route.doc} navigate={navigate} />
      </Lazy>
    );
  if (route.view === 'changelog')
    return (
      <Lazy>
        <ChangelogPage navigate={navigate} signedIn={!!isSignedIn} />
      </Lazy>
    );

  // the landing page is for everyone and does not wait for Clerk
  if (route.view === 'landing')
    return (
      <Lazy>
        <Landing signedIn={!!isSignedIn} authReady={isLoaded} navigate={navigate} />
      </Lazy>
    );

  // the Daily game is public; it waits for Clerk only to know whether stats are saved to an account
  if (route.view === 'daily')
    return (
      <Lazy>
        <Daily signedIn={!!isSignedIn} authReady={isLoaded} practice={route.practice} navigate={navigate} />
      </Lazy>
    );

  // an unknown address: the 404 walkout, for everyone, without waiting for Clerk
  if (route.view === 'notFound')
    return (
      <Lazy>
        <NotFound path={route.path} signedIn={!!isSignedIn} navigate={navigate} />
      </Lazy>
    );

  // only the dashboard gets its own shape; public pages stay blank instead of flashing a dashboard
  if (!isLoaded) return publicView ? <Blank /> : <BootSkeleton />;

  if (route.view === 'ssoCallback')
    return (
      <div className="boot" aria-busy="true">
        <span className="sr-only">{t('auth.finishing')}</span>
        <HandleSSOCallback
          navigateToApp={({ decorateUrl }) => {
            const created = clerk.user?.createdAt?.getTime() ?? 0;
            track('signin_done', { method: 'google', new: yn(Date.now() - created < 10 * 60_000) }); // a Google sign-up lands here too
            window.location.replace(decorateUrl('/dashboard'));
          }}
          navigateToSignIn={() => navigate(toSignIn('/dashboard'), true)}
          navigateToSignUp={() => navigate(toSignIn('/dashboard'), true)}
        />
      </div>
    );

  if (!isSignedIn) {
    const body =
      route.view === 'guide' ? <Guide eaLimit={150} />
      : route.view === 'setup' ? <SetupGuide />
      : <SignIn next={route.view === 'signin' ? safeNext(route.next) : '/dashboard'} onDone={(p) => window.location.replace(p)} />;
    return (
      <div className="onboarding">
        <div className="brand onboarding-top">
          <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="186" height="48" />
          <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
        </div>
        {route.view !== 'signin' && (
          <p>
            <button
              type="button"
              className="text"
              onClick={() => {
                navigate({ view: 'landing' });
                window.scrollTo(0, 0);
              }}
            >
              {t('auth.publicHome')}
            </button>
          </p>
        )}
        <Lazy>{body}</Lazy>
        <LegalLinks navigate={navigate} />
      </div>
    );
  }

  if (maint !== null)
    return (
      <div className="onboarding">
        <div className="brand onboarding-top">
          <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="186" height="48" />
          <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
        </div>
        <h1 className="maint-title">
          <Wrench weight="bold" aria-hidden="true" /> {t('maint.title')}
        </h1>
        <p role="status">{t('maint.body')}</p>
        {maint && <p className="maint-note">{maint}</p>}
        <div className="signin-row">
          <button type="button" className="ghost wide" onClick={() => window.location.reload()}>
            {t('auth.retry')}
          </button>
        </div>
        <LegalLinks navigate={navigate} />
      </div>
    );

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
          <button type="button" className="ghost wide" onClick={() => void cacheClear().then(() => signOut({ redirectUrl: '/signin' }))}>
            {t('auth.signOut')}
          </button>
        </div>
      </div>
    );

  if (route.view === 'signin') return <Blank />;
  return (
    <Lazy app>
      <App route={route} navigate={navigate} userId={userId!} />
    </Lazy>
  );
}
