// Bot strings, English and Romanian only. The channel's category decides, then the user's site language, then Discord's locale.
import { CAT } from './layout.js';

export type Lang = 'en' | 'ro';

const en = {
  'roles.pick': 'Pick any number, then close the menu. Unticking removes the role.',
  'roles.saved': 'Saved: {list}',
  'roles.none': 'Saved: no roles from this list.',
  'roles.failed': "Couldn't change your roles. Ask an Admin.",
};
export type Key = keyof typeof en;
const ro: Record<Key, string> = {
  'roles.pick': 'Alege oricâte, apoi închide meniul. Debifarea scoate rolul.',
  'roles.saved': 'Salvat: {list}',
  'roles.none': 'Salvat: niciun rol din lista asta.',
  'roles.failed': 'Nu ți-am putut schimba rolurile. Scrie unui Admin.',
};
export const STRINGS: Record<Lang, Record<Key, string>> = { en, ro };

export function tr(lang: Lang, key: Key, params: Record<string, string | number> = {}): string {
  let s = STRINGS[lang][key];
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}

export function langFor(c: { category: string | null; siteLang?: string | null; locale?: string | null }): Lang {
  if (c.category === CAT.ro) return 'ro';
  if (c.category === CAT.en) return 'en';
  if (c.siteLang) return c.siteLang === 'ro' ? 'ro' : 'en';
  return c.locale?.toLowerCase().startsWith('ro') ? 'ro' : 'en';
}
