import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsFor, analyticsOrigins, analyticsWarnings, isCanonicalHost, pageMeta, renderHead, robotsTxt, siteUrl, sitemapXml, withAnalytics } from './seo.js';

const HTML = `<html><head>
<title>FC Solver</title>
<meta name="description" content="old" />
<meta name="robots" content="index, follow" />
<link rel="canonical" href="/" />
<meta property="og:title" content="old" />
<meta property="og:description" content="old" />
<meta property="og:url" content="/" />
<meta property="og:image" content="/og.png" />
<meta name="twitter:title" content="old" />
<meta name="twitter:description" content="old" />
<meta name="twitter:image" content="/og.png" />
</head><body><div id="root"><main class="seo-fallback">old</main></div>
<script type="module" src="/x.js"></script></body></html>`;

test('public pages have their own meta, the app has none', () => {
  assert.ok(pageMeta('/')?.title);
  assert.ok(pageMeta('/guide')?.title);
  assert.equal(pageMeta('/dashboard'), null);
  assert.equal(pageMeta('/dashboard/club'), null);
  assert.equal(pageMeta('/signin'), null);
});

test('head on the canonical host: absolute URLs, indexable', () => {
  const out = renderHead(HTML, '/guide', 'https://fcsolver.gg', true);
  assert.match(out, /<link rel="canonical" href="https:\/\/fcsolver\.gg\/guide" \/>/);
  assert.match(out, /<meta property="og:url" content="https:\/\/fcsolver\.gg\/guide" \/>/);
  assert.match(out, /<meta property="og:image" content="https:\/\/fcsolver\.gg\/og\.png" \/>/);
  assert.match(out, /<meta name="twitter:image" content="https:\/\/fcsolver\.gg\/og\.png" \/>/);
  assert.match(out, /<meta name="robots" content="index, follow" \/>/);
  assert.match(out, new RegExp(`<title>${pageMeta('/guide')!.title}</title>`));
  assert.doesNotMatch(out, /content="old"/);
});

test('app pages and other hosts are noindex', () => {
  assert.match(renderHead(HTML, '/dashboard/club', 'https://fcsolver.gg', true), /<meta name="robots" content="noindex, nofollow" \/>/);
  assert.match(renderHead(HTML, '/', 'https://old.example.com', false), /<meta name="robots" content="noindex, nofollow" \/>/);
});

test('/daily/practice shares the /daily head and canonical, and stays out of the sitemap', () => {
  assert.deepEqual(pageMeta('/daily/practice'), pageMeta('/daily'));
  const out = renderHead(HTML, '/daily/practice', 'https://fcsolver.gg', true);
  assert.match(out, /<link rel="canonical" href="https:\/\/fcsolver\.gg\/daily" \/>/);
  assert.match(out, /<meta name="robots" content="index, follow" \/>/);
  assert.doesNotMatch(sitemapXml('https://fcsolver.gg'), /daily\/practice/);
});

test('meta text is escaped', () => {
  assert.doesNotMatch(renderHead(HTML, '/', 'https://a.b', true), /content="[^"]*<[^"]*"/);
});

test('robots.txt: canonical host lists the sitemap, any other host is closed', () => {
  const ok = robotsTxt('https://fcsolver.gg', true);
  assert.match(ok, /Disallow: \/dashboard/);
  assert.match(ok, /Disallow: \/api\//);
  assert.match(ok, /Sitemap: https:\/\/fcsolver\.gg\/sitemap\.xml/);
  assert.equal(robotsTxt('https://old.example.com', false), 'User-agent: *\nDisallow: /\n');
});

test('sitemap lists the public pages with absolute URLs', () => {
  const xml = sitemapXml('https://fcsolver.gg');
  assert.match(xml, /<loc>https:\/\/fcsolver\.gg\/<\/loc>/);
  assert.match(xml, /<loc>https:\/\/fcsolver\.gg\/guide<\/loc>/);
  assert.doesNotMatch(xml, /dashboard/);
});

test('SITE_URL picks the canonical host; without it every host is canonical', () => {
  const prev = process.env.SITE_URL;
  try {
    delete process.env.SITE_URL;
    assert.equal(siteUrl('https://a.example/'), 'https://a.example');
    assert.equal(isCanonicalHost('https://a.example'), true);
    process.env.SITE_URL = 'https://fcsolver.gg/';
    assert.equal(siteUrl('https://old.example'), 'https://fcsolver.gg');
    assert.equal(isCanonicalHost('https://fcsolver.gg'), true);
    assert.equal(isCanonicalHost('https://old.example'), false);
  } finally {
    if (prev === undefined) delete process.env.SITE_URL;
    else process.env.SITE_URL = prev;
  }
});

test('analytics snippet: injected into <head>, its origins go to the CSP', () => {
  const tag = '<script defer src="https://stats.example.eu/script.js" data-site="abc" data-api-host="https://collect.example.eu"></script>';
  assert.deepEqual(analyticsOrigins(tag), ['https://stats.example.eu', 'https://collect.example.eu']);
  assert.match(withAnalytics('<head></head>', tag), /<script defer src="https:\/\/stats\.example\.eu\/script\.js"[^<]*<\/script>\n  <\/head>/);
  assert.equal(withAnalytics('<head></head>', ''), '<head></head>');
  assert.deepEqual(analyticsOrigins(''), []);
});

test('the preview image URL carries its version', () => {
  const out = renderHead(HTML, '/', 'https://fcsolver.gg', true, 'abc123');
  assert.match(out, /<meta property="og:image" content="https:\/\/fcsolver\.gg\/og\.png\?v=abc123" \/>/);
  assert.match(out, /<meta name="twitter:image" content="https:\/\/fcsolver\.gg\/og\.png\?v=abc123" \/>/);
});

test('analytics: never on admin pages', () => {
  assert.equal(analyticsFor('/dashboard/admin'), false);
  assert.equal(analyticsFor('/dashboard/admin/users/x'), false);
  assert.equal(analyticsFor('/dashboard/administrator'), true);
  assert.equal(analyticsFor('/dashboard'), true);
  assert.equal(analyticsFor('/daily'), true);
});

test('analytics snippet warnings: cookieless, deferred, site and domain set', () => {
  const ok = '<script defer src="https://owt.example/script.cookieless.js" data-website-id="abc" data-domain="fc-solver.app"></script>';
  assert.deepEqual(analyticsWarnings(ok), []);
  assert.deepEqual(analyticsWarnings(''), []);
  assert.equal(analyticsWarnings(ok.replace('script.cookieless.js', 'script.js')).length, 1);
  assert.equal(analyticsWarnings(ok.replace('defer ', '')).length, 1);
  assert.equal(analyticsWarnings(ok.replace(' data-domain="fc-solver.app"', '')).length, 1);
  assert.equal(analyticsWarnings(ok.replace(' data-website-id="abc"', '')).length, 1);
});

test('home and guide meta carry the search terms', () => {
  const home = pageMeta('/')!;
  assert.match(home.title, /SBC Solver/);
  assert.match(home.title, /Builder/);
  assert.match(home.description, /SBC builder/i);
  assert.match(pageMeta('/guide')!.description, /SBC solver/i);
});

test('a dynamic page fills head, body and json-ld', () => {
  const out = renderHead(HTML, '/sbcs/marquee-matchups-16', 'https://fc-solver.app', true, '', {
    meta: { title: 'MM SBC', description: 'desc' }, body: '<main>NEW</main>', jsonLd: '<script type="application/ld+json">{}</script>', canonical: '/sbcs/marquee-matchups-16',
  });
  assert.match(out, /<title>MM SBC<\/title>/);
  assert.match(out, /<meta name="robots" content="index, follow" \/>/);
  assert.match(out, /href="https:\/\/fc-solver\.app\/sbcs\/marquee-matchups-16"/);
  assert.match(out, /<div id="root"><main>NEW<\/main><\/div>/);
  assert.ok(!out.includes('old'));
  assert.match(out, /application\/ld\+json">\{\}<\/script>\s*<\/head>/);
  assert.match(out, /<script type="module" src="\/x.js">/);
});

test('sitemap takes extra entries with lastmod', () => {
  const xml = sitemapXml('https://fc-solver.app', [{ path: '/sbcs/a-1', lastmod: '2026-10-16' }]);
  assert.match(xml, /<loc>https:\/\/fc-solver\.app\/sbcs\/a-1<\/loc><lastmod>2026-10-16<\/lastmod>/);
});

test('a dynamic page replaces the root when the script sits in the head', () => {
  const html = '<html><head><title>x</title></head><body>\n<div id="root">\n<main>old</main>\n</div>\n</body></html>';
  const out = renderHead(html, '/sbcs', 'https://a.b', true, '', { meta: { title: 't', description: 'd' }, body: '<main>NEW</main>', jsonLd: '', canonical: '/sbcs' });
  assert.match(out, /<div id="root"><main>NEW<\/main><\/div>/);
  assert.ok(!out.includes('old'));
});
