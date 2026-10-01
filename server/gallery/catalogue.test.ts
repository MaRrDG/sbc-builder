import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadCatalogue } from './catalogue.js';
import { GRADES } from './types.js';

test('catalogue is complete and well-formed', () => {
  const sets = loadCatalogue();
  assert.equal(sets.length, 127);
  const ids = new Set<string>();
  for (const s of sets) {
    assert.ok(!ids.has(s.id), `duplicate ${s.id}`);
    ids.add(s.id);
    assert.ok(s.size > 0, s.id);
    assert.ok(Object.keys(s.filter).length > 0, `${s.id} has no filter`);
    if (s.category === 'club') {
      const n = s.filter.clubs?.length ?? 0;
      assert.ok(n === 1 || n === 2, `${s.id} has ${n} club ids`);
    }
    for (let k = 1; k < GRADES.length; k++) assert.ok(s.grades[GRADES[k]] > s.grades[GRADES[k - 1]], `${s.id} grades not ascending`);
  }
  const arsenal = sets.find((s) => s.id === 'premier-league-arsenal');
  assert.deepEqual(arsenal?.grades, { D: 10, C: 110000, B: 700000, A: 1300000, S: 2500000 });
  assert.equal(arsenal?.size, 20);
});
