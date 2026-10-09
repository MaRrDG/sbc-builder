// Settings section: the public username of the FC Solver Daily leaderboard and whether to be shown on it.
import { useEffect, useId, useState } from 'react';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { api, type DailyProfile } from '../api';
import { usernameOk } from '../daily/username';
import { useI18n } from '../i18n';
import { errorText } from '../messages';
import { Row, Section, SwitchRow } from './SettingsRows';

export function DailyProfileCard() {
  const { t } = useI18n();
  const id = useId();
  const [profile, setProfile] = useState<DailyProfile | null>(null);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    api.daily
      .info()
      .then((i) => {
        if (!live || !i.me) return;
        setProfile(i.me);
        setName(i.me.username ?? '');
      })
      .catch((e) => live && setError(errorText(e, t)));
    return () => {
      live = false;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async (body: { username?: string; leaderboard?: boolean }) => {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const p = await api.daily.saveProfile(body);
      setProfile(p);
      setName(p.username ?? '');
      if (body.username !== undefined) setSaved(true);
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const v = name.trim();
  const bad = v.length > 0 && !usernameOk(v);
  const changed = v !== (profile?.username ?? '');

  return (
    <Section title={t('settings.daily.title')}>
      <Row title={t('daily.prompt.username')} hint={t('daily.prompt.hint')} labelFor={id} hintId={`${id}-hint`} className="name-row">
        <form
          className="daily-name-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (usernameOk(v) && changed && !busy) void save({ username: v });
          }}
        >
          <input
            id={id}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSaved(false);
              setError(null);
            }}
            maxLength={16}
            autoComplete="nickname"
            autoCapitalize="off"
            spellCheck={false}
            disabled={!profile}
            aria-invalid={bad || !!error}
            aria-describedby={bad ? `${id}-hint ${id}-bad` : `${id}-hint`}
          />
          <button type="submit" className="ghost bordered" disabled={!profile || busy || !changed || !usernameOk(v)}>
            {t('settings.daily.save')}
          </button>
        </form>
        <div className="daily-name-status" aria-live="polite">
          {bad && (
            <p id={`${id}-bad`} className="daily-name-hint bad">
              <WarningCircle weight="fill" aria-hidden="true" /> {t('settings.daily.bad')}
            </p>
          )}
          {saved && (
            <p className="daily-saved">
              <CheckCircle weight="fill" aria-hidden="true" /> {t('settings.daily.saved')}
            </p>
          )}
        </div>
      </Row>
      <SwitchRow
        title={t('settings.daily.show')}
        hint={t('settings.daily.text')}
        checked={!!profile?.leaderboard}
        disabled={!profile?.username}
        busy={busy}
        onChange={(on) => void save({ leaderboard: on })}
      />
      {error && (
        <div className="banner" role="alert">
          {error}
        </div>
      )}
    </Section>
  );
}
