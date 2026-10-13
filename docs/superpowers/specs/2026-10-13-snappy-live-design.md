# Snappy dashboard + live progress — design

Date: 2026-10-13. Status: approved in chat, sections 1-4.

## Goal

The dashboard should feel instant: on open the last known SBCs, club and status show at once, and every EA request in flight (after opening the app and the EA web app) shows visible progress. Today the slowness is intermittent: sometimes the open, sometimes the sync after the EA tab, sometimes moving between screens.

Non-goals: no faster EA paging (1.5-3 s per page stays, "be gentle with EA"), no change to meter caps, game formulas or any EA call path.

## Causes found (2026-10-13)

1. Serial boot: index chunk 700 kB → Clerk CDN script + handshake → only then the lazy App chunk 330 kB → `legacy-keys` → `/api/me` → meta + club + sets + status. The `.boot` screen is blank throughout (`Root.tsx:19,84,147`, `App.tsx:202,266`).
2. No client data cache; the SBC list shows a false "No SBCs yet" while loading (`SetList.tsx:130`).
3. Heavy endpoints: `/api/status` parses the full club up to 3x (`sync.ts:50,63,99`) every 5 s / 1.5 s; `/api/sets` reads one challenge file per set; `/api/me` runs ~7 serial DB queries; `readCache` has no memory cache.
4. EA tab sync: the job is enqueued after `nextJob` already answered (`index.ts:491-494`, +5 s), the club modal blocks the page (`ClubSyncModal.tsx:25`), club progress is a guess, SBC jobs have no progress.
5. Updates: 5 s polling; any `editedAt` change refetches everything; every poll re-renders the whole App (`App.tsx:311-312`).

## 1. Instant boot and last known state

- `Root.tsx` starts the App chunk import immediately, in parallel with Clerk.
- `.boot` becomes a skeleton of the app shape (top bar, sidebar, a few set cards); calm pulse, off under `prefers-reduced-motion`.
- Locales load on demand (only the active language) in `i18n.tsx`; legal docs and changelog leave the index chunk. Target: index chunk under ~300 kB.
- New `web/src/cache.ts`: IndexedDB per persona holding the last `/api/me`, meta, sets, club, status. On open: render from cache, revalidate in the background, swap in. While showing cached data the top bar says "updating…" (not `--go`). No cache (first visit) → skeleton. "No SBCs yet" only when the server really answered empty.
- The cache is cleared on sign-out and when the Clerk user changes.
- `/api/me` and the active persona's data calls (persona already in `localStorage`) start in parallel. `legacy-keys` only runs when old keys exist.

## 2. Cheaper server

- `store.ts`: in-memory cache of the last parsed object per key, updated by `writeCache` (never stale vs disk), LRU-capped by key count. Fix the fixed tmp name: unique tmp per write and per-key serialized writes.
- Memoize derived results per cache version: `getStatus`, the points targets in `/api/sets`.
- `/api/me`: independent queries in parallel.
- ETag (cache version) on `/api/club`, `/api/meta`, `/api/sets` → `304` when unchanged.
- `personaRow` stays uncached (one indexed lookup; a persona takeover must cut access at once). `last_seen` still at most every 5 min.

## 3. Live instead of polling

- `GET /api/stream`, `text/event-stream`, read with streaming `fetch` (so `Authorization: Bearer` + `X-Persona` are sent; `EventSource` cannot).
- Events: `status` (compact, only on change), `changed` (`{keys: ["club","sets","challenge:123"]}` → the site refetches only that piece, via ETag), `job` (progress, section 4). Sources: the existing `onCacheWrite` listener and `jobs.ts`.
- 25 s heartbeat (Cloudflare idle timeout is 100 s), `X-Accel-Buffering: no`, server closes after ~5 min and the client reconnects with a fresh Clerk token, max 3 streams per user.
- Hidden tab closes the stream; on return reconnect + one status fetch. Stream failure → automatic fallback to today's polling.
- `setLinked` / `setStatus` only when the value really changed (no whole-App re-render per tick).
- Jobs: enqueue on `webAppReturned` before picking the next job. `/api/jobs/next?wait=1` long-polls up to 25 s and answers as soon as a job exists; extension 1.0.3 sends `wait=1` (bump `manifest.json` + `release.json`); older extensions keep today's behaviour.
- The 20 s session grace stays and is shown as "waiting for the EA web app to finish loading".

## 4. Visible, non-blocking progress

- The top bar status pill becomes an activity indicator (small progress ring + main job text, e.g. "Club 12/~55"); stays in the phone top bar.
- Click → activity panel, one row per job (Club, SBC list, Challenges, Evolutions), state by icon + text: waiting ("Open the EA web app" / "waiting for the web app to finish loading"), queued, running (page 12 of ~55, ~1,100 players / set 18/40), done (time), EA pause ("EA asked for a pause, resuming at 21:14"), failed (reason).
- Determinate bar when the total is known (SBC sets) or estimated (club, from the last club, shown with "~"); indeterminate otherwise.
- `jobs.ts` keeps structured progress per job (`done` / `total` / `unit`), sent as `job` events.
- The club sync modal no longer blocks the page. Only solve waits: the button says "Club syncing (12/~55)" and enables itself at the end.
- On completion a short toast ("Club updated: 1,204 players, +12 new", "3 new SBCs"), also on `aria-live="polite"`.
- Rules: `--go` only for done, reduced motion stops bar animation, 8 px controls / 14 px containers, every string via `t()` (en/ro/it), changelog entry (en/ro/it). `docs/api.md` gets `/api/stream`, `jobs/next?wait`, ETag.

## Testing

- Unit tests (pure): job progress/state reducer, ETag/version rules, stream event reducer on the client, cache key rules.
- `npm run typecheck`, `npm test`, `npm run build` (check chunk sizes), `npm run i18n:check`.
- Browser on dev with real data: cold open, warm open, EA tab sync with progress, hidden tab, stream fallback (block `/api/stream`), 390 px and desktop.
