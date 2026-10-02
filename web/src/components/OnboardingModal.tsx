// Two quick questions after sign-up (and once for older users): where they heard of FC Solver and
// how long they have played FUT. Optional: a skip is saved too, so it is asked only once.
import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle, HandWaving, WarningCircle } from '@phosphor-icons/react';
import { api, FUT_YEARS, HEARD_FROM, type FutYears, type HeardFrom } from '../api';
import { useI18n } from '../i18n';
import { clearRef, readRef } from '../ref';
import { redeemText } from './CodeInput';

export function OnboardingModal({ open, onDone, founders }: { open: boolean; onDone: () => void; founders: { limit: number; left: number } | null }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  const [heardFrom, setHeardFrom] = useState<HeardFrom | null>(null);
  const [futYears, setFutYears] = useState<FutYears | null>(null);
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState(() => readRef() ?? '');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [done, setDone] = useState(false); // a code result is shown: Continue closes

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);

  // a failed save still closes it: the survey must never stand between the user and the app
  const send = async (a: { heardFrom: HeardFrom; futYears: FutYears } | { skip: true }) => {
    setBusy(true);
    const c = code.trim();
    const res = await api.onboarding(c ? { ...a, code: c } : a).catch(() => null);
    setBusy(false);
    if (c) clearRef();
    const r = res?.redeem;
    if (r && 'error' in r) return setResult({ ok: false, text: t(`err.${r.error}`) }), setDone(true);
    if (r) return setResult({ ok: true, text: redeemText(r, t, founders) }), setDone(true);
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
        if (done) onDone();
        else if (!busy) void send({ skip: true });
      }}
    >
      <HandWaving weight="duotone" className="club-sync-icon" aria-hidden />
      <h2 id="onb-title">{t('onboarding.title')}</h2>
      <p>{t('onboarding.lede')}</p>
      {group('heardFrom', HEARD_FROM, heardFrom, setHeardFrom)}
      {group('futYears', FUT_YEARS, futYears, setFutYears)}
      <label className="onb-code">
        <span>{t('code.label')}</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('code.placeholder')} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={24} disabled={done} />
      </label>
      {result && (
        <p className={`code-msg ${result.ok ? 'ok' : 'bad'}`} role="status">
          {result.ok ? <CheckCircle weight="fill" aria-hidden /> : <WarningCircle weight="fill" aria-hidden />} {result.text}
        </p>
      )}
      <div className="onb-actions">
        {done ? (
          <button type="button" className="club-sync-close" onClick={onDone}>
            {t('onboarding.submit')}
          </button>
        ) : (
          <>
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
          </>
        )}
      </div>
    </dialog>
  );
}
