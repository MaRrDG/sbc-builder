import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTACT, LEGAL, LEGAL_DOCS } from './docs';

test('every legal document exists in both languages with the same sections', () => {
  for (const doc of LEGAL_DOCS) {
    const en = LEGAL.en[doc];
    const ro = LEGAL.ro[doc];
    assert.deepEqual(ro.sections.map((s) => s.id), en.sections.map((s) => s.id), doc);
    for (const [i, s] of en.sections.entries()) assert.equal(ro.sections[i].p.length, s.p.length, `${doc}/${s.id}: paragraph count`);
  }
});

test('the privacy policy names a contact in both languages', () => {
  for (const lang of ['en', 'ro'] as const) assert.ok(JSON.stringify(LEGAL[lang].privacy).includes(CONTACT), lang);
});
