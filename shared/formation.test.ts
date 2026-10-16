import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formationLabel } from './formation.js';

test('formationLabel', () => {
  assert.equal(formationLabel('f442'), '4-4-2');
  assert.equal(formationLabel('f4231'), '4-2-3-1');
  assert.equal(formationLabel('f433b'), '4-3-3 (3)');
  assert.equal(formationLabel('weird'), 'weird');
});
