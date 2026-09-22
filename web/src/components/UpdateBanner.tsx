import { useState } from 'react';
import { ArrowCircleUp, Check, Copy, DownloadSimple, X } from '@phosphor-icons/react';
import { useI18n } from '../i18n';
import { fill } from './SetupGuide';

export interface ExtensionRelease {
  version: string;
  notes: string[];
}

/** -1 / 0 / 1 for dotted numeric versions ("0.3.0" < "0.4.0"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return Math.sign(d);
  }
  return 0;
}

/** True when the extension that last connected this account is older than the one we ship. */
export const needsUpdate = (installed: string | null | undefined, latest: ExtensionRelease | null) =>
  !!latest && (!installed || compareVersions(latest.version, installed) > 0);

interface Props {
  installed: string | null | undefined;
  latest: ExtensionRelease;
  expanded: boolean;
  onDismiss: () => void;
}

export function UpdateBanner({ installed, latest, expanded: startOpen, onDismiss }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(startOpen);
  const [copied, setCopied] = useState(false);
  return (
    <div className="update" role="status">
      <div className="update-row">
        <ArrowCircleUp weight="fill" className="update-icon" aria-hidden="true" />
        <div className="update-text">
          <strong>{t('update.title', { v: latest.version })}</strong>
          <span className="muted">
            {installed ? t('update.youHave', { v: installed }) : t('update.older')} {latest.notes.join(' · ')}
          </span>
        </div>
        <a className="step-action primary" href="/api/extension.zip" download onClick={() => setOpen(true)}>
          <DownloadSimple weight="bold" /> {t('update.get')}
        </a>
        <button type="button" className="icon" onClick={onDismiss} aria-label={t('update.hide')}>
          <X weight="bold" />
        </button>
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
