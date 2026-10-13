import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isConfirmWord } from './confirmWord.js';

test('isConfirmWord takes the word of any site language, trimmed, any case', () => {
  for (const w of ['DELETE', 'delete', ' Delete ', 'ȘTERGE', 'șterge', 'ELIMINA', 'elimina']) assert.equal(isConfirmWord(w), true, w);
  for (const w of ['', 'DEL', 'yes', 'STERGE', 'DELETE!']) assert.equal(isConfirmWord(w), false, w);
});
