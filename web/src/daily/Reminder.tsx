// Daily streak reminder email (Premium) switch under the board. Reads the prefs from /api/me, saves right away, undoes on failure.
import { useEffect, useState, type ReactNode } from 'react';
import { Crown } from '@phosphor-icons/react';
import { api } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../messages';
import type { Route } from '../route';

interface Props {
  signedIn: boolean;
  link: (r: Route, className: string, children: ReactNode) => ReactNode;
  next: string;
}

export function Reminder({ signedIn, link, next }: Props) {
  const { t } = useI18n();
  const [state, setState] = useState<{ premium: boolean; on: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!signedIn) return setState(null);
    let live = true;
    api.me().then(
      (m) => live && setState({ premium: m.plan.tier === 'premium', on: m.prefs.dailyReminder }),
      () => {},
    );
    return () => {
      live = false;
    };
  }, [signedIn]);

  if (!signedIn) {
    return (
      <div className="dg-remind">
        <p className="dg-remind-hint">
          {link({ view: 'signin', next }, 'dg-invite-link', t('daily.remind.signIn'))} <span className="premium-tag">{t('settings.premiumTag')}</span>
        </p>
      </div>
    );
  }
  if (!state) return null;
  const toggle = () => {
    const value = !state.on;
    setState({ ...state, on: value });
    setError(null);
    setSaving(true);
    api
      .prefs({ dailyReminder: value })
      .catch((e) => {
        setState((s) => s && { ...s, on: !value });
        setError(errorText(e, t));
      })
      .finally(() => setSaving(false));
  };
  return (
    <div className="dg-remind">
      <label className="switch">
        <input type="checkbox" checked={state.premium && state.on} onChange={toggle} disabled={!state.premium || saving} />
        <span>
          {t('daily.remind.label')}
          {!state.premium && (
            <em className="premium-tag">
              <Crown weight="fill" aria-hidden="true" /> {t('settings.premiumTag')}
            </em>
          )}
        </span>
      </label>
      <p className="dg-remind-hint">
        {state.premium ? t('daily.remind.hint') : <>{t('daily.remind.locked')} {link({ view: 'invite' }, 'dg-invite-link', t('daily.remind.more'))}</>}
      </p>
      {error && <p className="dg-remind-hint" role="alert">{error}</p>}
    </div>
  );
}
