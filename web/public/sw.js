// FC Solver service worker. Deliberately small: Vite's hashed /assets/* come from the cache after the first
// visit (fast start), a failed page load shows /offline.html (with its logo and icon from the cache). Never
// touches /api/*, pages that load fine, or any other origin (Clerk sign-in, Paddle checkout, EA, analytics):
// those always go to the network.
const CACHE = 'fcs-v2';
const OFFLINE = '/offline.html';
const PRECACHE = [OFFLINE, '/brand/logo-on-dark.svg', '/icon-192.png'];
// every deploy brings new hashed chunks; drop the ones not fetched again for a month (a chunk still in use
// is simply downloaded once more)
const ASSET_MAX_AGE = 30 * 24 * 60 * 60 * 1000;
const TRIM_EVERY = 24 * 60 * 60 * 1000;
let trimmedAt = 0;

async function trimAssets() {
  const now = Date.now();
  if (now - trimmedAt < TRIM_EVERY) return;
  trimmedAt = now;
  const c = await caches.open(CACHE);
  for (const req of await c.keys()) {
    if (!new URL(req.url).pathname.startsWith('/assets/')) continue;
    const res = await c.match(req);
    const at = Date.parse(res?.headers.get('date') ?? '');
    if (!at || now - at > ASSET_MAX_AGE) await c.delete(req);
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(
        (res) => {
          event.waitUntil(trimAssets());
          return res;
        },
        () => caches.match(OFFLINE),
      ),
    );
    return;
  }
  // the offline page's own files: it must render with no network at all
  if (PRECACHE.includes(url.pathname)) {
    event.respondWith(caches.match(req).then((hit) => hit ?? fetch(req)));
    return;
  }
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(CACHE).then(async (c) => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) c.put(req, res.clone());
        return res;
      }),
    );
  }
});
