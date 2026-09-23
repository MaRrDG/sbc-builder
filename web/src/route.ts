// Tiny router on the History API: the URL is the source of truth for which screen is open,
// so browser / mouse Back moves between screens instead of leaving the site.
//   /                     landing page (public)
//   /dashboard            SBC list          /dashboard/sbc/16      a set (first open challenge)
//   /dashboard/sbc/16/39  a challenge       /dashboard/club        club
//   /dashboard/settings   settings          /dashboard/admin       admin dashboard (admins only)
//   /setup                extension setup   /guide                 how it works
//   /signin               sign in (?next=)  /signin/callback       Google redirect
// Old app paths without /dashboard (/sbc/16, /club, ...) still parse; useRoute rewrites the address bar.
import { useCallback, useEffect, useState } from 'react';

export type Route =
  | { view: 'landing' }
  | { view: 'sbcs'; setId: number | null; challengeId: number | null }
  | { view: 'club' }
  | { view: 'settings' }
  | { view: 'setup' }
  | { view: 'guide' }
  | { view: 'admin' }
  | { view: 'signin'; next: string }
  | { view: 'ssoCallback' };

const id = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : null);

export function parseRoute(path: string, search = ''): Route {
  const parts = path.split('/').filter(Boolean);
  const [a, b] = parts;
  if (a === undefined) return { view: 'landing' };
  if (a === 'signin') return b === 'callback' ? { view: 'ssoCallback' } : { view: 'signin', next: new URLSearchParams(search).get('next') ?? '/dashboard' };
  if (a === 'setup') return { view: 'setup' };
  if (a === 'guide') return { view: 'guide' };
  const [x, y, z] = a === 'dashboard' ? parts.slice(1) : parts;
  if (x === 'club') return { view: 'club' };
  if (x === 'settings') return { view: 'settings' };
  if (x === 'admin') return { view: 'admin' };
  if (x === 'sbc' && id(y) !== null) return { view: 'sbcs', setId: id(y), challengeId: id(z) };
  return { view: 'sbcs', setId: null, challengeId: null };
}

export function routePath(r: Route): string {
  switch (r.view) {
    case 'landing':
      return '/';
    case 'signin':
      return r.next && r.next !== '/dashboard' ? `/signin?next=${encodeURIComponent(r.next)}` : '/signin';
    case 'ssoCallback':
      return '/signin/callback';
    case 'setup':
    case 'guide':
      return `/${r.view}`;
    case 'club':
    case 'settings':
    case 'admin':
      return `/dashboard/${r.view}`;
    case 'sbcs':
      if (r.setId === null) return '/dashboard';
      return r.challengeId === null ? `/dashboard/sbc/${r.setId}` : `/dashboard/sbc/${r.setId}/${r.challengeId}`;
  }
}

/** Where the address bar should be for this route, or null when it already is (sign-in keeps its query). */
export function canonicalPath(r: Route, pathname: string): string | null {
  if (r.view === 'signin' || r.view === 'ssoCallback') return null;
  const want = routePath(r);
  return want === pathname ? null : want;
}

const here = (): Route => {
  const r = parseRoute(window.location.pathname, window.location.search);
  const fixed = canonicalPath(r, window.location.pathname);
  if (fixed) history.replaceState(history.state, '', fixed + window.location.search);
  return r;
};

/** Current route plus navigate(route, replace?). Back / Forward update it through popstate. */
export function useRoute(): [Route, (r: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname, window.location.search));

  useEffect(() => {
    here(); // old bookmark (/club, /sbc/16) → /dashboard/...
    const onPop = () => setRoute(here());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((r: Route, replace = false) => {
    const path = routePath(r);
    if (path !== window.location.pathname + window.location.search) {
      // query strings like ?update=1 only matter on arrival
      // entries we push are marked, so "close" can go back only when the previous page is ours
      if (replace) history.replaceState(history.state, '', path);
      else history.pushState({ fcSolver: true }, '', path);
    }
    setRoute(r);
  }, []);

  return [route, navigate];
}

/** True when Back would stay inside FC Solver. */
export const canGoBack = () => !!(history.state as { fcSolver?: boolean } | null)?.fcSolver;
