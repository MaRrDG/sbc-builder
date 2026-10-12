// "Install the app": a sidebar item (when the app can be installed and is not), a one-time banner on phones,
// and on iPhone a sheet with the two Safari steps (iOS has no install prompt).
import { useEffect, useRef, useState } from 'react';
import { DeviceMobile, Export, PlusSquare, X } from '@phosphor-icons/react';
import { useI18n } from '../i18n';
import { useInstall } from '../pwa/install';
import { track } from '../track';

function IosSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className="ios-install" aria-labelledby="ios-install-title" onClose={onClose} onCancel={onClose}>
      <h2 id="ios-install-title">{t('pwa.iosTitle')}</h2>
      <ol>
        <li><Export weight="bold" aria-hidden="true" /> {t('pwa.iosStep1')}</li>
        <li><PlusSquare weight="bold" aria-hidden="true" /> {t('pwa.iosStep2')}</li>
      </ol>
      <p className="muted">{t('pwa.iosNote')}</p>
      <button type="button" className="ghost bordered" onClick={onClose} autoFocus>{t('pwa.iosClose')}</button>
    </dialog>
  );
}

/** Runs the right install help for this browser; returns the iOS sheet when it is open. */
function useInstallAction() {
  const install = useInstall();
  const [ios, setIos] = useState(false);
  const start = () => {
    if (install.offer === 'prompt') void install.prompt();
    else if (install.offer === 'ios') {
      track('pwa_install_prompt', { platform: 'ios' });
      setIos(true);
    }
  };
  return { install, start, sheet: ios ? <IosSheet onClose={() => setIos(false)} /> : null };
}

export function InstallNavItem() {
  const { t } = useI18n();
  const { install, start, sheet } = useInstallAction();
  if (!install.offer) return null;
  return (
    <>
      <button type="button" className="nav-item" onClick={start}>
        <DeviceMobile weight="bold" aria-hidden="true" />
        <span>{t('pwa.install')}</span>
      </button>
      {sheet}
    </>
  );
}

export function InstallBanner() {
  const { t } = useI18n();
  const { install, start, sheet } = useInstallAction();
  // after "Install" on iOS the banner is gone but the steps sheet it opened must stay
  if (!install.bannerVisible) return sheet;
  return (
    <>
      <section className="install-banner" aria-labelledby="install-banner-title">
        <DeviceMobile weight="bold" aria-hidden="true" />
        <div>
          <h2 id="install-banner-title">{t('pwa.bannerTitle')}</h2>
          <p>{t('pwa.bannerText')}</p>
        </div>
        <div className="install-banner-actions">
          <button type="button" className="solve-sm" onClick={() => { start(); install.dismissBanner(); }}>{t('pwa.bannerInstall')}</button>
          <button type="button" className="ghost" onClick={install.dismissBanner} aria-label={t('pwa.bannerClose')}>
            <X weight="bold" aria-hidden="true" />
          </button>
        </div>
      </section>
      {sheet}
    </>
  );
}
