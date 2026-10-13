import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT, LEGAL, LEGAL_DOCS } from './docs';
import { LEGAL_TITLES } from './titles';

test('every legal document exists in every language with the same sections', () => {
  for (const doc of LEGAL_DOCS) {
    const en = LEGAL.en[doc];
    for (const lang of ['ro', 'it'] as const) {
      const other = LEGAL[lang][doc];
      assert.deepEqual(other.sections.map((s) => s.id), en.sections.map((s) => s.id), `${lang}/${doc}`);
      for (const [i, s] of en.sections.entries()) assert.equal(other.sections[i].p.length, s.p.length, `${lang}/${doc}/${s.id}: paragraph count`);
    }
  }
});

test('the privacy policy names a contact in every language', () => {
  for (const lang of ['en', 'ro', 'it'] as const) assert.ok(JSON.stringify(LEGAL[lang].privacy).includes(CONTACT), lang);
});

test('refund policy exists and Paddle is named where payments are covered, in every language', () => {
  assert.ok(LEGAL_DOCS.includes('refunds'));
  for (const lang of ['en', 'ro', 'it'] as const) {
    const refunds = JSON.stringify(LEGAL[lang].refunds);
    assert.ok(refunds.includes('14') && refunds.includes('Paddle'), `${lang}/refunds`);
    for (const doc of ['terms', 'privacy', 'cookies'] as const) assert.ok(JSON.stringify(LEGAL[lang][doc]).includes('Paddle'), `${lang}/${doc}`);
  }
});

test('the footer link titles match the document titles', () => {
  for (const lang of ['en', 'ro', 'it'] as const) for (const doc of LEGAL_DOCS) assert.equal(LEGAL_TITLES[lang][doc], LEGAL[lang][doc].title);
});
