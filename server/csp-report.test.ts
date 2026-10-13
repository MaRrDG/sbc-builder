import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compactCspReport, cspHeaderName, originOnly } from './csp-report.js';

const policy = 'x'.repeat(2000);

test('legacy report: compact, origin only, no policy', () => {
  const out = compactCspReport({
    'csp-report': {
      'document-uri': 'https://fc-solver.app/dashboard/sbc?token=abc',
      'original-policy': policy,
      'effective-directive': 'connect-src',
      'violated-directive': 'connect-src',
      'blocked-uri': 'https://api.example.com/v1/x?key=secret',
      'source-file': 'https://fc-solver.app/assets/index-abc.js',
      'line-number': 12,
    },
  });
  assert.deepEqual(out, [
    { page: '/dashboard/sbc', directive: 'connect-src', blocked: 'https://api.example.com', source: 'https://fc-solver.app', line: 12 },
  ]);
  assert.ok(!JSON.stringify(out).includes('xxxx'));
});

test('Reporting API array', () => {
  const out = compactCspReport([
    { type: 'csp-violation', body: { documentURL: 'https://a.example/', effectiveDirective: 'script-src-elem', blockedURL: 'inline', lineNumber: 3 } },
  ]);
  assert.deepEqual(out, [{ page: '/', directive: 'script-src-elem', blocked: 'inline', source: null, line: 3 }]);
});

test('garbage bodies give nothing or nulls', () => {
  assert.deepEqual(compactCspReport(null), []);
  assert.deepEqual(compactCspReport('x'), []);
  assert.deepEqual(compactCspReport({}), [{ page: null, directive: null, blocked: null, source: null, line: null }]);
});

test('originOnly keeps schemes for non-http', () => {
  assert.equal(originOnly('data:image/png;base64,AAA'), 'data');
  assert.equal(originOnly('blob:https://a.example/123'), 'blob');
  assert.equal(originOnly('eval'), 'eval');
  assert.equal(originOnly(''), null);
});

test('enforce only on CSP_ENFORCE=1', () => {
  assert.equal(cspHeaderName('1'), 'Content-Security-Policy');
  assert.equal(cspHeaderName(undefined), 'Content-Security-Policy-Report-Only');
  assert.equal(cspHeaderName(''), 'Content-Security-Policy-Report-Only');
  assert.equal(cspHeaderName('true'), 'Content-Security-Policy-Report-Only');
});

test('non-URL blocked value loses query and fragment before the cut', () => {
  assert.equal(originOnly('not a url?token=secret#frag'), 'not a url');
  assert.equal(originOnly('inline'), 'inline');
  assert.equal(originOnly('x'.repeat(60) + '?a=b'), 'x'.repeat(40));
});
