// Tiny router on the History API: the URL is the source of truth for which screen is open,
// so browser / mouse Back moves between screens instead of leaving the site.
//   /               SBC list          /sbc/16        a set (first open challenge)
//   /sbc/16/39      a challenge       /club          club
//   /settings       settings          /setup         extension setup guide
import { useCallback, useEffect, useState } from 'react';

export type Route =
  | { view: 'sbcs'; setId: number | null; challengeId: number | null }
  | { view: 'club' }
  | { view: 'settings' }
  | { view: 'setup' };

const id = (s: string | undefined) => (s && /^\d+$/.test(s) ? Number(s) : null);

export function parseRoute(path: string): Route {
  const [a, b, c] = path.split('/').filter(Boolean);
  if (a === 'club') return { view: 'club' };
  if (a === 'settings') return { view: 'settings' };
  if (a === 'setup') return { view: 'setup' };
  if (a === 'sbc' && id(b) !== null) return { view: 'sbcs', setId: id(b), challengeId: id(c) };
  return { view: 'sbcs', setId: null, challengeId: null };
}

export function routePath(r: Route): string {
  if (r.view !== 'sbcs') return `/${r.view}`;
  if (r.setId === null) return '/';
  return r.challengeId === null ? `/sbc/${r.setId}` : `/sbc/${r.setId}/${r.challengeId}`;
}

/** Current route plus navigate(route, replace?). Back / Forward update it through popstate. */
export function useRoute(): [Route, (r: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));

  useEffect(() => {
    const onPop = () => setRoute(parseRoute(window.location.pathname));
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = useCallback((r: Route, replace = false) => {
    const path = routePath(r);
    if (path !== window.location.pathname) {
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
