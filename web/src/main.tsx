import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import Root from './Root';
import { I18nProvider } from './i18n';
import { refFromUrl, saveRef } from './ref';
import { applyNoTrack } from './track';
import { registerServiceWorker } from './pwa/register';
import { startInstallCapture } from './pwa/install';
// fonts are served by us, not Google (no visitor IP goes to a third party)
import '@fontsource/geist/400.css';
import '@fontsource/geist/500.css';
import '@fontsource/geist/600.css';
import '@fontsource/geist/700.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import './styles.css';

// a deploy replaced the code chunks an open tab still points at: reload once to get the new ones
// (at most once per 30 s, so a chunk that really is missing shows the error note instead of looping)
window.addEventListener('vite:preloadError', (e) => {
  const KEY = 'fcs-chunk-reload';
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(KEY)) || 0;
  } catch {
    return; // no storage: no loop guard, so let the error boundary show its note
  }
  if (Date.now() - last < 30_000) return;
  try {
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    return;
  }
  e.preventDefault();
  location.reload();
});

applyNoTrack(); // before the deferred analytics script runs: admins are not counted
startInstallCapture(); // before React: beforeinstallprompt can fire before the first render
registerServiceWorker();

const ref = refFromUrl(location.search);
if (ref) saveRef(ref);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <I18nProvider>
        <Root />
      </I18nProvider>
    </ClerkProvider>
  </StrictMode>,
);
