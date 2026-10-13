import { useState } from 'react';
import { ArrowCircleUp, Check, Copy, DownloadSimple, X } from '@phosphor-icons/react';
import { useI18n } from '../i18n';
import { extensionZipUrl } from '../api';
import { fill } from './SetupGuide';

import { type ExtensionRelease } from '../ext-version';

export { compareVersions, needsUpdate, updateRequired, type ExtensionRelease } from '../ext-version';

interface Props {
  installed: string | null | undefined;
  latest: ExtensionRelease;
  expanded: boolean;
  /** Installed version is below the server's minimum: "update required", steps open, no hide button. */
  required?: boolean;
  onDismiss: () => void;
}

export function UpdateBanner({ installed, latest, expanded: startOpen, required = false, onDismiss }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(startOpen || required);
  const [copied, setCopied] = useState(false);
  return (
    <div className={required ? 'update required' : 'update'} role={required ? 'alert' : 'status'}>
      <div className="update-row">
        <ArrowCircleUp weight="fill" className="update-icon" aria-hidden="true" />
        <div className="update-text">
          <strong>{required ? t('update.required', { v: latest.version }) : t('update.title', { v: latest.version })}</strong>
          {required && <span>{t('update.requiredWhy', { min: latest.minVersion ?? '' })}</span>}
          <span className="muted">
            {installed ? t('update.youHave', { v: installed }) : t('update.older')} {latest.notes.join(' · ')}
          </span>
        </div>
        <a className="step-action primary" href={extensionZipUrl()} download onClick={() => setOpen(true)}>
          <DownloadSimple weight="bold" /> {t('update.get')}
        </a>
        {!required && (
          <button type="button" className="icon" onClick={onDismiss} aria-label={t('update.hide')}>
            <X weight="bold" />
          </button>
        )}
      </div>
      {open && (
        <ol className="update-steps">
          <li>{fill(t('update.s1'), { folder: <code>fc27-sbc-builder</code> })}</li>
          <li>
            {fill(t('update.s2'), {
              url: (
            <button
              type="button"
              className="text"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText('chrome://extensions');
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                } catch {
                  /* clipboard blocked */
                }
              }}
            >
              chrome://extensions {copied ? <Check weight="bold" /> : <Copy weight="bold" />}
            </button>
              ),
            })}
          </li>
          <li>{t('update.s3')}</li>
        </ol>
      )}
    </div>
  );
}
