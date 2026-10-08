import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fold, indexNames, searchNames } from './search';

const list = [
  { i: 1, n: 'Ødegaard', f: 'Martin Ødegaard', c: 1 },
  { i: 2, n: 'Gündoğan', f: 'İlkay Gündoğan', c: 2 },
  { i: 3, n: 'Mbappé', f: 'Kylian Mbappé Lottin', c: 3 },
  { i: 4, n: 'Vini Jr.', f: 'Vinícius José Paixão de Oliveira Júnior', c: 3 },
  { i: 5, n: 'Rodri', f: 'Rodrigo Hernández Cascante', c: 4 },
  { i: 6, n: 'Rodrygo', f: 'Rodrygo Silva de Goes', c: 3 },
];
const idx = indexNames(list);
const ids = (q: string, ex = new Set<number>()) => searchNames(idx, q, ex).map((p) => p.i);

test('fold strips accents and special letters', () => {
  assert.equal(fold('Ødegaard'), 'odegaard');
  assert.equal(fold('İlkay Gündoğan'), 'ilkay gundogan');
  assert.equal(fold('  Mbappé  Lottin '), 'mbappe lottin');
  assert.equal(fold('Straße Łukasz Æ'), 'strasse lukasz ae');
});

test('plain ASCII finds accented names, by stage or full name', () => {
  assert.deepEqual(ids('odeg'), [1]);
  assert.deepEqual(ids('gundo'), [2]);
  assert.deepEqual(ids('kylian'), [3]);
  assert.deepEqual(ids('vinicius'), [4]);
});

test('stage-name prefix ranks first, then word prefix, then substring', () => {
  assert.deepEqual(ids('rod'), [5, 6]);
  assert.deepEqual(ids('her'), [5]); // word prefix in the full name
});

test('short queries and already guessed players give nothing', () => {
  assert.deepEqual(ids('r'), []);
  assert.deepEqual(ids('rod', new Set([5])), [6]);
});
