// Settings section: email when an evolution training ends, and the Daily streak reminder (both Premium).
// Saves right away, undoes on failure. Free users see both switches off and disabled, the section marked Premium.
import { useState } from 'react';
import { api, type Prefs } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../messages';
import { Section, SwitchRow } from './SettingsRows';

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
  return (
    <Section title={t('evos.emailTitle')} locked={!premium}>
      {!premium && <p className="locked-note">{t('settings.emailLocked')}</p>}
      <SwitchRow title={t('evos.emailToggle')} hint={t('settings.evoHint')} checked={premium && prefs.evoEmails} onChange={() => toggle('evoEmails')} disabled={!premium} busy={saving} />
      <SwitchRow
        title={t('settings.dailyReminder')}
        hint={t('settings.dailyReminderHint')}
        checked={premium && prefs.dailyReminder}
        onChange={() => toggle('dailyReminder')}
        disabled={!premium}
        busy={saving}
      />
      {error && <div className="banner" role="alert">{error}</div>}
    </Section>
  );
}
