import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadGame, loadPlays, recordPlay, saveGame } from './store';

// Node 24 has its own (file-backed, flag-gated) localStorage global: replace it, don't assign over it
const setStorage = (v: unknown) => Object.defineProperty(globalThis, 'localStorage', { value: v, configurable: true, writable: true });

test('storage that throws never breaks the game', () => {
  setStorage({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } });
  assert.equal(loadGame(3), null);
  assert.deepEqual(loadPlays(), []);
  saveGame({ day: 3, state: 'x', rows: [], finished: false, won: false });
  recordPlay({ day: 3, won: true, guesses: 2 });
});

test('plays are recorded once per day and a saved game only loads for its day', () => {
  const mem = new Map<string, string>();
  setStorage({ getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) });
  recordPlay({ day: 3, won: true, guesses: 2 });
  recordPlay({ day: 3, won: false, guesses: 5 });
  assert.deepEqual(loadPlays(), [{ day: 3, won: true, guesses: 2 }]);
  saveGame({ day: 3, state: 's', rows: [], finished: false, won: false });
  assert.equal(loadGame(4), null);
  assert.equal(loadGame(3)?.state, 's');
});
