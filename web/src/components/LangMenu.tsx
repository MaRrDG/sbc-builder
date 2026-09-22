import { useEffect, useId, useRef, useState, type ReactElement } from 'react';
import { CaretDown, Check } from '@phosphor-icons/react';
import { LANGS, type Lang } from '../i18n';

// Flags as tiny inline SVGs: emoji flags do not render on Windows.
const FLAGS: Record<(typeof LANGS)[number]['flag'], ReactElement> = {
  gb: (
    <svg viewBox="0 0 60 30" aria-hidden="true">
      <clipPath id="fl-gb-a">
        <path d="M0 0v30h60V0z" />
      </clipPath>
      <clipPath id="fl-gb-b">
        <path d="M30 15h30v15zv15H0zH0V0zV0h30z" />
      </clipPath>
      <g clipPath="url(#fl-gb-a)">
        <path d="M0 0v30h60V0z" fill="#012169" />
        <path d="M0 0l60 30m0-30L0 30" stroke="#fff" strokeWidth="6" />
        <path d="M0 0l60 30m0-30L0 30" clipPath="url(#fl-gb-b)" stroke="#C8102E" strokeWidth="4" />
        <path d="M30 0v30M0 15h60" stroke="#fff" strokeWidth="10" />
        <path d="M30 0v30M0 15h60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  ),
  ro: (
    <svg viewBox="0 0 3 2" aria-hidden="true">
      <path fill="#002B7F" d="M0 0h1v2H0z" />
      <path fill="#FCD116" d="M1 0h1v2H1z" />
      <path fill="#CE1126" d="M2 0h1v2H2z" />
    </svg>
  ),
};

/** Language picker: flag + native name, a small menu that scales to more languages. */
export function LangMenu({ lang, setLang, label }: { lang: Lang; setLang: (l: Lang) => void; label: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const current = LANGS.find((l) => l.id === lang) ?? LANGS[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="lang-menu" ref={root}>
      <button
        type="button"
        className="lang-current"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={`${label}: ${current.name}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="flag">{FLAGS[current.flag]}</span>
        <span className="lang-name">{current.name}</span>
        <CaretDown weight="bold" className={`chev${open ? ' open' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul className="lang-list" id={menuId} role="listbox" aria-label={label}>
          {LANGS.map((l) => (
            <li key={l.id} role="option" aria-selected={l.id === lang}>
              <button
                type="button"
                lang={l.id}
                onClick={() => {
                  setLang(l.id);
                  setOpen(false);
                }}
              >
                <span className="flag">{FLAGS[l.flag]}</span>
                <span>{l.name}</span>
                {l.id === lang && <Check weight="bold" className="lang-check" aria-hidden="true" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
