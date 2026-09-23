// The signed-in user's badge in the top bar: an initial that opens who you are, which EA account
// FC Solver shows (live or not, switchable) and sign-out. Phones use the full picker in the menu.
import { useEffect, useId, useRef, useState } from 'react';
import { GearSix, SignOut } from '@phosphor-icons/react';
import type { Account } from '../api';
import { useI18n } from '../i18n';

export function AccountMenu({ email, personas, active, onSelect, onSettings, onSignOut }: {
  email: string;
  personas: Account[];
  active: Account | null;
  onSelect: (personaId: number) => void;
  onSettings: () => void;
  onSignOut: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const popId = useId();
  const live = !!active?.session;
  const state = live ? t('top.live') : t('top.offline');

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

  const close = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <div className="account-menu" ref={root}>
      <button
        type="button"
        className={`avatar${live ? ' live' : ''}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popId}
        aria-label={`${t('account.menu')}: ${active ? `${active.personaName} · ${state}` : email}`}
        title={email}
        onClick={() => setOpen((v) => !v)}
      >
        {(email || '?').slice(0, 1).toUpperCase()}
      </button>
      {open && (
        <div className="account-pop" id={popId} role="dialog" aria-label={t('account.menu')}>
          {email && <p className="account-pop-email">{email}</p>}
          {active && (
            <div className="account-pop-ea">
              <span className="account-pop-label">
                {t('top.account')} <span className={`session ${live ? 'on' : ''}`}>{state}</span>
              </span>
              {personas.length > 1 ? (
                <select value={active.personaId} onChange={(e) => { setOpen(false); onSelect(Number(e.target.value)); }} aria-label={t('top.account')}>
                  {personas.map((a) => (
                    <option key={a.personaId} value={a.personaId}>
                      {a.personaName} · {a.clubName}
                    </option>
                  ))}
                </select>
              ) : (
                <strong>{active.personaName} · {active.clubName}</strong>
              )}
            </div>
          )}
          <button type="button" onClick={close(onSettings)}>
            <GearSix weight="bold" aria-hidden="true" /> {t('account.settings')}
          </button>
          <button type="button" onClick={close(onSignOut)}>
            <SignOut weight="bold" aria-hidden="true" /> {t('auth.signOut')}
          </button>
        </div>
      )}
    </div>
  );
}
