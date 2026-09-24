import { Fragment, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n';
import { extensionZipUrl } from '../api';
import { Check, Copy, DownloadSimple, ArrowSquareOut } from '@phosphor-icons/react';

const EXTENSIONS_URL = 'chrome://extensions';
const WEB_APP = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/';

/** Fills {name} slots of a translated sentence with elements (code, bold words). */
export function fill(text: string, parts: Record<string, ReactNode>): ReactNode[] {
  return text.split(/(\{\w+\})/).map((chunk, i) => {
    const m = chunk.match(/^\{(\w+)\}$/);
    return m && m[1] in parts ? <Fragment key={i}>{parts[m[1]]}</Fragment> : chunk;
  });
}

function CopyUrl() {
  const { t } = useI18n();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="step-action ghost-strong"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(EXTENSIONS_URL);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked: the address is shown right next to the button */
        }
      }}
    >
      {done ? <Check weight="bold" /> : <Copy weight="bold" />}
      {done ? t('setup.copied') : t('setup.copy')}
    </button>
  );
}

const FOLDER = <code>fc27-sbc-builder</code>;

/** Step-by-step install of the session extension. Browsers block links to chrome:// pages, hence the copy button. */
export function SetupGuide({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <ol className={`guide${compact ? ' compact' : ''}`}>
      <li>
        <div>
          <h3>{t('setup.s1')}</h3>
          <p>{t('setup.s1p')}</p>
        </div>
        <a className="step-action primary" href={extensionZipUrl()} download>
          <DownloadSimple weight="bold" /> {t('setup.s1b')}
        </a>
      </li>
      <li>
        <div>
          <h3>{t('setup.s2')}</h3>
          <p>{fill(t('setup.s2p'), { folder: FOLDER })}</p>
        </div>
      </li>
      <li>
        <div>
          <h3>{t('setup.s3')}</h3>
          <p>{fill(t('setup.s3p'), { url: <code>{EXTENSIONS_URL}</code>, dev: <b>{t('setup.devMode')}</b> })}</p>
        </div>
        <CopyUrl />
      </li>
      <li>
        <div>
          <h3>{t('setup.s4')}</h3>
          <p>{fill(t('setup.s4p'), { load: <b>{t('setup.loadUnpacked')}</b>, folder: FOLDER })}</p>
        </div>
      </li>
      <li>
        <div>
          <h3>{t('setup.s5')}</h3>
          <p>{t('setup.s5p')}</p>
        </div>
        <a className="step-action ghost-strong" href={WEB_APP} target="_blank" rel="noreferrer">
          {t('setup.s5b')} <ArrowSquareOut weight="bold" />
        </a>
      </li>
      <li>
        <div>
          <h3>{t('setup.s6')}</h3>
          <p>{fill(t('setup.s6p'), { open: <b>{t('setup.openSolver')}</b> })}</p>
        </div>
      </li>
    </ol>
  );
}
