# HTTP API

Base URL: the server itself (`http://localhost:5178` locally, `https://sbc-builder.mario-theodor.ro` in production). In development Vite on `:5173` proxies `/api` to the API.

All bodies are JSON. Errors look like `{ "error": "message" }` with a meaningful status (`400` bad input, `401` unknown account or expired EA session, `404` not found, `409` nothing cached yet, `429` EA rate limiting).

## Authentication

| Header | Used by | Meaning |
|---|---|---|
| none | `/api/session`, `/api/accounts`, `/api/meta`, `/api/extension*` | public or self-authenticating |
| `X-Account-Key: <key>` | everything else | secret key of one EA account, handed out by `/api/session` |

The EA session id (`X-UT-SID`) is only ever sent **to** the server by the extension; the API never returns it.

---

## Accounts and session

### `POST /api/session`

Called by the extension whenever the web app uses a new session id.

```json
{ "sid": "b52b9d04-…", "contentGuid": "27A3C9F1-…", "extVersion": "0.4.0" }
```

- `sid`: required, the web app's `X-UT-SID`.
- `contentGuid`: optional, the CDN folder of the current game build (card art, names).
- `extVersion`: optional, version of the extension making the call.

If the SID is new the server calls EA `/usermassinfo` once to identify the persona, stores the session and starts an automatic sync if data is stale.

```json
{ "ok": true, "account": { "personaId": 1005016552645, "personaName": "MaR804", "clubName": "Biliboaca", "session": true, "extVersion": "0.4.0", "sidUpdatedAt": 1790064170490 }, "accessKey": "97uq…" }
```

### `POST /api/accounts`

Which of the keys stored in this browser are valid.

```json
{ "keys": ["97uq…", "Zx81…"] }
```
```json
{ "accounts": [{ "key": "97uq…", "account": { "personaId": 1005016552645, "personaName": "MaR804", "clubName": "Biliboaca", "session": true } }] }
```

### `GET /api/status` (key)

```json
{
  "account": { "personaId": 1005016552645, "session": true, "extVersion": "0.3.0", "...": "..." },
  "sync": { "running": null, "error": null, "clubAt": 1790064472801, "sbcAt": 1790062053735, "editedAt": null, "unassigned": 1 },
  "extension": { "version": "0.4.0", "notes": ["Update notices in the web app and on the site"] }
}
```

`editedAt` changes whenever the cache was edited from web app activity; the UI polls this every 5 s and reloads when it moves. `unassigned` counts pack players not yet sent to the club.

### `POST /api/sync` (key)

Manual sync. `what`: `"club"` (players, active squad, chemistry profiles), `"sbc"` (sets + changed challenges) or `"all"`. Returns the new `sync` status. Fails with `409`/`401` if there is no live EA session.

---

## Game data

### `GET /api/meta`

Static data for rendering: names of nations / leagues / clubs / rarities, formations with position ids, card rarity art (`guid`, `levels`, text colours) and `contentBase` (EA CDN root for images). With a key it also applies that account's chemistry profiles.

### `GET /api/club` (key)

```json
{
  "fetchedAt": 1790064472801,
  "players": [{ "id": 943996158675, "assetId": 183277, "name": "Hazard", "fullName": "Eden Hazard", "rating": 89, "tier": 3, "rareflag": 72,
                "possiblePositions": ["LM", "CAM", "LW"], "nation": 7, "league": 13, "club": 114605, "untradeable": true,
                "attributes": [91, 84, 85, 93, 37, 69], "skillMoves": 4, "weakFoot": 4, "foot": "Right", "...": "..." }],
  "squad": { "starters": [945052590995, "…"], "bench": ["…"] }
}
```

### `GET /api/sets` (key)

The cached SBC categories and sets exactly as EA returns them (`setId`, `name`, `challengesCount`, `challengesCompletedCount`, `repeatable`, `timesCompleted`, ...).

### `GET /api/sets/:id/challenges?refresh=1` (key)

Challenges of one set, each with its parsed requirements. Loaded from cache; `refresh=1` (or a missing cache) asks EA.

```json
{ "challenges": [{ "challengeId": 35, "name": "Celtic v Rangers", "formation": "f442", "status": "IN_PROGRESS", "elgOperation": "AND",
    "requirements": [{ "slot": 1, "scope": 0, "count": 1, "combined": false, "keys": { "10": [42] }, "text": "Scotland: Min. 1 Player" }] }] }
```

`scope`: `0` min, `1` max, `2` exactly. `keys` maps EA eligibility keys to accepted values (see [solver.md](solver.md)).

---

## Solving

### `POST /api/solve` (key)

```json
{
  "setId": 16,
  "challengeId": 35,
  "deep": false,
  "options": {
    "excludeIds": [943996158675],
    "excludeActiveSquad": true,
    "excludeSquadReserves": false,
    "excludeNations": [39],
    "excludeLeagues": [],
    "excludeClubs": [],
    "onlyUntradeable": false,
    "maxRating": 99,
    "excludeSpecial": true
  }
}
```

`deep: true` gives the solver 30 s instead of 10 s. Any option left out uses the default above.

Found:

```json
{
  "found": true, "status": "OPTIMAL", "ms": 520, "cost": 16.75,
  "eval": { "rating": 62, "chemistry": 15, "allMet": true,
            "results": [{ "text": "Scotland: Min. 1 Player", "met": true, "actual": 1 }] },
  "slots": [{ "position": { "uniqueId": 0, "name": "GK", "typeId": 0 }, "player": { "…": "…" }, "chem": 3 }]
}
```

Not possible:

```json
{ "found": false, "reasons": ["France: Min. 2 Players: you have 0 usable. Your solver settings hide 20 more."], "slots": ["… empty …"] }
```

---

## Extension events

### `POST /api/sbc-submitted` (key)

Sent after the web app successfully submits an SBC.

```json
{ "challengeId": 35, "itemIds": [945052590995, 944099662109] }
```

Removes those items from the cached club and squad, marks the challenge completed and bumps the set progress. Returns `{ "ok": true, "removed": 11 }`.

### `POST /api/webapp-event` (key)

A copy of one web app call, relayed by the extension's page hook. Only these paths are accepted:

| Method + path | Effect |
|---|---|
| `POST /purchased/items` (pack opened) | players from `response.itemList` join the Unassigned list |
| `GET /purchased/items` (Unassigned viewed) | Unassigned list replaced with `response.itemData` |
| `PUT /item` with `{ itemData: [{ id, pile }] }` | `pile: "club"`: Unassigned → club. Any other pile: leaves club and Unassigned |
| `DELETE /item/:id` or `/item?itemIds=…` | quick sold: leaves club and Unassigned |

```json
{ "method": "PUT", "path": "/item", "query": "", "request": { "itemData": [{ "id": 945213335495, "pile": "club" }] }, "response": { "itemData": [{ "id": 945213335495, "success": true }] } }
```

Returns `{ "ok": true, "summary": "1 added to club" }`. Items the server has no data for (for example moved back from the transfer list) are picked up by the next club sync.

### `GET /api/extension/version`

```json
{ "version": "0.4.0", "notes": ["Update notices in the web app and on the site"] }
```

### `GET /api/extension.zip`

The extension as a zip, with this server's origin written into it (default server and host permission). Uses `X-Forwarded-Proto` / `X-Forwarded-Host` when behind a proxy.
