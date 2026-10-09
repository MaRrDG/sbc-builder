// Custom Clerk session reverification (the site has no prebuilt Clerk UI). Sensitive Clerk calls
// (connect / remove an external account, change email...) are wrapped like this:
//   const { dialog, options } = useReverifyDialog();
//   const safeCall = useReverification(() => user.createExternalAccount(...), options);
//   ... render {dialog}; catch isReverificationCancelledError(e) when the user closes the dialog.
// Factor: email code first (many users sign in with Google only, so they have no password), else password.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from '@clerk/react';
import { isClerkAPIResponseError } from '@clerk/react/errors';
import { LockKey, WarningCircle } from '@phosphor-icons/react';
import { useI18n } from '../i18n';

type Level = 'first_factor' | 'second_factor' | 'multi_factor';
export type ReverifyRequest = { cancel: () => void; complete: () => void; level: Level | undefined };
const COOLDOWN_S = 30;

/** Dialog element + the `onNeedsReverification` option for `useReverification`. */
export function useReverifyDialog(): { dialog: ReactNode; options: { onNeedsReverification: (r: ReverifyRequest) => void } } {
  const [req, setReq] = useState<ReverifyRequest | null>(null);
  return {
    options: { onNeedsReverification: (r) => setReq(r) },
    dialog: req ? <ReverifyDialog req={req} onClose={() => setReq(null)} /> : null,
  };
}

type Stage = { kind: 'loading' } | { kind: 'code'; to: string; emailAddressId: string } | { kind: 'password' } | { kind: 'fatal'; text: string };

function ReverifyDialog({ req, onClose }: { req: ReverifyRequest; onClose: () => void }) {
  const { t } = useI18n();
  const { session } = useSession();
  const ref = useRef<HTMLDialogElement>(null);
  const started = useRef(false);
  const settled = useRef(false);
  const [stage, setStage] = useState<Stage>({ kind: 'loading' });
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  const errText = (e: unknown) => {
    const code = isClerkAPIResponseError(e) ? e.errors[0]?.code : '';
    if (code === 'form_code_incorrect' || code === 'verification_failed') return t('reverify.wrongCode');
    if (code === 'form_password_incorrect') return t('reverify.wrongPassword');
    if (code === 'verification_expired') return t('reverify.expired');
    if (code === 'too_many_requests' || code === 'rate_limit_exceeded') return t('reverify.tooMany');
    return t('reverify.failed');
  };

  const finish = (ok: boolean) => {
    if (settled.current) return;
    settled.current = true;
    ref.current?.close();
    onClose();
    if (ok) req.complete();
    else req.cancel();
  };

  const sendCode = async (emailAddressId: string) => {
    await session!.prepareFirstFactorVerification({ strategy: 'email_code', emailAddressId });
    setWait(COOLDOWN_S);
  };

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    if (started.current || !session) return;
    started.current = true; // StrictMode runs effects twice: send one code only
    void (async () => {
      try {
        const v = await session.startVerification({ level: req.level ?? 'first_factor' });
        if (v.status === 'complete') return finish(true);
        const factors = v.supportedFirstFactors ?? [];
        const email = factors.find((f) => f.strategy === 'email_code');
        if (email && 'emailAddressId' in email) {
          await sendCode(email.emailAddressId);
          return setStage({ kind: 'code', to: email.safeIdentifier ?? '', emailAddressId: email.emailAddressId });
        }
        if (factors.some((f) => f.strategy === 'password')) return setStage({ kind: 'password' });
        setStage({ kind: 'fatal', text: t('reverify.unsupported') });
      } catch (e) {
        setStage({ kind: 'fatal', text: errText(e) });
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (wait <= 0) return;
    const id = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(id);
  }, [wait]);

  const submit = async () => {
    if (!session || stage.kind === 'loading' || stage.kind === 'fatal') return;
    setBusy(true);
    setError(null);
    try {
      const v = await session.attemptFirstFactorVerification(
        stage.kind === 'code' ? { strategy: 'email_code', code: value.trim() } : { strategy: 'password', password: value },
      );
      if (v.status === 'complete') return finish(true);
      setError(t('reverify.unsupported')); // a second factor is still needed: not handled here
    } catch (e) {
      setError(errText(e));
    }
    setBusy(false);
  };

  const resend = async () => {
    if (stage.kind !== 'code' || wait > 0) return;
    setError(null);
    try {
      await sendCode(stage.emailAddressId);
    } catch (e) {
      setError(errText(e));
    }
  };

  const isCode = stage.kind === 'code';
  return (
    <dialog
      ref={ref}
      className="club-sync reverify"
      aria-labelledby="rv-title"
      onCancel={(e) => {
        e.preventDefault(); // Esc closes like the Cancel button
        finish(false);
      }}
    >
      <LockKey weight="duotone" className="club-sync-icon" aria-hidden />
      <h2 id="rv-title">{t('reverify.title')}</h2>
      {stage.kind === 'loading' && <p role="status">{t('reverify.loading')}</p>}
      {stage.kind === 'fatal' && (
        <p className="code-msg bad" role="alert">
          <WarningCircle weight="fill" aria-hidden /> {stage.text}
        </p>
      )}
      {(isCode || stage.kind === 'password') && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (value && !busy) void submit();
          }}
        >
          <p id="rv-lede">{isCode ? t('reverify.codeSent', { email: stage.to }) : t('reverify.passwordLede')}</p>
          <label className="rv-field">
            <span>{isCode ? t('reverify.codeLabel') : t('reverify.passwordLabel')}</span>
            {isCode ? (
              <input
                value={value}
                onChange={(e) => setValue(e.target.value.replace(/\D/g, '').slice(0, 6))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                placeholder="000000"
                aria-describedby="rv-lede"
                autoFocus
              />
            ) : (
              <input type="password" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="current-password" aria-describedby="rv-lede" autoFocus />
            )}
          </label>
          {error && (
            <p className="code-msg bad" role="alert">
              <WarningCircle weight="fill" aria-hidden /> {error}
            </p>
          )}
          <div className="rv-actions">
            <button type="submit" className="club-sync-close" disabled={busy || (isCode ? value.length < 6 : !value)}>
              {t('reverify.confirm')}
            </button>
            {isCode && (
              <button type="button" className="ghost bordered" disabled={wait > 0 || busy} onClick={() => void resend()}>
                {wait > 0 ? t('reverify.resendIn', { count: wait }) : t('reverify.resend')}
              </button>
            )}
          </div>
        </form>
      )}
      <button type="button" className="ghost rv-cancel" onClick={() => finish(false)}>
        {t('reverify.cancel')}
      </button>
    </dialog>
  );
}
