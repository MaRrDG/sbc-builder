// The word typed to confirm an account deletion: the server accepts the word of any site language
// (server/deletion-rules.ts isConfirmWord), so the site does the same before enabling the button.
const WORDS = new Set(['delete', 'șterge', 'elimina']);

export const isConfirmWord = (s: string) => WORDS.has(s.trim().toLocaleLowerCase('ro'));
