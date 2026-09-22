// Site translations (English / Romanian). What comes from EA stays as EA sends it: SBC and
// challenge names, descriptions, requirement texts, players, clubs, leagues, nations, rarities.
// t('key', { n: 3 }) fills {n}; a key with _one / _few / _other variants picks by `count`
// (Intl.PluralRules: Romanian says 1 jucător, 2 jucători, 20 de jucători).
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en } from './locales/en';
import { ro } from './locales/ro';

export type Lang = 'en' | 'ro';
export type MessageKey = keyof typeof en;
type Params = Record<string, string | number>;

/** Languages in the picker, each with its own name and flag (web/src/components/LangMenu.tsx). Add more here. */
export const LANGS: { id: Lang; name: string; flag: 'gb' | 'ro' }[] = [
  { id: 'en', name: 'English', flag: 'gb' },
  { id: 'ro', name: 'Română', flag: 'ro' },
];

const dicts: Record<Lang, Record<string, string>> = { en, ro };
const STORE = 'fcs-lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORE);
    if (saved === 'en' || saved === 'ro') return saved;
  } catch {
    /* storage blocked: fall back to the browser language */
  }
  return navigator.language?.toLowerCase().startsWith('ro') ? 'ro' : 'en';
}

export function translate(lang: Lang, key: string, params: Params = {}): string {
  const d = dicts[lang];
  let text: string | undefined;
  if (typeof params.count === 'number') {
    const cat = new Intl.PluralRules(lang).select(params.count);
    text = d[`${key}_${cat}`] ?? d[`${key}_other`] ?? dicts.en[`${key}_${cat === 'one' ? 'one' : 'other'}`];
  }
  text ??= d[key] ?? dicts.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in params ? String(params[name]) : m));
}

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string, params?: Params) => string;
}

const Ctx = createContext<I18n>({ lang: 'en', setLang: () => {}, t: (k, p) => translate('en', k, p) });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORE, l);
    } catch {
      /* keep it for this tab only */
    }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const value = useMemo(() => ({ lang, setLang, t: (k: string, p?: Params) => translate(lang, k, p) }), [lang, setLang]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

/** Relative time ("5m ago" / "acum 5m") in the current language. */
export function useAgo() {
  const { t } = useI18n();
  return useCallback(
    (ts: number | null) => {
      if (!ts) return t('time.never');
      const s = Math.round((Date.now() - ts) / 1000);
      if (s < 60) return t('time.justNow');
      if (s < 3600) return t('time.minAgo', { n: Math.round(s / 60) });
      if (s < 86400) return t('time.hAgo', { n: Math.round(s / 3600) });
      return t('time.dAgo', { n: Math.round(s / 86400) });
    },
    [t],
  );
}
