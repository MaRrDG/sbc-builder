# Analytics events (OpenWebTrack) — design

Task 12 in `task.csv`.

## Goal

Know where people drop off on the way from the landing page to a solved SBC, and how the Daily game is played, without cookies and without personal data. Payments (`owt.trackPayment`) come with the PayPal task.

## Facts found

- OpenWebTrack is self-hosted at `https://openwebtrack.mario-theodor.ro`. No FC Solver site exists there yet, so nothing is measured today.
- `/script.js` sets cookies (`_owt_uid` 365 days, `_owt_ses`). `/script.cookieless.js` has the same API and keeps random visitor / session ids in `sessionStorage` (per tab, gone when it closes). **We use the cookieless script.** Funnels therefore work within one tab session.
- The script tracks SPA navigations itself (patched `pushState` + `popstate`, pathname changes only), skips localhost / iframes / bots, and needs `data-website-id` + `data-domain`. API: `owt.trackEvent(name, props)` (≤10 props, keys `[a-z0-9_-]{1,32}`, values ≤255 chars), `owt.trackPayment(amount, currency, txId)`. `window._trk_disabled = true` stops all sends.
- The MCP (`/api/mcp`) is read-only: list websites, overview, breakdown (incl. event names), records. Sites and funnels are created in the OpenWebTrack dashboard.
- The new domain is **fc-solver.app**; the OpenWebTrack site is created for it directly.

## Events

No personal data in any event: no email, names, user / persona ids, usernames, invite codes, SBC names. Only the names and props below; `track.ts` is typed to exactly this list.

Funnel:

| Event | When | Props |
|---|---|---|
| `cta_click` | a landing "start" / "sign in" button | `where`: `header` / `hero` / `pricing` / `invite` / `daily` |
| `signin_done` | sign-in completed | `method`: `google` / `email`; `new`: `yes` / `no` |
| `extension_linked` | the extension linked an EA account | — |
| `sync_done` | a club or SBC sync finished | `kind`: `club` / `sbcs`; `ok`: `yes` / `no` |
| `sbc_open` | an SBC set opened | — |
| `solve` | a solve answered | `found`: `yes` / `no`; `deep`: `yes` / `no` |

Daily:

| Event | Props |
|---|---|
| `daily_start` | `mode`: `daily` / `practice`; `signed_in`: `yes` / `no` |
| `daily_end` | `mode`; `won`: `yes` / `no`; `tries`: `1`–`5`; `streak`: `0` / `1-6` / `7-13` / `14-29` / `30+` (daily only) |
| `daily_share` | `mode` |
| `daily_leaderboard` | — |

Growth / Premium:

| Event | Props |
|---|---|
| `invite_copy` | — |
| `premium_view` | `where`: `landing` / `daily` / `sidebar` / `settings` / `quota` |
| `discord_click` | `where`: `landing` / `sidebar` / `accounts` |
| `reminder_on` | — |

`web/src/track.ts`: `track(name, props?)` — no-op without `window.owt` or when disabled; pure part (`cleanProps`, `streakBucket`) unit-tested. `daily_start` once per game (not per reload of an already started game).

## Config and admins

- `ANALYTICS_SNIPPET` (prod `.env`): `<script defer src="https://openwebtrack.mario-theodor.ro/script.cookieless.js" data-website-id="…" data-domain="fc-solver.app"></script>`.
- `server/seo.ts` `analyticsWarnings(snippet)` (pure, tested): warns at startup (`[analytics]`) when the snippet loads `/script.js`, lacks `defer`, or lacks `data-website-id` / `data-domain`.
- The server does not add the snippet to `/dashboard/admin*` pages.
- Admins are not counted: when `/api/me` says admin, the app sets `window._trk_disabled = true` and stores `sbc-no-track` in `localStorage`; `main.tsx` sets the flag from it before the deferred tracker runs (module scripts run before a later deferred script). Clearing site data resets it.

## Policies

Privacy + cookie pages (en / ro / it): statistics with OpenWebTrack in cookieless mode store a random id for the current tab only (`sessionStorage`, gone when the tab closes), plus which features are used (solves, Daily results, syncs), never personal data. Update `UPDATED`.

**Owner's call:** under ePrivacy, an id in `sessionStorage` used for statistics may also need consent. Going without a banner is the owner's decision; to check with a specialist before launch.

## Docs

`docs/analytics.md`: the event table, config, the funnels to create in the OpenWebTrack dashboard. `docs/deploy.md` points to it. `CLAUDE.md`: new event → add it to `track.ts` + `docs/analytics.md`; never personal data in props.

## Testing

`npm test` (`track` pure helpers, `analyticsWarnings`), typecheck, build, i18n check; in the browser, a stub `window.owt = { trackEvent }` that logs to the console (no snippet locally, so nothing reaches the real OpenWebTrack) shows the expected events while clicking through.

## Out of scope

Payments / revenue, server-side events, consent banner, creating funnels through the API.
