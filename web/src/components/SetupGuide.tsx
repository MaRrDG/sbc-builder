import { useState } from 'react';
import { Check, Copy, DownloadSimple, ArrowSquareOut } from '@phosphor-icons/react';

const EXTENSIONS_URL = 'chrome://extensions';
const WEB_APP = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/';

function CopyUrl() {
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
      {done ? 'Copied' : 'Copy address'}
    </button>
  );
}

/** Step-by-step install of the session extension. Browsers block links to chrome:// pages, hence the copy button. */
export function SetupGuide({ compact = false }: { compact?: boolean }) {
  return (
    <ol className={`guide${compact ? ' compact' : ''}`}>
      <li>
        <div>
          <h3>Download the extension</h3>
          <p>It is already set up for this site. Nothing to configure.</p>
        </div>
        <a className="step-action primary" href="/api/extension.zip" download>
          <DownloadSimple weight="bold" /> Get extension
        </a>
      </li>
      <li>
        <div>
          <h3>Unzip it</h3>
          <p>
            You get a folder named <code>fc27-sbc-builder</code>. Keep it somewhere it will stay, Chrome loads it from there.
          </p>
        </div>
      </li>
      <li>
        <div>
          <h3>Open the extensions page</h3>
          <p>
            Paste <code>{EXTENSIONS_URL}</code> in the address bar, then switch on <b>Developer mode</b> in the top right corner.
          </p>
        </div>
        <CopyUrl />
      </li>
      <li>
        <div>
          <h3>Load it</h3>
          <p>
            Click <b>Load unpacked</b> and pick the <code>fc27-sbc-builder</code> folder. Pin it from the puzzle icon so it is one click away.
          </p>
        </div>
      </li>
      <li>
        <div>
          <h3>Log in to the FC27 web app</h3>
          <p>The extension picks up your session on its own. Keep a web app tab open whenever you want fresh data.</p>
        </div>
        <a className="step-action ghost-strong" href={WEB_APP} target="_blank" rel="noreferrer">
          Open web app <ArrowSquareOut weight="bold" />
        </a>
      </li>
      <li>
        <div>
          <h3>Open the builder</h3>
          <p>Click the extension icon, then <b>Open builder</b>. Your club and SBCs load in about a minute.</p>
        </div>
      </li>
    </ol>
  );
}
