// One field for every kind of code (invite, promo, gift): the server tells which it was.
import { useState } from 'react';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { api, type RedeemResult } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../messages';

type T = ReturnType<typeof useI18n>['t'];

/** What a redeemed code gave; a founder always reads as lifetime, never as days. */
export function redeemText(r: RedeemResult, t: T, founders: { limit: number; left: number } | null): string {
  if (r.founder) return t('code.founder');
  if (r.kind === 'invite' && r.pending)
    return founders && founders.left > 0 ? t('code.invitePendingFounders', { limit: founders.limit, left: founders.left }) : t('code.invitePending');
  return r.days === null ? t('code.lifetime') : t('code.days', { count: r.days });
}

export function CodeInput({ initial = '', onRedeemed, founders }: { initial?: string; onRedeemed?: (r: RedeemResult) => void; founders: { limit: number; left: number } | null }) {
  const { t } = useI18n();
  const [code, setCode] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = async () => {
    setBusy(true);
    try {
      const r = await api.redeem(code);
      setMsg({ ok: true, text: redeemText(r, t, founders) });
      onRedeemed?.(r);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, t) });
    }
    setBusy(false);
  };

  return (
    <form className="code-input" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void apply(); }}>
      <label>
        <span>{t('code.label')}</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('code.placeholder')} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={24} />
      </label>
      <button type="submit" className="ghost" disabled={busy || !code.trim()}>{t('code.apply')}</button>
      {msg && (
        <p className={`code-msg ${msg.ok ? 'ok' : 'bad'}`} role="status">
          {msg.ok ? <CheckCircle weight="fill" aria-hidden /> : <WarningCircle weight="fill" aria-hidden />} {msg.text}
        </p>
      )}
    </form>
  );
}
