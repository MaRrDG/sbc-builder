// The origins FC Solver is served from. Clerk tokens must name one of them, and anything built
// from the request's Host / X-Forwarded-Host (extension zip, robots.txt, sitemap, canonical links)
// only ever uses one of them: those headers come from the client, and a cached answer built from
// a spoofed one would point everybody at someone else's server.

const DEFAULT_ORIGINS =
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5178,http://127.0.0.1:5178,https://sbc-builder.mario-theodor.ro';

const trim = (s: string) => s.trim().replace(/\/+$/, '');

/** SITE_ORIGINS (comma list) plus SITE_URL. Read on each call: .env is loaded after imports. */
export function siteOrigins(): string[] {
  const list = (process.env.SITE_ORIGINS ?? DEFAULT_ORIGINS).split(',').map(trim).filter(Boolean);
  const site = trim(process.env.SITE_URL ?? '');
  return site && !list.includes(site) ? [...list, site] : list;
}

/** The claimed origin when it is ours, else the canonical one (SITE_URL, else our first https origin). */
export function publicOrigin(claimed: string): string {
  const origins = siteOrigins();
  const c = trim(claimed);
  if (origins.includes(c)) return c;
  return trim(process.env.SITE_URL ?? '') || origins.find((o) => o.startsWith('https://')) || origins[0];
}
