// The service worker (web/public/sw.js) runs in production builds only: in dev Vite serves unhashed modules
// that a cache would only get in the way of.
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e: unknown) => console.warn('[pwa] service worker not registered', e));
  });
}
