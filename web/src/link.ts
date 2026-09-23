// Site <-> extension (site.js) messages. While signed in and the extension is present, keep a
// fresh link token in its hands, so opening the web app links that EA account to this user.
import { useEffect } from 'react';
import { api } from './api';

const TO_EXT = 'fcsolver-site';
const FROM_EXT = 'fcsolver-ext';
const REFRESH_MS = 9 * 60 * 1000; // tokens live 10 min

const post = (type: string, extra: Record<string, unknown> = {}) =>
  window.postMessage({ source: TO_EXT, type, ...extra }, window.location.origin);

export function useExtensionLink(active: boolean, onLinked: () => void) {
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const give = () =>
      api
        .linkToken()
        .then(({ token }) => post('fcsolver:link', { token }))
        .catch(() => {}); // offline or signed out: the next refresh tries again
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin || e.data?.source !== FROM_EXT) return;
      if (e.data.type === 'fcsolver:present' && !timer) {
        void give();
        timer = setInterval(give, REFRESH_MS);
      } else if (e.data.type === 'fcsolver:linked') onLinked();
    };
    window.addEventListener('message', onMessage);
    post('fcsolver:hello'); // the content script may have announced itself before we listened
    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(timer);
    };
  }, [active, onLinked]);
}

export const unlinkExtension = () => post('fcsolver:unlink');
