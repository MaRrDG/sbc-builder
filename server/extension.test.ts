import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isLocalOrigin, publicManifest } from './extension.js';

const base = {
  version: '1.0.3',
  host_permissions: ['https://www.ea.com/x/*', 'https://fc-solver.app/*', 'http://localhost/*', 'http://127.0.0.1/*'],
  content_scripts: [
    { matches: ['https://www.ea.com/x/*'], js: ['hook.js'] },
    { matches: ['https://fc-solver.app/*', 'http://localhost:5173/*', 'http://127.0.0.1:5178/*'], js: ['site.js'] },
    { matches: ['http://localhost:5173/*'], js: ['dev.js'] },
  ],
  externally_connectable: { matches: ['https://fc-solver.app/*', 'http://localhost:5173/*'] },
};

test('isLocalOrigin', () => {
  assert.equal(isLocalOrigin('http://localhost:5178'), true);
  assert.equal(isLocalOrigin('http://127.0.0.1:5173'), true);
  assert.equal(isLocalOrigin('https://fc-solver.app'), false);
  assert.equal(isLocalOrigin('https://localhost.evil.com'), false);
});

test('public origin: localhost entries dropped everywhere', () => {
  const m = publicManifest(base, 'https://sbc-builder.mario-theodor.ro');
  assert.deepEqual(m.host_permissions, ['https://www.ea.com/x/*', 'https://fc-solver.app/*', 'https://sbc-builder.mario-theodor.ro/*']);
  assert.deepEqual(m.content_scripts, [
    { matches: ['https://www.ea.com/x/*'], js: ['hook.js'] },
    { matches: ['https://fc-solver.app/*'], js: ['site.js'] },
  ]);
  assert.deepEqual(m.externally_connectable, { matches: ['https://fc-solver.app/*'] });
  assert.equal(m.version, '1.0.3');
  assert.equal(base.host_permissions.length, 4); // input untouched
});

test('own origin added once', () => {
  const m = publicManifest(base, 'https://fc-solver.app');
  assert.equal(m.host_permissions!.filter((p) => p === 'https://fc-solver.app/*').length, 1);
});

test('local origin: manifest kept as is (plus the origin)', () => {
  const m = publicManifest(base, 'http://localhost:5178');
  assert.deepEqual(m.host_permissions, [...base.host_permissions, 'http://localhost:5178/*']);
  assert.deepEqual(m.content_scripts, base.content_scripts);
  assert.deepEqual(m.externally_connectable, base.externally_connectable);
});

test('the real manifest keeps the site content script on a public origin', () => {
  const real = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
  const m = publicManifest(real, 'https://fc-solver.app');
  assert.ok(!JSON.stringify(m).includes('localhost'));
  assert.ok(!JSON.stringify(m).includes('127.0.0.1'));
  assert.equal(m.content_scripts!.length, real.content_scripts.length);
});
