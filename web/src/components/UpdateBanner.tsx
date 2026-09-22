import { useState } from 'react';
import { ArrowCircleUp, Check, Copy, DownloadSimple, X } from '@phosphor-icons/react';

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
  const [open, setOpen] = useState(startOpen);
  const [copied, setCopied] = useState(false);
  return (
    <div className="update" role="status">
      <div className="update-row">
        <ArrowCircleUp weight="fill" className="update-icon" aria-hidden="true" />
        <div className="update-text">
          <strong>Extension {latest.version} is out</strong>
          <span className="muted">
            {installed ? `You have ${installed}.` : 'Your copy is older.'} {latest.notes.join(' · ')}
          </span>
        </div>
        <a className="step-action primary" href="/api/extension.zip" download onClick={() => setOpen(true)}>
          <DownloadSimple weight="bold" /> Get update
        </a>
        <button type="button" className="icon" onClick={onDismiss} aria-label="Hide until next update">
          <X weight="bold" />
        </button>
      </div>
      {open && (
        <ol className="update-steps">
          <li>Unzip it over your old <code>fc27-sbc-builder</code> folder and replace the files.</li>
          <li>
            In{' '}
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
            </button>{' '}
            press the reload arrow on FC Solver (named SBC Builder before this update).
          </li>
          <li>Refresh the FC27 web app tab. Your settings and account stay as they are.</li>
        </ol>
      )}
    </div>
  );
}
