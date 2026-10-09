// "Join our Discord" for the public pages (landing, /daily). The invite comes from the public
// /api/discord/invite; no invite (or the request failing) means no link at all.
import { useEffect, useState } from 'react';
import { DiscordIcon } from './DiscordIcon';
import { useI18n } from '../i18n';

let cached: Promise<string | null> | null = null;

function loadInvite(): Promise<string | null> {
  cached ??= fetch('/api/discord/invite')
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { invite?: unknown } | null) => (typeof j?.invite === 'string' ? j.invite : null))
    .catch(() => {
      cached = null; // try again on the next mount
      return null;
    });
  return cached;
}

export function useDiscordInvite(): string | null {
  const [invite, setInvite] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void loadInvite().then((v) => live && setInvite(v));
    return () => {
      live = false;
    };
  }, []);
  return invite;
}

/** `bar`: logo + "Discord" in a top bar (icon only on phones). `foot`: logo + "Join our Discord" as a footer link. */
export function DiscordLink({ invite, variant }: { invite: string | null; variant: 'bar' | 'foot' }) {
  const { t } = useI18n();
  if (!invite) return null;
  const text = variant === 'bar' ? t('discord.short') : t('nav.discord');
  return (
    <a
      className={`discord-link discord-link-${variant}`}
      href={invite}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${text} ${t('nav.newTab')}`}
    >
      <DiscordIcon />
      <span className="discord-link-text">{text}</span>
      <span className="sr-only"> {t('nav.newTab')}</span>
    </a>
  );
}
