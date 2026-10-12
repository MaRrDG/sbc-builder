// Install help for the PWA. The browser fires `beforeinstallprompt` early, often before React renders, so
// capture starts from main.tsx and components read it through useInstall().
import { useCallback, useEffect, useState } from 'react';
import { track } from '../track';
import { bannerVisible, installOffer, isIos, isPhone, isStandalone, type InstallOffer } from './platform';

interface PromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const KEY = 'sbc-pwa-banner';
type Saved = { dismissedAt: number | null; installedAt: number | null };

function readSaved(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Saved | null;
    return { dismissedAt: v?.dismissedAt ?? null, installedAt: v?.installedAt ?? null };
  } catch {
    return { dismissedAt: null, installedAt: null };
  }
}
function writeSaved(s: Saved): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: the banner may show again next visit */
  }
}

let deferred: PromptEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

/** Called once from main.tsx, before React renders. */
export function startInstallCapture(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we show our own button / banner instead of the browser's mini-infobar
    deferred = e as PromptEvent;
    changed();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    writeSaved({ ...readSaved(), installedAt: Date.now() });
    track('pwa_installed');
    changed();
  });
}

export interface InstallState {
  offer: InstallOffer;
  phone: boolean;
  bannerVisible: boolean;
  prompt(): Promise<void>;
  dismissBanner(): void;
}

function snapshot() {
  const standalone = isStandalone(window.matchMedia?.('(display-mode: standalone)').matches ?? false, (navigator as Navigator & { standalone?: boolean }).standalone);
  const ios = isIos(navigator.userAgent, navigator.maxTouchPoints ?? 0);
  const offer = installOffer({ standalone, ios, canPrompt: deferred !== null });
  const phone = isPhone(navigator.userAgent);
  return { offer, phone, saved: readSaved() };
}

export function useInstall(): InstallState {
  const [s, setS] = useState(snapshot);
  useEffect(() => {
    const l = () => setS(snapshot());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  const prompt = useCallback(async () => {
    if (!deferred) return; // iOS: the caller opens the steps sheet itself
    track('pwa_install_prompt', { platform: 'android' });
    const e = deferred;
    deferred = null; // a prompt event can be used once
    await e.prompt();
    await e.userChoice.catch(() => null);
    changed();
  }, []);

  const dismissBanner = useCallback(() => {
    writeSaved({ ...readSaved(), dismissedAt: Date.now() });
    changed();
  }, []);

  return {
    offer: s.offer,
    phone: s.phone,
    bannerVisible: bannerVisible({ phone: s.phone, offer: s.offer, dismissedAt: s.saved.dismissedAt, installedAt: s.saved.installedAt }),
    prompt,
    dismissBanner,
  };
}
