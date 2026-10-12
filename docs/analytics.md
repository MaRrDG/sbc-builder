# Analytics

Self-hosted OpenWebTrack at `https://openwebtrack.mario-theodor.ro`, **cookieless script only**. Code: `web/src/track.ts` (typed events), `server/seo.ts` (`withAnalytics`, `analyticsFor`, `analyticsWarnings`). Design: `docs/superpowers/specs/2026-10-12-analytics-events-design.md`.

## Setup

1. OpenWebTrack dashboard → add the site `fc-solver.app` (timezone Europe/Bucharest).
2. Copy its snippet into `ANALYTICS_SNIPPET` in the server `.env`, with the **cookieless** script and `defer`:

   ```html
   <script defer src="https://openwebtrack.mario-theodor.ro/script.cookieless.js" data-website-id="<id>" data-domain="fc-solver.app"></script>
   ```

   `/script.js` sets cookies (`_owt_uid`, a year) and would need a consent banner; the cookieless one keeps a random id in the tab's `sessionStorage` only. The server logs `[analytics] ANALYTICS_SNIPPET: …` at startup when the snippet is not the cookieless one, has no `defer`, or misses `data-website-id` / `data-domain`.
3. `docker compose up -d` (the snippet is read at startup). Its origin goes into the CSP by itself.

The script sends nothing on localhost, in iframes, for bots, or on another domain than `data-domain`. Admin pages (`/dashboard/admin*`) never get the snippet, and signed-in admins are not counted (`sbc-no-track` in `localStorage`, set when `/api/me` says admin; clearing site data resets it).

## Events

Never personal data: no email, names, user / persona ids, usernames, invite codes, SBC names. A new event goes into `TrackEvents` in `web/src/track.ts` and into this table. Page views (including SPA navigations) are counted by the script itself.

| Event | When | Props |
|---|---|---|
| `cta_click` | landing "start" / "sign in" (signed out) | `where`: `header` / `hero` / `pricing` / `invite` |
| `signin_done` | sign-in completed | `method`: `google` / `email`; `new`: `yes` / `no` (Google: account created < 10 min ago) |
| `extension_linked` | the extension linked an EA account | — |
| `sync_done` | a club / SBC sync finished (seen in an open dashboard) | `kind`: `club` / `sbcs`; `ok`: `yes` / `no` |
| `sbc_open` | an SBC set opened from the list | — |
| `solve` | a solve answered | `found`, `deep`: `yes` / `no` |
| `daily_start` | first guess of a game | `mode`: `daily` / `practice`; `signed_in` |
| `daily_end` | game over | `mode`; `won`; `tries` 1–5; `streak` `0` / `1-6` / `7-13` / `14-29` / `30+` (daily only) |
| `daily_share` | result copied | `mode` |
| `daily_leaderboard` | leaderboard opened | — |
| `invite_copy` | invite link copied | — |
| `premium_view` | pricing section seen on the landing, "more" on the locked Daily reminder, solve quota used up | `where`: `landing` / `daily` / `quota` |
| `discord_click` | a Discord invite link | `where`: `landing` / `daily` / `sidebar` / `accounts` |
| `reminder_on` | Daily reminder switched on (Daily page or Settings) | — |

## Funnels to create in the dashboard

Funnels work within one tab session (the cookieless ids live per tab).

1. **Activation**: page `/` → `cta_click` → `signin_done` → `extension_linked` → `sbc_open` → `solve` (`found = yes`).
2. **Daily**: page `/daily` → `daily_start` (`mode = daily`) → `daily_end` → `daily_share`.
3. **Daily to app**: page `/daily` → `cta_click` or page `/signin` → `signin_done`.

Claude can read the numbers through the OpenWebTrack MCP (`/api/mcp`, read-only: `list_websites`, `analytics_overview`, `analytics_breakdown` with `dimension: "events"`, `analytics_records`).
