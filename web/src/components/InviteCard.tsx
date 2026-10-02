// Settings: my invite code + link, points, and spending them on Premium or a gift code.
import { useEffect, useState } from 'react';
import { Copy, Gift, ShareNetwork } from '@phosphor-icons/react';
import { api, type PlanInfo, type ReferralInfo } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../messages';
import { CodeInput } from './CodeInput';

const OPTIONS = [{ days: 7, price: 2 }, { days: 14, price: 3 }, { days: 30, price: 5 }] as const;

export function InviteCard({ plan, founders, onPlanChange }: { plan: PlanInfo; founders: { limit: number; taken: number; left: number } | null; onPlanChange: () => void }) {
  const { t } = useI18n();
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const lifetime = plan.tier === 'premium' && plan.premiumUntil === null;

  const load = () => api.referral().then(setInfo, () => {});
  useEffect(() => void load(), []);
  if (!info) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* no clipboard: the link is visible to select */
    }
  };
  const share = () => void navigator.share?.({ text: t('invite.shareText', { code: info.code }), url: info.link }).catch(() => {});
  const spend = async (days: 7 | 14 | 30, gift: boolean) => {
    setBusy(true);
    try {
      const r = await api.spendPoints(days, gift);
      setMsg('giftCode' in r ? t('invite.giftMade', { code: r.giftCode, days }) : t('code.days', { count: days }));
      await load();
      onPlanChange();
    } catch (e) {
      setMsg(errorText(e, t));
    }
    setBusy(false);
  };

  return (
    <section className="settings-card invite-card">
      <h2><Gift weight="fill" aria-hidden="true" /> {t('invite.title')}</h2>
      <p className="muted">{t('invite.lede')}</p>
      <div className="invite-code">
        <span className="muted">{t('invite.yourCode')}</span>
        <b className="code-chip">{info.code}</b>
        <button type="button" className="ghost" onClick={copy}><Copy aria-hidden="true" /> {copied ? t('invite.copied') : t('invite.copy')}</button>
        {'share' in navigator && <button type="button" className="ghost" onClick={share}><ShareNetwork aria-hidden="true" /> {t('invite.share')}</button>}
      </div>
      <p className="invite-stats">
        <b>{t('invite.points', { count: info.points })}</b> · {t('invite.invited', { count: info.invited })}
        {info.pendingInvites > 0 && <> · {t('invite.pending', { count: info.pendingInvites })}</>}
      </p>
      <h3>{t('invite.exchange')}</h3>
      {lifetime && <p className="muted">{t('invite.lifetimeNote')}</p>}
      <ul className="invite-options">
        {OPTIONS.map((o) => (
          <li key={o.days}>
            <span>{t('invite.option', { days: o.days, price: o.price })}</span>
            {!lifetime && <button type="button" className="ghost" disabled={busy || info.points < o.price} onClick={() => void spend(o.days, false)}>{t('invite.forMe')}</button>}
            <button type="button" className="ghost" disabled={busy || info.points < o.price} onClick={() => void spend(o.days, true)}>{t('invite.gift')}</button>
          </li>
        ))}
      </ul>
      {msg && <p role="status">{msg}</p>}
      {info.gifts.length > 0 && (
        <>
          <h3>{t('invite.gifts')}</h3>
          <ul className="invite-gifts">
            {info.gifts.map((g) => (
              <li key={g.code}><b className="code-chip">{g.code}</b> {g.days}d · {g.usedAt ? t('invite.giftUsed') : t('invite.giftFree')}</li>
            ))}
          </ul>
        </>
      )}
      <h3>{t('invite.haveCode')}</h3>
      <CodeInput founders={founders} onRedeemed={() => { void load(); onPlanChange(); }} />
    </section>
  );
}
