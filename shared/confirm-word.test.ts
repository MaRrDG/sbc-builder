import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isConfirmWord } from './confirm-word.js';

test('confirm word: any site language, trimmed, any case', () => {
  for (const w of ['DELETE', 'delete', ' Delete ', 'ELIMINA', 'elimina', 'Elimina']) assert.equal(isConfirmWord(w), true, w);
});

test('confirm word: Romanian with comma Ș, cedilla Ş or no diacritic', () => {
  for (const w of ['ȘTERGE', 'șterge', 'ŞTERGE', 'şterge', 'STERGE', 'sterge', ' Șterge ']) assert.equal(isConfirmWord(w), true, w);
});

test('confirm word: nothing else', () => {
  for (const w of ['', 'DEL', 'yes', 'DELETE!', 'stergee', 'ștergeți', null, 42, undefined]) assert.equal(isConfirmWord(w), false, String(w));
});
