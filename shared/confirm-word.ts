// The word typed to confirm an account deletion. The server (server/deletion-rules.ts) and the site
// (components/AccountData.tsx) both accept the word of any site language, so a user typing in one
// language while the site shows another is never stuck.
const WORDS = new Set(['delete', 'sterge', 'elimina']);

/** Trimmed, any case; Romanian ș with comma, ş with cedilla or plain s all count. */
export const isConfirmWord = (s: unknown) =>
  typeof s === 'string' && WORDS.has(s.trim().toLocaleLowerCase('ro').replace(/[șş]/g, 's'));
