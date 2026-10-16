import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setBody, setHead, setJsonLd } from './html.js';
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
