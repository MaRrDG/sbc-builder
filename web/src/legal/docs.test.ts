import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT, LEGAL, LEGAL_DOCS } from './docs';

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
