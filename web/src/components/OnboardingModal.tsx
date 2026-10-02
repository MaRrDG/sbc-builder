// Two quick questions after sign-up (and once for older users): where they heard of FC Solver and
// how long they have played FUT. Optional: a skip is saved too, so it is asked only once.
import { useEffect, useRef, useState } from 'react';
import { Check, HandWaving } from '@phosphor-icons/react';
import { api, FUT_YEARS, HEARD_FROM, type FutYears, type HeardFrom } from '../api';
import { useI18n } from '../i18n';

export function OnboardingModal({ open, onDone }: { open: boolean; onDone: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [heardFrom, setHeardFrom] = useState<HeardFrom | null>(null);
  const [futYears, setFutYears] = useState<FutYears | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  // a failed save still closes it: the survey must never stand between the user and the app
  const send = async (a: Parameters<typeof api.onboarding>[0]) => {
    setBusy(true);
    await api.onboarding(a).catch(() => {});
    setBusy(false);
    onDone();
  };

  const group = <T extends string>(name: string, values: readonly T[], value: T | null, set: (v: T) => void) => (
    <fieldset className="onb-group">
      <legend>{t(`onboarding.${name}.q`)}</legend>
      <div className="onb-chips">
        {values.map((v) => (
          <label key={v} className="onb-chip">
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => set(v)} />
            {value === v && <Check weight="bold" aria-hidden />}
            {t(`onboarding.${name}.${v}`)}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <dialog
      ref={ref}
      className="club-sync onb"
      aria-labelledby="onb-title"
      onCancel={(e) => {
        e.preventDefault(); // Esc counts as a skip, saved like the button
        if (!busy) void send({ skip: true });
      }}
    >
      <HandWaving weight="duotone" className="club-sync-icon" aria-hidden />
      <h2 id="onb-title">{t('onboarding.title')}</h2>
      <p>{t('onboarding.lede')}</p>
      {group('heardFrom', HEARD_FROM, heardFrom, setHeardFrom)}
      {group('futYears', FUT_YEARS, futYears, setFutYears)}
      <div className="onb-actions">
        <button type="button" className="ghost" disabled={busy} onClick={() => void send({ skip: true })}>
          {t('onboarding.skip')}
        </button>
        <button
          type="button"
          className="club-sync-close"
          disabled={busy || !heardFrom || !futYears}
          onClick={() => heardFrom && futYears && void send({ heardFrom, futYears })}
        >
          {t('onboarding.submit')}
        </button>
      </div>
    </dialog>
  );
}
