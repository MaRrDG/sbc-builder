// Linked accounts card: connect Discord through Clerk (Discord connection, connect-only) so the bot knows who runs /sbc and /stats.
import { useEffect, useRef, useState } from 'react';
import { useReverification, useUser } from '@clerk/react';
import { isReverificationCancelledError } from '@clerk/react/errors';
import { ArrowSquareOut, LinkBreak } from '@phosphor-icons/react';
import { DiscordIcon } from './DiscordIcon';
import { api, type DiscordInfo } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../messages';
import { useReverifyDialog } from './Reverify';

export function DiscordCard({ onChange }: { onChange?: () => void }) {
  const { t } = useI18n();
  const { user } = useUser();
  const [info, setInfo] = useState<DiscordInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const synced = useRef<string | null>(null);
  const { dialog, options } = useReverifyDialog();
  // creating (and removing) an external account is a sensitive Clerk action: it asks for a fresh verification
  const createAccount = useReverification(() => user!.createExternalAccount({ strategy: 'oauth_discord', redirectUrl: `${window.location.origin}/dashboard/accounts?discord=connected` }), options);
  const destroyAccount = useReverification((e: { destroy: () => Promise<unknown> }) => e.destroy(), options);

  const run = async (fn: () => Promise<DiscordInfo | void>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      if (r) {
        const changed = (info?.discord?.username ?? null) !== (r.discord?.username ?? null);
        setInfo(r);
        if (changed) onChange?.(); // boost Premium shows in the plan without a reload
      }
    } catch (e) {
      if (!isReverificationCancelledError(e)) setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!user || synced.current === user.id) return;
    synced.current = user.id; // StrictMode runs effects twice: one sync (and one POST) per user
    const back = new URLSearchParams(window.location.search).has('discord');
    if (back) window.history.replaceState(window.history.state, '', window.location.pathname);
    const verified = user.externalAccounts.some((e) => e.provider === 'discord' && e.verification?.status === 'verified');
    void run(async () => {
      const cur = await api.discord.get();
      if (cur.discord || !verified) {
        if (back && !verified) setError(t('settings.discord.failed'));
        return cur;
      }
      // back from Discord, or Clerk already holds a verified Discord account the server has not stored yet
      return api.discord.connect();
    });
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = () =>
    run(async () => {
      if (!user) return;
      // an abandoned attempt leaves an unverified Discord account that would block a new one
      for (const e of user.externalAccounts) if (e.provider === 'discord' && e.verification?.status !== 'verified') await destroyAccount(e);
      const ext = await createAccount();
      const url = ext.verification?.externalVerificationRedirectURL;
      if (!url) throw new Error(t('settings.discord.failed'));
      window.location.assign(url.href);
    });

  const join = info?.invite && (
    <a className="ghost bordered" href={info.invite} target="_blank" rel="noopener noreferrer">
      <ArrowSquareOut weight="bold" aria-hidden="true" /> {t('settings.discord.join')}
    </a>
  );

  return (
    <section className="settings-card discord-card">
      <h2>{t('settings.discord.title')}</h2>
      <p className="muted">{t('settings.discord.text')}</p>
      {info?.discord ? (
        <>
          <p className="discord-who">
            <DiscordIcon /> {t('settings.discord.connected', { name: info.discord.username || 'Discord' })}
          </p>
          <div className="discord-actions">
            {join}
            <button type="button" className="ghost bordered" disabled={busy} onClick={() => void run(() => api.discord.disconnect())}>
              <LinkBreak weight="bold" aria-hidden="true" /> {t('settings.discord.disconnect')}
            </button>
          </div>
        </>
      ) : (
        <div className="discord-actions">
          <button type="button" className="ghost bordered" disabled={busy || !user} onClick={() => void connect()}>
            <DiscordIcon /> {t('settings.discord.connect')}
          </button>
          {join}
        </div>
      )}
      {dialog}
      {error && (
        <div className="banner" role="alert">
          {error}
        </div>
      )}
    </section>
  );
}
