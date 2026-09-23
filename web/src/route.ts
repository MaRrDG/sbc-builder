// Tiny router on the History API: the URL is the source of truth for which screen is open,
// so browser / mouse Back moves between screens instead of leaving the site.
//   /               SBC list          /sbc/16        a set (first open challenge)
//   /sbc/16/39      a challenge       /club          club
//   /settings       settings          /setup         extension setup guide
//   /guide          how it works
//   /signin         sign in (?next=)  /signin/callback  Google redirect
import { useCallback, useEffect, useState } from 'react';

export type Route =
  | { view: 'sbcs'; setId: number | null; challengeId: number | null }
  | { view: 'club' }
  | { view: 'settings' }
  | { view: 'setup' }
  | { view: 'guide' }
  | { view: 'signin'; next: string }
  | { view: 'ssoCallback' };

const id = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : null);

export function parseRoute(path: string, search = ''): Route {
  const [a, b, c] = path.split('/').filter(Boolean);
  if (a === 'signin') return b === 'callback' ? { view: 'ssoCallback' } : { view: 'signin', next: new URLSearchParams(search).get('next') ?? '/' };
  if (a === 'club') return { view: 'club' };
  if (a === 'settings') return { view: 'settings' };
  if (a === 'setup') return { view: 'setup' };
  if (a === 'guide') return { view: 'guide' };
  if (a === 'sbc' && id(b) !== null) return { view: 'sbcs', setId: id(b), challengeId: id(c) };
  return { view: 'sbcs', setId: null, challengeId: null };
}

export function routePath(r: Route): string {
  if (r.view === 'signin') return r.next && r.next !== '/' ? `/signin?next=${encodeURIComponent(r.next)}` : '/signin';
  if (r.view === 'ssoCallback') return '/signin/callback';
  if (r.view !== 'sbcs') return `/${r.view}`;
  if (r.setId === null) return '/';
  return r.challengeId === null ? `/sbc/${r.setId}` : `/sbc/${r.setId}/${r.challengeId}`;
}

/** Current route plus navigate(route, replace?). Back / Forward update it through popstate. */
export function useRoute(): [Route, (r: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname, window.location.search));

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname, window.location.search));
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
