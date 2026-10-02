// An invite link (/?ref=CODE) kept in localStorage: offered once to a signed-in, onboarded user
// who has not used an invite yet. Applying or dismissing forgets the code.
import { useEffect, useState } from 'react';
import { CheckCircle, Gift, WarningCircle, X } from '@phosphor-icons/react';
import { api, ApiError } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../messages';
import { clearRef, readRef, shouldOfferRef } from '../ref';
import { redeemText } from './CodeInput';

export function RefBanner({ onboarded, founders, onApplied }: { onboarded: boolean; founders: { limit: number; left: number } | null; onApplied: () => void }) {
  const { t } = useI18n();
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const ref = readRef();
    if (!onboarded || !ref) return;
    let live = true;
    api
      .referral()
      .then((r) => {
        if (!live) return;
        if (shouldOfferRef(ref, { usedInvite: r.usedInvite, ownCode: r.code })) setCode(ref);
        else clearRef();
      })
      .catch(() => {}); // keep the code for the next visit
    return () => {
      live = false;
    };
  }, [onboarded]);

  if (!code) return null;
  const close = () => {
    clearRef();
    setCode(null);
  };
  const apply = async () => {
    setBusy(true);
    try {
      const r = await api.redeem(code);
      clearRef();
      setMsg({ ok: true, text: redeemText(r, t, founders) });
      onApplied();
    } catch (e) {
      // refused by the server: the link is spent; a network error or rate limit keeps it for a retry
      if (e instanceof ApiError && e.code && e.code !== 'rateLimited') clearRef();
      setMsg({ ok: false, text: errorText(e, t) });
    }
    setBusy(false);
  };

  return (
    <div className="update ref-banner">
      <div className="update-row">
        {msg?.ok ? <CheckCircle weight="fill" className="update-icon" aria-hidden /> : <Gift weight="duotone" className="update-icon" aria-hidden />}
        <div className="update-text">
          {msg ? (
            <span role="status" className={msg.ok ? undefined : 'ref-bad'}>
              {!msg.ok && <WarningCircle weight="fill" aria-hidden />} {msg.text}
            </span>
          ) : (
            <>
              <b>{t('code.bannerTitle')}</b>
              <span className="muted">{t('code.bannerBody', { code })}</span>
            </>
          )}
        </div>
        {!msg?.ok && (
          <button type="button" className="step-action primary" disabled={busy} onClick={() => void apply()}>
            {t('code.apply')}
          </button>
        )}
        <button type="button" className="icon" onClick={close} aria-label={t('code.dismiss')}>
          <X weight="bold" />
        </button>
      </div>
    </div>
  );
}
