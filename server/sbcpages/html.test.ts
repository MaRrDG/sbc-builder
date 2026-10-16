import { test } from 'node:test';
import assert from 'node:assert/strict';
import { en } from '../../web/src/locales/en.js';
import { HUB_INTRO, howTo, hubBody, hubHead, setBody, setHead, setJsonLd } from './html.js';
import type { SbcSetView } from './view.js';

const evil: SbcSetView = { id: 9, path: '/sbcs/x-9', name: 'A <b>&"</script>', description: '<img src=x onerror=1>', categoryId: null, endTime: null, expired: false,
  repeatability: 'once', repeats: null, refreshHours: null, rewards: ['<i>'], challenges: [{ id: 1, name: '<c>', formation: null, requirements: ['<r>'], rewards: [] }], stats: { solvers: 7, foundPct: 86 } };

test('body escapes EA text', () => {
  const b = setBody(evil);
  assert.ok(!b.includes('<b>') && !b.includes('<img') && !b.includes('<c>') && !b.includes('<r>') && !b.includes('<i>'));
  assert.match(b, /&lt;b&gt;&amp;&quot;/);
  assert.match(b, /<h1>/);
  assert.match(b, /7 FC Solver players/);
});

test('json-ld cannot close its script tag', () => {
  const j = setJsonLd(evil, 'https://fc-solver.app');
  assert.equal(j.match(/<\/script>/g)?.length, 1);
  assert.doesNotThrow(() => JSON.parse(j.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '')));
});

test('head names the set and the search terms', () => {
  const h = setHead({ ...evil, name: 'Marquee Matchups' });
  assert.equal(h.title, 'Marquee Matchups SBC · cheapest solution from your club · FC Solver');
  assert.match(h.description, /SBC solver/);
});

test('a broken end time does not throw', () => {
  const bad = { ...evil, endTime: 1e20 };
  assert.doesNotThrow(() => setBody(bad));
  assert.ok(!setBody(bad).includes('Ends'));
});

test('formation reads as 4-4-2; expired sets have no solve link', () => {
  const live = setBody({ ...evil, challenges: [{ ...evil.challenges[0], formation: 'f442' }] });
  assert.match(live, /Formation: 4-4-2/);
  assert.match(live, /href="\/signin"/);
  const old = setBody({ ...evil, expired: true });
  assert.ok(!old.includes('/signin'));
  assert.match(old, /href="\/sbcs"[^>]*>See live SBCs/);
});

test('the app shows the same SEO text as the server HTML (en)', () => {
  const name = 'Marquee Matchups';
  const fill = (k: keyof typeof en) => en[k].replace('{name}', name);
  assert.equal(fill('meta.sbcSet'), setHead({ ...evil, name }).title);
  assert.equal(en['meta.sbcHub'], hubHead().title);
  assert.equal(fill('sbcpages.howBody'), howTo(name));
  assert.equal(en['sbcpages.hubIntro'], HUB_INTRO);
  assert.ok(hubBody([]).includes(`<h1>${en['sbcpages.hubTitle']}</h1>`));
  assert.ok(setJsonLd({ ...evil, name }, 'https://x').includes(JSON.stringify(howTo(name)).slice(1, -1)));
});
