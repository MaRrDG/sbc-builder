// Settings card: email when an evolution training ends (Premium). Saves right away, undoes on failure.
import { useState } from 'react';
import { Crown } from '@phosphor-icons/react';
import { api, type Prefs } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../messages';

export function EmailAlertsCard({ premium, prefs, onChange }: { premium: boolean; prefs: Prefs; onChange: (p: Prefs) => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const toggle = () => {
    const before = prefs;
    const evoEmails = !prefs.evoEmails;
    onChange({ ...prefs, evoEmails });
    setError(null);
    api.prefs({ evoEmails }).catch((e) => {
      onChange(before);
      setError(errorText(e, t));
    });
  };
  return (
    <section className={`settings-card${premium ? '' : ' locked'}`}>
      <h2>{t('evos.emailTitle')}</h2>
      {!premium && (
        <p className="locked-note">
          <Crown weight="fill" aria-hidden="true" /> {t('evos.lockedBody')}
        </p>
      )}
      <fieldset disabled={!premium} className="plain">
        <label className="switch">
          <input type="checkbox" checked={premium && prefs.evoEmails} onChange={toggle} />
          <span>{t('evos.emailToggle')}</span>
        </label>
      </fieldset>
      {error && <div className="banner" role="alert">{error}</div>}
    </section>
  );
}
