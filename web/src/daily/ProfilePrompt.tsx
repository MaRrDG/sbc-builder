// "Want to appear on the leaderboard?": asked once per account after a finished daily game, and again
// on demand from the leaderboard's Join button. Yes saves a username + opt-in; Not now, Esc or the
// backdrop only mark the question as answered.
import { useEffect, useId, useRef, useState } from 'react';
import { WarningCircle } from '@phosphor-icons/react';
import { api, type DailyProfile } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../messages';
import { Sheet } from './Sheets';
import { usernameOk } from './username';


/** The username field with its live format hint and the server's error under it. */
function UsernameField({ value, onChange, error }: { value: string; onChange: (v: string) => void; error: string | null }) {
  const { t } = useI18n();
  const id = useId();
  const v = value.trim();
  const bad = v.length > 0 && !usernameOk(v);
  return (
    <div className={`dg-uname${bad || error ? ' bad' : ''}`}>
      <label htmlFor={id}>{t('daily.prompt.username')}</label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={16}
        autoComplete="nickname"
        autoCapitalize="off"
        spellCheck={false}
        aria-invalid={bad || !!error}
        aria-describedby={`${id}-hint${error ? ` ${id}-err` : ''}`}
      />
      <p id={`${id}-hint`} className="dg-uname-hint">
        {bad && <WarningCircle weight="fill" aria-hidden="true" />}
        {t('daily.prompt.hint')}
      </p>
      {error && (
        <p id={`${id}-err`} className="dg-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function PromptBody({ initial, onYes, onNo }: { initial: string; onYes: (p: DailyProfile) => void; onNo: () => void }) {
  const { t } = useI18n();
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const v = name.trim();
  const yes = async () => {
    setBusy(true);
    setError(null);
    try {
      onYes(await api.daily.saveProfile({ username: v, leaderboard: true, asked: true }));
    } catch (e) {
      setError(errorText(e, t));
      setBusy(false);
    }
  };
  return (
    <form
      className="dg-prompt"
      onSubmit={(e) => {
        e.preventDefault();
        if (usernameOk(v) && !busy) void yes();
      }}
    >
      <p className="dg-prompt-text">{t('daily.prompt.text')}</p>
      <UsernameField
        value={name}
        onChange={(n) => {
          setName(n);
          setError(null);
        }}
        error={error}
      />
      <div className="dg-prompt-bar">
        <button type="submit" className="dg-btn go" disabled={busy || !usernameOk(v)}>
          {t('daily.prompt.yes')}
        </button>
        <button type="button" className="dg-btn" onClick={onNo} disabled={busy}>
          {t('daily.prompt.no')}
        </button>
      </div>
    </form>
  );
}

interface Props {
  open: boolean;
  /** the username the user already has (Join from the leaderboard after hiding), else empty */
  username: string | null;
  onProfile: (p: DailyProfile) => void;
  onClose: () => void;
}

export function ProfilePrompt({ open, username, onProfile, onClose }: Props) {
  const { t } = useI18n();
  const done = useRef(false);
  useEffect(() => {
    if (open) done.current = false;
  }, [open]);
  // every way out that is not Yes counts as Not now: the question is answered, nothing else changes
  const close = () => {
    if (!done.current) {
      done.current = true;
      api.daily
        .saveProfile({ asked: true })
        .then(onProfile)
        .catch(() => {}); // asked again next time: harmless
    }
    onClose();
  };
  return (
    <Sheet open={open} title={t('daily.prompt.title')} onClose={close}>
      <PromptBody
        initial={username ?? ''}
        onYes={(p) => {
          done.current = true;
          onProfile(p);
          onClose();
        }}
        onNo={close}
      />
    </Sheet>
  );
}
