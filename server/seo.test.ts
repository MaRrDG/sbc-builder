import { test } from 'node:test';
import assert from 'node:assert/strict';
import { analyticsOrigins, isCanonicalHost, pageMeta, renderHead, robotsTxt, siteUrl, sitemapXml, withAnalytics } from './seo.js';

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
</head></html>`;

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
