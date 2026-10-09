// Settings card: email when an evolution training ends, and the Daily streak reminder (both Premium).
// Saves right away, undoes on failure. Free users see both switches off and disabled, marked Premium.
import { useState } from 'react';
import { Crown } from '@phosphor-icons/react';
import { api, type Prefs } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../messages';

type Flag = 'evoEmails' | 'dailyReminder';

export function EmailAlertsCard({ premium, prefs, onChange }: { premium: boolean; prefs: Prefs; onChange: (p: Prefs) => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const toggle = (flag: Flag) => {
    const before = prefs;
    const value = !prefs[flag];
    onChange({ ...prefs, [flag]: value });
    setError(null);
    setSaving(true);
    api
      .prefs({ [flag]: value })
      .catch((e) => {
        onChange(before);
        setError(errorText(e, t));
      })
      .finally(() => setSaving(false));
  };
  const tag = !premium && (
    <em className="premium-tag">
      <Crown weight="fill" aria-hidden="true" /> {t('settings.premiumTag')}
    </em>
  );
  return (
    <section className={`settings-card${premium ? '' : ' locked'}`}>
      <h2>{t('evos.emailTitle')}</h2>
      {!premium && (
        <p className="locked-note">
          <Crown weight="fill" aria-hidden="true" /> {t('settings.emailLocked')}
        </p>
      )}
      <fieldset disabled={!premium} className="plain">
        <label className="switch">
          <input type="checkbox" checked={premium && prefs.evoEmails} onChange={() => toggle('evoEmails')} disabled={saving} />
          <span>
            {t('evos.emailToggle')} {tag}
          </span>
        </label>
        <label className="switch">
          <input
            type="checkbox"
            checked={premium && prefs.dailyReminder}
            onChange={() => toggle('dailyReminder')}
            disabled={saving}
            aria-describedby="daily-reminder-hint"
          />
          <span>
            {t('settings.dailyReminder')} {tag}
          </span>
        </label>
        <p id="daily-reminder-hint" className="switch-hint">{t('settings.dailyReminderHint')}</p>
      </fieldset>
      {error && <div className="banner" role="alert">{error}</div>}
    </section>
  );
}
