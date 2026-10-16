// Which site paths are real pages. The site shows its 404 page for the rest and the server
// answers them with status 404 (server/index.ts), so both read this one list.

/** First path segments outside the app. */
const PUBLIC = new Set(['signin', 'setup', 'guide', 'daily', 'terms', 'privacy', 'cookies', 'refunds', 'changelog', 'sbcs']);
/** App screens, under /dashboard (old links without /dashboard still work). */
const APP = new Set(['sbc', 'club', 'evolutions', 'settings', 'accounts', 'invite', 'upgrade', 'objectives', 'gallery', 'squads', 'admin']);

/** True when the path is a page of the site; only the first one or two segments are checked. */
export function isKnownPath(path: string): boolean {
  const [a, b] = path.split('/').filter(Boolean);
  if (a === undefined || PUBLIC.has(a)) return true;
  if (a === 'dashboard') return b === undefined || APP.has(b);
  return APP.has(a);
}
