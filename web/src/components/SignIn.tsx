// Sign in or sign up in one flow, on Clerk's v6 hooks with our own UI: Google, or an emailed code.
// A new email becomes a sign-up automatically; there is no separate "create account" screen.
import { useEffect, useState } from 'react';
import { useSignIn, useSignUp } from '@clerk/react';
import { EnvelopeSimple, GoogleLogo, WarningCircle } from '@phosphor-icons/react';
import { useI18n } from '../i18n';

type ClerkErr = { code?: string; errors?: { code?: string }[] } | null | undefined;
const codeOf = (e: ClerkErr) => e?.errors?.[0]?.code ?? e?.code ?? '';

function errKey(e: ClerkErr): string {
  const c = codeOf(e);
  if (c === 'form_code_incorrect') return 'auth.codeWrong';
  if (c === 'verification_expired' || c === 'verification_failed') return 'auth.codeExpired';
  if (c === 'too_many_requests' || c.includes('rate_limit')) return 'auth.tooMany';
  if (c === 'form_param_format_invalid' || c === 'form_identifier_invalid') return 'auth.emailInvalid';
  return 'auth.failed';
}

export function SignIn({ next, onDone }: { next: string; onDone: (path: string) => void }) {
  const { t } = useI18n();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0); // resend cooldown, seconds

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const fail = (e: ClerkErr) => {
    setError(t(errKey(e)));
    setBusy(false);
  };

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    setError(null);
    let m: 'in' | 'up' = 'in';
    let { error } = await signIn.emailCode.sendCode({ emailAddress: address });
    if (error && codeOf(error) === 'form_identifier_not_found') {
      m = 'up'; // new here: same screens, as a sign-up
      ({ error } = await signUp.create({ emailAddress: address }));
      if (!error) ({ error } = await signUp.verifications.sendEmailCode());
    }
    if (error) return fail(error);
    setMode(m);
    setStep('code');
    setCode('');
    setWait(30);
    setBusy(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const go = { navigate: () => onDone(next) };
    if (mode === 'in') {
      const { error } = await signIn.emailCode.verifyCode({ code: code.trim() });
      if (error) return fail(error);
      // not complete (e.g. a second factor) makes finalize() return an error, shown as auth.failed
      const done = await signIn.finalize(go);
      if (done.error) return fail(done.error);
    } else {
      const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (error) return fail(error);
      const done = await signUp.finalize(go);
      if (done.error) return fail(done.error);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    const { error } = await signIn.sso({
      strategy: 'oauth_google',
      redirectUrl: next,
      redirectCallbackUrl: '/signin/callback',
    });
    if (error) fail(error);
  }

  return (
    <section className="signin" aria-labelledby="signin-title">
      <h1 id="signin-title">{t('auth.title')}</h1>
      <p className="muted">{t('auth.lede')}</p>

      {step === 'email' ? (
        <div className="signin-step" key="email">
          <button type="button" className="ghost wide signin-google" onClick={google} disabled={busy}>
            <GoogleLogo weight="bold" /> {t('auth.google')}
          </button>
          <p className="signin-or" aria-hidden="true">
            <span>{t('auth.or')}</span>
          </p>
          <form onSubmit={sendCode}>
            <label className="signin-field">
              <span>{t('auth.email')}</span>
              <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" className="signin-go" disabled={busy || !email.trim()}>
              <EnvelopeSimple weight="bold" /> {t('auth.sendCode')}
            </button>
          </form>
        </div>
      ) : (
        <div className="signin-step" key="code">
          <p>{t('auth.codeSent', { email: email.trim() })}</p>
          <form onSubmit={verify}>
            <label className="signin-field">
              <span>{t('auth.code')}</span>
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <button type="submit" className="signin-go" disabled={busy || code.length !== 6}>
              {t('auth.verify')}
            </button>
          </form>
          <div className="signin-row">
            <button type="button" className="text" disabled={busy || wait > 0} onClick={() => sendCode()}>
              {wait > 0 ? t('auth.resendIn', { s: wait }) : t('auth.resend')}
            </button>
            <button type="button" className="text" disabled={busy} onClick={() => { setStep('email'); setError(null); }}>
              {t('auth.changeEmail')}
            </button>
          </div>
        </div>
      )}

      <p className="signin-error" role="alert" aria-live="assertive">
        {error && (
          <>
            <WarningCircle weight="bold" aria-hidden="true" /> {error}
          </>
        )}
      </p>
    </section>
  );
}
