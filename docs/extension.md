# Chrome extension

The extension is the bridge between the player's logged-in FC27 web app and FC Solver. It is small on purpose and never sends anything to EA itself.

## Files

| File | Runs in | Job |
|---|---|---|
| `manifest.json` | | MV3 manifest; `webRequest` + `storage` + `alarms`, host access to the web app, UTAS and the FC Solver server |
| `background.js` | service worker | session bridge, SBC submit tracking, relaying page events, update check |
| `hook.js` | the web app page (MAIN world) | reads the web app's own responses for packs and item moves |
| `bridge.js` | the web app page (isolated world) | relays `hook.js` messages to the worker; shows the update notice |
| `popup.html` / `popup.js` | toolbar popup | status, server address, **Open FC Solver** |
| `release.json` | server only | release notes per version (not shipped in the zip) |

## What it watches

1. **Identity.** `webRequest.onSendHeaders` keeps the `X-UT-SID` in `chrome.storage.session` (memory only). `hook.js` reports who is logged in (from the web app's `/usermassinfo`); the worker calls `POST /api/hello` with the key it holds for that persona, and only for an unknown persona sends the SID once as proof. Keys are stored per persona (`personaKeys`).

2. **Sync jobs.** `bridge.js` polls the worker, which asks `GET /api/jobs/next`, every 5 s (15 s in a hidden tab). A job goes to `hook.js`, which runs its fixed read-only recipe with the web app's own headers from the page (origin `www.ea.com`), 1.5 s between requests, and reports each request (`/api/jobs/:id/call`), each response (`/api/webapp-event`) and the end (`/api/jobs/:id/done`). The worker stops handing out jobs after 200 requests a day, independent of the server.

3. **SBC submits. The web app first saves the squad (`PUT /sbs/challenge/{id}/squad`, body `{players:[{index, itemData:{id, dream}}]}`), then submits it (`PUT /sbs/challenge/{id}?skipUserSquadValidation=…`). The worker keeps the item ids from the save (concept players excluded) and, when the submit completes with HTTP 200, posts them to `/api/sbc-submitted`.

4. **Packs, item moves and loaded data.** Extensions cannot read response bodies through `webRequest`, and a pack's contents only exist in the response. `hook.js` wraps `XMLHttpRequest` and `fetch` inside the page and, for successful calls to exactly `/purchased/items`, `/item`, `/item/{id}`, `/club`, `/squad/list|active|{id}`, `/sbs/sets`, `/sbs/setId/{id}/challenges` and `/chemistry/profiles`, posts `{method, path, query, request, response}` to `bridge.js`, which forwards it to the worker, which sends it to `/api/webapp-event`. Every other endpoint is ignored, and errors in the hook are swallowed so the web app can never break because of it.

## Connected or not

The extension is **connected** when a web app tab polled FC Solver successfully in the last 30 s. It connects by itself when you open the web app (identity → `/api/hello` → first poll). The toolbar badge shows a green dot when connected and a red dot when not (**NEW** wins while an update is waiting); an `alarms` tick every 30 s turns it red soon after the tab closes. The popup shows the same state in green or red, with the linked account. Without a key (first run, server address changed, failed hello) the next poll asks the tab to introduce itself again, so no web app reload is needed; proving an account with the SID happens at most once a minute. When not connected the popup also shows the last error.

## Access keys and "Open FC Solver"

The popup opens `<server>/#keys=<key1>,<key2>`. The fragment is never sent to the server; the UI moves the keys to `localStorage` and cleans the address bar.

## Server address

`background.js` and `popup.js` contain `http://localhost:5178` as the default. `GET /api/extension.zip` replaces it with the origin the zip was downloaded from and adds that origin to `host_permissions`, so friends never configure anything.

## Updates

- The worker asks `GET /api/extension/version` at most every 30 min (and on browser start / install). If the server has a newer version it sets a **NEW** badge and remembers the release.
- On the web app page, `bridge.js` asks the worker and shows a small notice (shadow DOM, so no style clashes) with **How to update** (opens FC Solver with the steps expanded) and **Later** (hidden until the next version).
- The site shows its own banner when the version the extension last reported is older, or missing (0.2 and 0.3 did not report one).

Updating keeps the extension id, storage and keys: unzip over the old folder, press reload in `chrome://extensions`, refresh the web app.

## Releasing a new version

1. Change the code in `extension/`.
2. Bump `version` in `extension/manifest.json`.
3. Add a line for that version in `extension/release.json`.
4. Deploy the server. Everyone sees the notice on their next web app visit or FC Solver load.
