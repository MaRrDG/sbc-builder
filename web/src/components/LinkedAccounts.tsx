// Linked accounts screen: everything tied to this FC Solver account in one place (sign-in, Discord, EA accounts).
import { useState } from 'react';
import { useUser } from '@clerk/react';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import type { Account } from '../api';
import { useI18n } from '../i18n';
import { DiscordCard } from './DiscordCard';

const PROVIDERS: Record<string, string> = { google: 'Google', discord: 'Discord', apple: 'Apple', github: 'GitHub', facebook: 'Facebook', microsoft: 'Microsoft' };
const providerName = (p: string) => PROVIDERS[p] ?? p.charAt(0).toUpperCase() + p.slice(1);

function Verified({ ok }: { ok: boolean }) {
  const { t } = useI18n();
  const Icon = ok ? CheckCircle : WarningCircle;
  return (
    <span className={`acct-state${ok ? ' ok' : ''}`}>
      <Icon weight="fill" aria-hidden="true" /> {ok ? t('accounts.verified') : t('accounts.unverified')}
    </span>
  );
}

function SignInCard({ onSignOut }: { onSignOut: () => void }) {
  const { t } = useI18n();
  const { user } = useUser();
  // Discord has its own card below
  const external = (user?.externalAccounts ?? []).filter((e) => e.provider !== 'discord');
  const emails = user?.emailAddresses ?? [];
  return (
    <section className="settings-card">
      <h2>{t('accounts.signin')}</h2>
      <p className="muted">{t('accounts.signinText')}</p>
      {user && (
        <ul className="local-list">
          {emails.map((e) => (
            <li key={e.id}>
              <span>
                <strong>{t('accounts.email')}</strong> · {e.emailAddress}
              </span>
              <Verified ok={e.verification?.status === 'verified'} />
            </li>
          ))}
          {external.map((e) => (
            <li key={e.id}>
              <span>
                <strong>{providerName(e.provider)}</strong> · {e.emailAddress || e.username || ''}
              </span>
              <Verified ok={e.verification?.status === 'verified'} />
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="ghost wide" onClick={onSignOut}>
        {t('auth.signOut')}
      </button>
    </section>
  );
}

function EaAccountsCard({ personas, activeId, onUnlink }: { personas: Account[]; activeId: number | null; onUnlink: (id: number) => void }) {
  const { t } = useI18n();
  const [asking, setAsking] = useState<number | null>(null);
  return (
    <section className="settings-card account-card">
      <h2>{t('account.personas')}</h2>
      {personas.length === 0 ? (
        <p className="muted">{t('account.none')}</p>
      ) : (
        <ul className="local-list">
          {personas.map((a) => (
            <li key={a.personaId}>
              <span>
                {a.personaName} · {a.clubName}
                {a.personaId === activeId && <em className="acct-active">{t('accounts.active')}</em>}
              </span>
              {asking === a.personaId ? (
                <span className="account-ask" role="group" aria-label={t('account.disconnectAsk', { name: a.personaName })}>
                  <span>{t('account.disconnectAsk', { name: a.personaName })}</span>
                  <button type="button" className="ghost" onClick={() => { setAsking(null); onUnlink(a.personaId); }}>{t('account.disconnectYes')}</button>
                  <button type="button" className="ghost" onClick={() => setAsking(null)}>{t('account.cancel')}</button>
                </span>
              ) : (
                <button type="button" className="ghost" onClick={() => setAsking(a.personaId)}>{t('account.disconnect')}</button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function LinkedAccounts({ personas, activeId, onUnlink, onSignOut }: {
  personas: Account[]; activeId: number | null; onUnlink: (id: number) => void; onSignOut: () => void;
}) {
  const { t } = useI18n();
  return (
    <section className="settings-page">
      <header className="page-head">
        <div>
          <h1>{t('accounts.title')}</h1>
          <p className="muted">{t('accounts.lede')}</p>
        </div>
      </header>
      <div className="accounts-grid">
        <SignInCard onSignOut={onSignOut} />
        <DiscordCard />
        <EaAccountsCard personas={personas} activeId={activeId} onUnlink={onUnlink} />
      </div>
    </section>
  );
}
