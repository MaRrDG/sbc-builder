# FC Solver as an installable app (PWA) — design

Task 11 in `task.csv` (FC Solver on the phone). Decided with the owner on 2026-10-12.

## Goal

FC Solver installs on a phone's home screen and opens full screen like an app, starts fast, and shows a clean screen when there is no internet. On the phone the EA sync is explained honestly: **the sync runs on your PC** (the Chrome extension inside the EA web app there); from the phone you see, solve and plan with what the PC synced, and you can start a club sync while the PC's web app is open.

## Decisions

- **No extension on the phone (for now).** Chrome on Android / iOS has no extensions. Firefox Android could run ours (MV3, `world: MAIN` from Firefox 128) with a `background.scripts` fallback and AMO signing; Safari iOS needs a native wrapper and App Store review. Out of scope; may come later.
- **Basic PWA, no push** in this version. Push (VAPID, subscriptions, server sends) is a later project.
- **Clean offline screen**, no offline data: data always comes fresh from the server.
- **Install invitation**: a sidebar / hamburger item "Install app" (only when installable and not installed) plus a one-time dismissible banner on phones. Android: the native install prompt. iPhone: a small sheet with the steps (Share → Add to Home Screen).
- **Hand-written service worker** (`web/public/sw.js`, no dependency). Not `vite-plugin-pwa`: the server renders each page's `<head>` (SEO, `server/seo.ts`) and serves `index.html` with `no-cache`; precaching `index.html` would fight that.

## Service worker (`web/public/sw.js`)

Registered only in production builds (`import.meta.env.PROD`), scope `/`.

- **Navigations** (`request.mode === 'navigate'`): network only; on a network failure, the cached `/offline.html`.
- **Same-origin `GET /assets/*`** (Vite hashed, immutable): cache first, filled on use.
- **Everything else** (`/api/*`, other same-origin files, every cross-origin request: Clerk, Paddle, EA, analytics, fonts): not intercepted (no `respondWith`), the browser handles it.
- Install: pre-cache `/offline.html` (+ the icons it shows); `skipWaiting()`. Activate: delete caches whose name is not the current `CACHE` (`fcs-v1`); `clients.claim()`.
- Served by the server with `Cache-Control: no-cache` so a new worker is picked up on the next visit.

## Manifest and iOS

`web/public/site.webmanifest` gains: `id: "/dashboard"`, a maskable 512 px icon (`/icon-maskable-512.png`, the brand mark on `#0d1411` with a 20 % safe margin, rendered by `scripts/pwa-icons.ts` with `@resvg/resvg-js` like `scripts/discord-assets.ts`), `shortcuts` (SBCs → `/dashboard`, Daily → `/daily`), `lang`/`dir`, `categories: ["games", "utilities"]`. Existing name, `start_url: /dashboard`, `display: standalone`, colours stay.

`web/index.html` gains `apple-mobile-web-app-capable=yes`, `apple-mobile-web-app-status-bar-style=black-translucent`, `apple-mobile-web-app-title=FC Solver`, `mobile-web-app-capable=yes`.

## Offline page (`web/public/offline.html`)

Static, self-contained (inline CSS, no script but a tiny inline language pick from `navigator.language`: en / ro / it), the site's dark teal look, logo, "You're offline — FC Solver needs the internet", a "Try again" button (`location.reload()`). `noindex`.

## Install (`web/src/pwa/`)

- `platform.ts` (pure, tested): `isStandalone(displayModeStandalone: boolean, navigatorStandalone: boolean | undefined)`, `isIos(userAgent: string, maxTouchPoints: number)`, `isPhone(userAgent: string)`, `installOffer({ standalone, ios, canPrompt })` → `'prompt' | 'ios' | null`, `bannerVisible({ phone, offer, dismissedAt, installedAt })` → boolean (once: hidden for good after a dismiss or an install).
- `install.ts`: listens for `beforeinstallprompt` (stored, `preventDefault()`), `appinstalled`; started from `main.tsx` before React renders so the event is never missed; `useInstall()` hook → `{ offer, prompt(), bannerVisible, dismissBanner() }`; `localStorage` key `sbc-pwa-banner` (keeps the old `sbc-*` naming), wrapped in try/catch.
- `register.ts`: `registerServiceWorker()` on `load`, production only, errors logged, never thrown.
- `components/InstallApp.tsx`: `InstallNavItem` (sidebar), `InstallBanner` (phones, top of the dashboard main area), `IosInstallSheet` (dialog with the two steps, focus-trapped, Esc closes).
- Analytics (`track.ts`): `pwa_install_prompt` (`platform: 'android' | 'ios'`), `pwa_installed`. `docs/analytics.md`.

## "The sync runs on your PC"

- **Phone, no EA account linked** (`linked.length === 0`, `isPhone`): the setup screen says "Set up FC Solver on your PC" (extension + EA web app there; after that it all works here too) instead of the extension download steps, which cannot work on a phone. A link to the guide stays for reading.
- **Phone, EA account linked**: under the sync controls in the menu, one line: web app open (`account.session`) → "Your PC's web app is open: syncs run there now"; closed → "Open the EA web app on your PC to sync. It runs there, not on the phone." The club sync button keeps its existing rule (disabled without a session).
- Strings in en / ro / it, `npm run i18n:check`.

## Server

- `/sw.js` and `/offline.html`: `Cache-Control: no-cache`; `/offline.html` also `X-Robots-Tag: noindex`. CSP already allows `worker-src 'self' blob:`; nothing new.
- `/site.webmanifest`: `Content-Type: application/manifest+json`.

## Docs

`CLAUDE.md` layout line for `web/src/pwa/`, rule: the service worker never caches `/api/*` or navigations. `docs/architecture.md` short PWA section. Changelog entry (en / ro / it): installable app, sync stays on the PC.

## Testing

Unit (`npm test`): `platform.ts` (standalone in each browser, iPadOS desktop UA with touch, Android, desktop; offer and banner rules). Typecheck, build, i18n check. Browser: Chrome DevTools → Application → Manifest shows installable, no errors; Service Workers shows `sw.js` activated; offline (DevTools "Offline") reload of `/dashboard` shows `offline.html`; `/api/*` not served from cache; 390 px layout of banner, sheet, setup message. Owner: install on their phone from dev.

## Out of scope

Push notifications, offline data, the extension on Firefox Android / Safari iOS, app store listings (TWA / Capacitor).
