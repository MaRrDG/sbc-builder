// The one search field: a combobox over every known player (↑ ↓ to move, Enter to guess, Esc to close).
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { MagnifyingGlass } from '@phosphor-icons/react';
import type { DailyName, Meta } from '../api';
import { useI18n } from '../i18n';
import { searchNames, type Indexed } from './search';

interface Props {
  index: Indexed[];
  exclude: ReadonlySet<number>;
  meta: Meta | null;
  /** a guess is in flight: keep focus, ignore input */
  busy: boolean;
  /** the game is over */
  disabled: boolean;
  left: number;
  error: string | null;
  /** bumps on every refused guess to replay the shake */
  shake: number;
  onPick: (p: DailyName) => void;
}

export function Search({ index, exclude, meta, busy, disabled, left, error, shake, onPick }: Props) {
  const { t } = useI18n();
  const id = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [shaking, setShaking] = useState(false);
  useEffect(() => {
    if (shake) setShaking(true);
  }, [shake]);
  const results = useMemo(() => searchNames(index, q, exclude), [index, q, exclude]);
  const shown = open && q.trim().length >= 2 && !disabled;
  const listId = `${id}-list`;
  const optId = (i: number) => `${id}-o${i}`;

  const pick = (p: DailyName) => {
    if (busy || disabled) return;
    setQ('');
    setOpen(false);
    setActive(0);
    onPick(p);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown) return setOpen(true);
      const n = results.length;
      if (n) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (shown && results[active]) pick(results[active]);
    } else if (e.key === 'Escape') {
      if (shown) {
        e.preventDefault();
        setOpen(false);
      }
    }
  };

  return (
    <div className="dg-search">
      <div className="dg-search-top">
        <label htmlFor={`${id}-in`}>{t('daily.search.label')}</label>
        {!disabled && <span className="dg-left">{t('daily.left', { count: left })}</span>}
      </div>
      <div className={`dg-field${shaking ? ' shake' : ''}${error ? ' bad' : ''}`} onAnimationEnd={(e) => e.target === e.currentTarget && setShaking(false)}>
        <MagnifyingGlass className="dg-field-ic" aria-hidden="true" weight="bold" />
        <input
          id={`${id}-in`}
          type="text"
          role="combobox"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-autocomplete="list"
          aria-expanded={shown}
          aria-controls={listId}
          aria-activedescendant={shown && results[active] ? optId(active) : undefined}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
          aria-busy={busy}
          placeholder={t('daily.search.placeholder')}
          value={q}
          disabled={disabled}
          readOnly={busy}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
            setActive(0);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKey}
        />
        <ul id={listId} role="listbox" className="dg-list" hidden={!shown} aria-label={t('daily.search.label')}>
          {results.map((p, i) => {
            const club = meta?.names.club[p.c] ?? '';
            return (
              <li
                key={p.i}
                id={optId(i)}
                role="option"
                aria-selected={i === active}
                className="dg-opt"
                onMouseDown={(e) => e.preventDefault()} // keep focus in the field
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(p)}
              >
                {meta && <img className="dg-opt-club" src={`${meta.contentBase}/items/images/mobile/clubs/dark/${p.c}.png`} alt={club} loading="lazy" />}
                <span className="dg-opt-n">{p.n}</span>
                {p.f !== p.n && <span className="dg-opt-f">{p.f}</span>}
              </li>
            );
          })}
          {shown && results.length === 0 && (
            <li className="dg-opt dg-opt-none" role="option" aria-selected={false} aria-disabled="true">
              {t('daily.search.none')}
            </li>
          )}
        </ul>
      </div>
      {error && (
        <p id={`${id}-err`} className="dg-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
