// What search engines and link previews see. The site is a single-page app, so the server fills
// the <head> of index.html per public page (title, description, canonical, Open Graph) and serves
// robots.txt / sitemap.xml. Only the public pages are indexable, and only on the canonical host
// (SITE_URL): the app itself and any other host (an old domain, a preview) answer noindex.

export interface PageMeta {
  title: string;
  description: string;
}

/** Public, indexable pages. Everything else (the app under /dashboard, sign-in) is noindex. */
const PAGES: Record<string, PageMeta> = {
  '/': {
    title: 'FC Solver · EA FC 27 SBC solver for your own club',
    description:
      'Solve EA FC 27 Squad Building Challenges with the players you already own. FC Solver finds the cheapest valid squad from your club and SBC storage, checks every requirement and chemistry, and never buys, sells or submits anything.',
  },
  '/guide': {
    title: 'How FC Solver works · EA FC 27 SBC solver',
    description:
      'How FC Solver reads your EA FC 27 club and SBC list through a small Chrome extension, finds the cheapest squad for each challenge and leaves the building to you in the web app.',
  },
  '/setup': {
    title: 'Install the FC Solver extension · EA FC 27',
    description:
      'Set up the FC Solver Chrome extension in two minutes: it reads your EA FC 27 club and SBCs from the web app so FC Solver can solve them. Read-only toward EA.',
  },
};

export const pageMeta = (path: string): PageMeta | null => PAGES[path] ?? null;

/** The canonical origin: SITE_URL when set (the domain to index), else the one this request came to. */
export function siteUrl(requestOrigin: string): string {
  return (process.env.SITE_URL || requestOrigin).replace(/\/+$/, ''); // empty (compose default) = unset
}

/** Only the canonical host is indexed; without SITE_URL every host counts as canonical. */
export function isCanonicalHost(requestOrigin: string): boolean {
  return !process.env.SITE_URL || siteUrl(requestOrigin) === requestOrigin.replace(/\/+$/, '');
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Sets `content` / `href` of one tag in index.html; tags the template lacks are left alone. */
function setAttr(html: string, tag: RegExp, value: string) {
  return html.replace(tag, (_m, head: string, tail: string) => `${head}${esc(value)}${tail}`);
}
const meta = (attr: 'name' | 'property', key: string) => new RegExp(`(<meta ${attr}="${key}" content=")[^"]*(")`);

/** index.html with the head filled for this path, on this origin. */
export function renderHead(html: string, path: string, base: string, canonicalHost: boolean): string {
  const page = pageMeta(path);
  const indexable = canonicalHost && !!page;
  const url = `${base}${page ? path : '/'}`;
  const image = `${base}/og.png`;
  let out = html.replace(/__SITE__/g, base); // JSON-LD and anything else that needs the origin
  out = setAttr(out, meta('name', 'robots'), indexable ? 'index, follow' : 'noindex, nofollow');
  out = setAttr(out, /(<link rel="canonical" href=")[^"]*(")/, url);
  out = setAttr(out, meta('property', 'og:url'), url);
  out = setAttr(out, meta('property', 'og:image'), image);
  out = setAttr(out, meta('name', 'twitter:image'), image);
  if (page) {
    out = out.replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`);
    for (const [attr, key, value] of [
      ['name', 'description', page.description],
      ['property', 'og:title', page.title],
      ['property', 'og:description', page.description],
      ['name', 'twitter:title', page.title],
      ['name', 'twitter:description', page.description],
    ] as const)
      out = setAttr(out, meta(attr, key), value);
  }
  return out;
}

export function robotsTxt(base: string, canonicalHost: boolean): string {
  if (!canonicalHost) return 'User-agent: *\nDisallow: /\n';
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /dashboard',
    'Disallow: /api/',
    'Disallow: /signin',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    '',
  ].join('\n');
}

export function sitemapXml(base: string): string {
  const urls = Object.keys(PAGES)
    .map((p) => `  <url><loc>${esc(base + p)}</loc><changefreq>weekly</changefreq><priority>${p === '/' ? '1.0' : '0.6'}</priority></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}
