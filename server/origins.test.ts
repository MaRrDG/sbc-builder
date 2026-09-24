import { test } from 'node:test';
import assert from 'node:assert/strict';
import { publicOrigin, siteOrigins } from './origins.js';

function withEnv(env: Record<string, string | undefined>, fn: () => void) {
  const prev = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete process.env[k];
  else process.env[k] = v;
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(prev)) if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

test('our own origins pass through', () => {
  withEnv({ SITE_ORIGINS: 'https://a.example,http://localhost:5173', SITE_URL: undefined }, () => {
    assert.equal(publicOrigin('https://a.example'), 'https://a.example');
    assert.equal(publicOrigin('http://localhost:5173'), 'http://localhost:5173');
  });
});

test('a spoofed Host / X-Forwarded-Host falls back to our domain', () => {
  withEnv({ SITE_ORIGINS: 'http://localhost:5173,https://a.example', SITE_URL: undefined }, () => {
    assert.equal(publicOrigin('https://evil.example'), 'https://a.example'); // first https one
  });
  withEnv({ SITE_ORIGINS: 'https://a.example', SITE_URL: 'https://new.example/' }, () => {
    assert.equal(publicOrigin('https://evil.example'), 'https://new.example');
    assert.equal(publicOrigin('https://new.example'), 'https://new.example'); // SITE_URL counts as ours
  });
});

test('SITE_URL joins the list; empty values are ignored', () => {
  withEnv({ SITE_ORIGINS: 'https://a.example, ,', SITE_URL: 'https://new.example' }, () => {
    assert.deepEqual(siteOrigins(), ['https://a.example', 'https://new.example']);
  });
  withEnv({ SITE_ORIGINS: undefined, SITE_URL: '' }, () => {
    assert.ok(siteOrigins().includes('https://sbc-builder.mario-theodor.ro'));
  });
});
