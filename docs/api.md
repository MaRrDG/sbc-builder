# HTTP API

Base URL: the server itself (`http://localhost:5178` locally, `https://sbc-builder.mario-theodor.ro` in production). In development Vite on `:5173` proxies `/api` to the API.

All bodies are JSON. Errors look like `{ "error": "message" }` with a meaningful status (`400` bad input, `401` not signed in, unknown account or expired EA session, `403` EA account not yours, `404` not found, `409` nothing cached yet, `429` EA rate limiting).

## Authentication

| Header | Used by | Meaning |
|---|---|---|
| none | `/api/session`, `/api/hello`, `/api/meta`, `/api/extension/version`, `/api/extension.zip` | public or self-authenticating |
| `Authorization: Bearer <Clerk session token>` + `X-Persona: <personaId>` | **(site)** endpoints | the signed-in FC Solver user and which of their EA accounts the call is about (`/api/me*`, `/api/link-token`, `DELETE /api/personas/:id` need only the token) |
| `X-Account-Key: <key>` | **(extension)** endpoints | secret key of one EA account, handed out by `/api/hello` / `/api/session`; it stays inside the extension and never reaches the site |

Site auth errors carry a `code`: `signIn` (401, missing or invalid Clerk token), `noPersona` (400, no `X-Persona`), `personaNotYours` (403), `personaTakenOver` (403, the persona was yours and another user has since proved it with EA).

The EA session id (`X-UT-SID`) is only ever sent **to** the server by the extension; the API never returns it.

**Limits and errors.** Per client IP: 600 `/api` requests a minute, and 5 new EA sessions a minute to prove (`/api/hello` with a `sid` but no known key, `/api/session`; each one calls EA; plus 30 a minute for the whole server). Over it: `429` with code `rateLimited`. Unexpected server errors (`5xx` that are not ours) answer a generic message; the details only go to the server log.

**Headers.** Every answer carries `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, `Permissions-Policy`, and `Strict-Transport-Security` behind HTTPS. HTML pages carry a `Content-Security-Policy-Report-Only` (see `csp()` in `server/index.ts`); browsers post violations to `POST /api/csp-report` (logged as `[csp]`, 20 a minute per IP), so the policy can be enforced once the log stays quiet. CORS answers `chrome-extension://` origins (and `http://localhost` outside production).

---

## Accounts and session

### `POST /api/hello` (extension)

Extension 0.7+. Says who is logged in to the web app, without handing over the session.

```json
{ "personaId": 1005016552645, "contentGuid": "27A3C9F1-…", "extVersion": "0.8.0", "linkToken": "Qm9…" }
```

- With `X-Account-Key` for that same persona: accepted, nothing reaches EA.
- Otherwise `401 { "needSid": true }`; the extension repeats the call with `"sid"` once, the server proves it with one `/usermassinfo` call and does not store it (at most 10 such proofs a minute).

- `linkToken` (optional, 0.8+): a token from `POST /api/link-token` that the signed-in site handed the extension. A valid unused token links this persona to that user (and is used up). If the persona already belongs to another user, the answer is `401 { "needSid": true }` until the request carries a `sid` (the token stays usable for that resend). Unknown, expired or used tokens never fail the call.

Returns `{ ok, account, accessKey, linked, linkRejected }` and switches the account to client mode (its stored SID, if any, is deleted). `linked`: the persona id when this call linked it (or it already was this user's), else `null`; `linkRejected`: a token was sent but was not valid.

### `GET /api/jobs/next` (extension)

The web app tab asks for work: `{ "job": { "id": "9f…", "kind": "club" | "sbc" | "challenges", "setIds": [16] } }` or `{ "job": null }`. One job runs at a time; nothing is handed out when today's budget is used or the account is paused. Calling this marks the web app as open (`session: true` for 30 s). `?visible=1|0` (extension 0.8.4+): whether the tab is in front. When the web app was closed, or the tab was hidden and is now in front, the SBC list refresh of `POST /api/sync/visit` is queued (same 30 min cooldown); it is handed out on the next poll.

### `POST /api/jobs/:id/call` (extension)

One EA request made for a job: `{ "method": "POST", "path": "/club", "status": 200 }`. Counted in `sync.ea`; 429/458/495/512/521 pause the account for 15 min.

### `POST /api/jobs/:id/done` (extension)

`{ "ok": true, "pagesTagged": true }` or `{ "ok": false, "error": "EA asked to slow down (495)." }`. A finished `sbc` job queues a `challenges` job for sets that are new or changed. `pagesTagged` (extension 0.8.3+) says the job's `/club` pages came with its `jobId`: a `club` job then only counts as done once those pages replaced the whole club (waits up to 10 s for the last page), otherwise it fails with an error and the cached club is left as it was. Returns `{ "ok": true, "kind": "club", "status": "done" | "failed", "error": null, "players": 311, "changedSets": 0, "clubQueued": false }` (`players`: club size after a club job; `changedSets`: sets an `sbc` job found changed; `clubQueued`: a club sync was queued because SBCs were done outside the web app). Extension 0.8.5+ shows it as a notice in the web app.

### `POST /api/session` (extension)

Legacy (extension up to 0.6). Called whenever the web app uses a new session id.

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

## Users (site)

Signed in with Clerk; only the `Authorization` header is needed.

### `GET /api/me`

```json
{ "user": { "id": "user_2Rf…", "email": "you@example.com" }, "personas": [{ "personaId": 1005016552645, "personaName": "MaR804", "clubName": "Biliboaca", "session": true }] }
```

The EA accounts this user owns (same shape as `account` in `/api/status`). Also `"admin": true|false` (email in `ADMIN_EMAILS`), so the site shows the Admin screen, and `"plan": { "tier": "free"|"premium", "premiumUntil": 1790000000000|null, "quota": { "used": 3, "limit": 20, "resetsAt": 1790605200000|null }|null }` (`server/plan.ts`). `quota` is `null` for Premium (no limit); for Free, `resetsAt` is `null` until the first counted solve opens the 7-day window. Admins are always Premium.

### `POST /api/me/legacy-keys`

One-time migration of solver settings the browser stored under old access keys: `{ "keys": ["97uq…"] }` → `{ "map": { "97uqAbCd": 1005016552645 } }` (first 8 characters of each key → persona id, only for personas this user owns; links nothing, at most 20 keys).

### `POST /api/link-token`

`{ "token": "Qm9…", "expiresIn": 600 }`. A random single-use token (only its SHA-256 is stored) that the site hands the extension (`site.js`), so the next `/api/hello` links the persona to this user.

### `DELETE /api/personas/:id`

Removes the link to one of the user's own personas: `{ "ok": true }`, or `404` when it is not linked to this user. Anyone who proves the persona can link it again.

### `POST /api/accounts` (removed)

Browsers no longer hold access keys; use `GET /api/me`.

### `GET /api/status` (site)

```json
{
  "account": { "personaId": 1005016552645, "session": true, "extVersion": "0.3.0", "...": "..." },
  "sync": { "running": null, "error": null, "clubAt": 1790064472801, "sbcAt": 1790062053735, "sbcNextAt": 1790063853735, "editedAt": null, "unassigned": 1,
            "ea": { "today": 12, "limit": 150, "pausedUntil": null, "byPath": { "/club": 3 }, "recent": [{ "at": 1790064472801, "method": "POST", "path": "/club", "status": 200 }] } },
  "extension": { "version": "0.4.0", "notes": ["Update notices in the web app and on the site"] }
}
```

`ea` counts today's requests to EA for this account (paths grouped, ids replaced by `:id`); `pausedUntil` is set after EA signalled throttling. `editedAt` changes whenever the cache was edited from web app activity; the UI polls this every 5 s and reloads when it moves. `unassigned` counts pack players not yet sent to the club. `sbcNextAt`: from then on a visit refreshes the SBC list (`sbcAt` + 30 min, `SBC_VISIT_COOLDOWN_MIN`); `null` for legacy accounts.

### `POST /api/sync` (site)

Manual sync, club only: `what: "club"` (players, active squad, chemistry profiles), at most `CLUB_SYNCS_PER_DAY` (3) a day per account including scheduled ones (`429` after that; `sync.clubSyncs` shows `{ used, limit }`). `"sbc"` is refused with `403`: the SBC list refreshes on the schedule after the daily drop and on visits (`POST /api/sync/visit`). Returns the new `sync` status. Client mode: queues jobs for the web app tab (`sync.running` stays set until they finish) and fails with `409` when no web app tab is open, `429` when over budget or paused. Legacy: syncs from the server, `409`/`401` without a live EA session.

### `POST /api/sync/visit` (site)

The site's SBC screens opened (or came back in front). Client mode, web app open, nothing pending and the SBC list older than 30 min (`SBC_VISIT_COOLDOWN_MIN`): queues an `sbc` job. Never fails for cooldown, closed web app or budget; it just does nothing. Returns the `sync` status.

When an `sbc` job finds set progress higher than cached (an SBC done on a console or in the companion app, not seen by the extension), it also queues a club sync (scheduled, so within the daily club cap).

---

## Admin (site)

Signed in with Clerk as a user whose email is in `ADMIN_EMAILS` (comma-separated, default `dragutmariotheodor1@gmail.com`); anyone else gets `403` `adminOnly` (`401` `signIn` when not signed in). The POSTs below are actions; after a successful one the next admin read is fresh (account rows are memoized 5 s otherwise).

All admin reads use only the cache and the DB, never EA. Lists are paged by 25 (`pageSize`); `page` starts at 1 and a page past the end returns the last page (the answer's `page` says which). Invalid query values fall back to the default, never a `400`. Days are calendar days in `SBC_DROP_TZ` (default `Europe/Bucharest`), oldest first.

`<account>`: `{ personaId, personaName, clubName, mode: "client"|"legacy", extVersion, online, clubAt, sbcAt, clubStale, sbcStale, players, unassigned, running, error, ea: { today, limit, pausedUntil }, clubSyncs: { used, limit }, forced, trusted }`. `*Stale`: fetched before the last SBC drop. `forced`: an admin sync waiting for the next web app visit. `trusted`: its brick layouts win over the vote. In `/api/admin/accounts` each also carries `ownerId` and `ownerEmail` (`null`: no site user owns it, extensions older than 0.8); in a user's detail each adds `linkedAt` and `previousUserId`.

`planSet` is the stored plan (`"free"` or `"premium"`, for the admin's select — ignores admin-always-Premium and an expired `premiumUntil`); `plan` is the effective `PlanInfo`, same shape as in `GET /api/me` (`quota: null` for Premium, admins included).

### `GET /api/admin/overview?range=7|30`

Dashboard: KPIs, daily series for the last `range` days (default `7`), what needs attention, extension versions.

```json
{
  "at": 1790064472801, "lastDrop": 1790013660000, "latestExtension": "0.8.6", "range": 7,
  "kpis": {
    "users": { "total": 2, "active24h": 1, "active7d": 2, "new7d": 2 },
    "premium": { "total": 1, "expiring7d": 0 },
    "accounts": { "total": 1, "online": 0, "problem": 1, "unlinked": 0 },
    "solvesToday": 0,
    "ea": { "today": 0, "limit": 150 }
  },
  "series": {
    "days": ["2026-09-19", "…", "2026-09-25"],
    "found": [0, …], "notFound": [0, …], "signups": [0, …], "eaRequests": [0, …], "syncs": [0, …], "syncFailed": [0, …]
  },
  "attention": [
    { "kind": "outdated", "personaId": 1005016552645, "personaName": "MaR804", "userId": "user_2Rf…", "detail": "0.8.0" },
    { "kind": "expiring", "userId": "user_3Ab…", "email": "someone@example.com", "until": 1790500000000 }
  ],
  "versions": [{ "version": "0.8.0", "count": 1, "latest": false }],
  "db": { "sets": 9, "challenges": 12, "brickReports": 0, "trusted": 0 }
}
```

- `premium.total`: effective Premium (admins, and stored Premium whose `premiumUntil` is empty or still ahead), the same rule as `/api/me`. `expiring7d`: stored Premium ending within the next 7 days.
- `accounts.problem`: an error, stale club or SBC data, a throttle pause, or today's EA budget used up. `unlinked`: no site user owns it.
- `series` arrays line up with `days`. `found` / `notFound`: solves by outcome. `eaRequests`: EA calls per day, summed over accounts (one count per account and day even when logged twice); today's value is the live meter. `syncs` / `syncFailed`: syncs run and how many failed.
- `attention`: one item per account at most, the first that applies of `error` (`detail`: the message), `paused`, `atLimit`, `outdated` (`detail`: its extension version, `null` if unknown); then every user whose stored Premium ends within 7 days (`expiring`, `until` in ms). `userId` of an account item is its owner or `null`.
- `versions`: accounts per extension version (`"?"` when unknown), most used first.

### `GET /api/admin/users?q=&plan=&activity=&ea=&sort=&dir=&page=`

| param | values | default |
|---|---|---|
| `q` | text: email contains it (literally, `%` and `_` included), or the user owns an account whose persona or club name contains it or whose persona ID equals it | none |
| `plan` | `all`, `free`, `premium` (effective, as above), `expiring` (stored Premium ending within 7 days) | `all` |
| `activity` | `all`, `24h`, `7d` (seen within), `inactive30` (not seen for 30 days) | `all` |
| `ea` | `all`, `with`, `without` (owns an EA account or not), `problem`, `outdated` (owns such an account) | `all` |
| `sort` | `lastSeen`, `createdAt`, `solves7d`, `email` | `lastSeen` |
| `dir` | `asc`, `desc` | `desc` |
| `page` | 1… | `1` |

```json
{
  "rows": [{
    "id": "user_2Rf…", "email": "you@example.com", "createdAt": 1790000000000, "lastSeenAt": 1790064400000,
    "planSet": "free", "plan": { "tier": "free", "premiumUntil": null, "quota": { "used": 3, "limit": 20, "resetsAt": null } },
    "admin": false, "accounts": 1, "online": 0, "solves7d": 12
  }],
  "total": 2, "page": 1, "pageSize": 25
}
```

`accounts`: EA accounts the user owns; `online`: how many of them have a live session; `solves7d`: solves in the last 7 days.

### `GET /api/admin/users/:id`

```json
{
  "user": { "id": "user_2Rf…", "email": "you@example.com", "createdAt": 1790000000000, "lastSeenAt": 1790064400000, "admin": false },
  "planSet": "premium", "plan": { "tier": "premium", "premiumUntil": 1792000000000, "quota": null },
  "accounts": [{ "…": "<account>", "linkedAt": 1790000100000, "previousUserId": null }],
  "missing": [],
  "solves": { "days": ["2026-08-27", "…", "2026-09-25"], "found": [0, …], "notFound": [0, …] },
  "latestExtension": "0.8.6"
}
```

`missing`: persona IDs the user owns that have no cached account on this server. `solves`: the last 30 days. `404` `{ "error": "unknown user" }` for an unknown id.

### `GET /api/admin/users/:id/events?page=`

The user's history, newest first: `{ "rows": [{ "id": 42, "at": 1790064400000, "type": "solve", "personaId": 1005016552645, "data": { "setId": 1, "challengeId": 2, "found": true } }], "total": 1, "page": 1, "pageSize": 25 }`. `type`: `solve` (`data`: `setId`, `challengeId`, `found`), `sync`, `ea_error`, `ea_day` (the latter three are per account and rarely carry a user). Events older than 180 days are deleted. An unknown user gives an empty list.

### `GET /api/admin/accounts?q=&state=&sort=&dir=&page=`

| param | values | default |
|---|---|---|
| `q` | text: persona name, club name or owner email contains it, or persona ID equals it | none |
| `state` | `all`, `online`, `problem`, `outdated`, `unlinked`, `trusted` | `all` |
| `sort` | `name`, `clubAt`, `sbcAt`, `eaToday` (empty dates last either way) | `name` |
| `dir` | `asc`, `desc` | `asc` |
| `page` | 1… | `1` |

`{ "rows": ["<account> + ownerId, ownerEmail"], "total": 1, "page": 1, "pageSize": 25, "latestExtension": "0.8.6" }`

### `POST /api/admin/trust`

`{ "personaId": 1005016552645, "trusted": true }`: trusts (or untrusts) an EA account; its locked-slot (brick) layouts then win over the vote for every user (`server/bricks.ts`), effective at once. The note records which admin did it and when. Returns `{ "ok": true, "personaId": …, "trusted": true }`; `404` for an unknown account. Each `<account>` carries `trusted`. `npm run db:trust` still works from a shell.

### `POST /api/admin/plan`

`{ "userId": "user_2Rf…", "tier": "free" | "premium", "premiumUntil": "2026-12-31T23:59:59.000Z" | null }` (`premiumUntil` is an ISO timestamp, ignored — stored as `null` — when `tier` is `"free"`; a date-only string like `"2026-12-31"` parses as UTC midnight, so the admin UI sends the end of that day in the admin's local time instead). Sets the user's plan; the quota columns (`used`, the window) are left as they are. Returns `{ "ok": true }`; `400` on a bad payload (including a non-string, non-null `premiumUntil`), `404` for an unknown user.

### `POST /api/admin/quota-reset`

`{ "userId": "user_2Rf…" }`: gives a Free user their whole week back (clears `quotaStart` and `quotaUsed`). Returns `{ "ok": true }`; `400` when `userId` is missing or not a string, `404` for an unknown user.

### `POST /api/admin/sync`

`{ "what": "club" | "sbc" | "all", "personaIds"?: [1005016552645] }` (default `all`, every account). Same limits as everyone: EA budget, throttle pause, `CLUB_SYNCS_PER_DAY`. Per account:

```json
{ "results": [
  { "personaId": 1, "outcome": "queued", "clubSkipped": false },
  { "personaId": 2, "outcome": "deferred" },
  { "personaId": 3, "outcome": "skipped", "code": "budget", "params": { "limit": 150 } }
] }
```

`queued`: the web app tab is open (or a legacy SID is live), the sync started. `deferred`: offline; the next web app visit runs it (kept in memory, lost on a server restart). `skipped`: `code` is an `err.*` message code (`clubLimit`, `budget`, `paused`, `syncRunning`).

---

## Game data

### `GET /api/meta` (public)

Static data for rendering: names of nations / leagues / clubs / rarities, formations with position ids, card rarity art (`guid`, `levels`, text colours) and `contentBase` (EA CDN root for images). Signed in with `X-Persona` it also applies that account's chemistry profiles.

### `GET /api/club` (site)

```json
{
  "fetchedAt": 1790064472801,
  "players": [{ "id": 943996158675, "assetId": 183277, "name": "Hazard", "fullName": "Eden Hazard", "rating": 89, "tier": 3, "rareflag": 72,
                "possiblePositions": ["LM", "CAM", "LW"], "nation": 7, "league": 13, "club": 114605, "untradeable": true,
                "attributes": [91, 84, 85, 93, 37, 69], "skillMoves": 4, "weakFoot": 4, "foot": "Right", "...": "..." }],
  "storage": [{ "id": 945300000001, "name": "Fox", "rating": 85, "inStorage": true, "...": "..." }],
  "storageAt": 1790064473000,
  "squad": { "starters": [945052590995, "…"], "bench": ["…"] }
}
```

`storage`: the SBC storage (from `GET /storagepile`, read by the club sync and whenever the web app opens SBC Storage), same player shape plus `inStorage: true`. Not used by `/api/solve` unless asked.

### `GET /api/sets` (site)

The cached SBC categories and sets exactly as EA returns them (`setId`, `name`, `challengesCount`, `challengesCompletedCount`, `repeatable`, `timesCompleted`, ...).

How often a set can be done comes from `repeatabilityMode`:

| `repeatabilityMode` | Meaning | Progress fields |
|---|---|---|
| `NON_REPEATABLE` | once | `challengesCompletedCount` / `challengesCount` |
| `UNLIMITED` | any number of times | `timesCompleted` |
| `REFRESH` | `repeats` times per `repeatRefreshInterval` seconds (86400 = daily) | `timesCompletedInInterval`, `lastCompletedTime` (unix s) |

Refresh windows tick from `releaseTime` (the daily drop). A `REFRESH` set whose `lastCompletedTime` is before the current window start has 0 completions in this window. `/api/sbc-submitted` updates these fields in the cache.

### `GET /api/sets/:id/challenges?refresh=1` (site)

Challenges of one set, each with its parsed requirements. Always from cache (empty list if the set was never loaded); only `refresh=1` asks EA.

```json
{ "challenges": [{ "challengeId": 35, "name": "Celtic v Rangers", "formation": "f442", "status": "IN_PROGRESS", "elgOperation": "AND",
    "requirements": [{ "slot": 1, "scope": 0, "count": 1, "combined": false, "keys": { "10": [42] }, "text": "Scotland: Min. 1 Player" }] }] }
```

`scope`: `0` min, `1` max, `2` exactly. `keys` maps EA eligibility keys to accepted values (see [solver.md](solver.md)).

Each challenge also has `layout` (`{ bricks: [{ index, custom, nation, league, club }], placed: [{ index, itemId }], capturedAt }`, or `null` until opened in the web app) and `needsLayout` (EA locks slots here but FC Solver has not seen which).

### `POST /api/challenges/:id/read` (site)

Client mode: queues a `challengeSquad` job that reads a challenge you already started (`GET /sbs/challenge/{id}/squad`) through the web app tab. `409` without an open web app tab.

---

## Solving

### `POST /api/solve` (site)

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

`deep: true` gives the solver 30 s instead of 10 s. `useStorage: true` adds the SBC storage to the pool (storage players cost 0.8× an identical club card, so they go first); the answer then has `usedStorage: true` and storage players carry `inStorage: true`. The site solves club-only first and asks before trying with storage, keeping that squad only when its `cost` is lower. Any option left out uses the default above; `keepPlaced` (default `false`) keeps players already placed in the web app where the requirements allow. A brick challenge without a known layout answers `409`. Each slot in the answer carries `brick` (`null` or `{ custom, nation, league, club }`) and `fixed` (kept from the web app); `missingPlaced` lists placed items no longer in the club.

A Free user with `used >= limit` gets `403` before the solver runs:

```json
{ "error": "Weekly solve limit reached.", "code": "quotaExhausted", "params": { "limit": 20, "resetsAt": 1790605200000 } }
```

Found:

```json
{
  "found": true, "status": "OPTIMAL", "ms": 520, "cost": 16.75,
  "eval": { "rating": 62, "chemistry": 15, "allMet": true,
            "results": [{ "text": "Scotland: Min. 1 Player", "met": true, "actual": 1 }] },
  "slots": [{ "position": { "uniqueId": 0, "name": "GK", "typeId": 0 }, "player": { "…": "…" }, "chem": 3 }],
  "quota": { "used": 4, "limit": 20, "resetsAt": 1790605200000 }
}
```

Not possible:

```json
{ "found": false, "reasons": ["France: Min. 2 Players: you have 0 usable. Your solver settings hide 20 more."], "slots": ["… empty …"], "quota": { "used": 3, "limit": 20, "resetsAt": 1790605200000 } }
```

`quota` is the same `Quota` shape as in `GET /api/me`, `null` for Premium. Only a call whose answer is a *found* squad (`eval.allMet`) counts against it; a not-found answer costs nothing. The first counted solve of the week opens the 7-day window (`resetsAt`).

---

## Extension events

### `POST /api/sbc-submitted` (extension)

Sent after the web app successfully submits an SBC.

```json
{ "challengeId": 35, "itemIds": [945052590995, 944099662109] }
```

Removes those items from the cached club, SBC storage and squad, marks the challenge completed and bumps the set progress (`challengesCompletedCount`, and for repeatable sets `timesCompleted`, `timesCompletedInInterval`, `lastCompletedTime`). Returns `{ "ok": true, "removed": 11 }`.

### `POST /api/webapp-event` (extension)

A copy of one web app call, relayed by the extension's page hook. Only these paths are accepted:

| Method + path | Effect |
|---|---|
| `POST /purchased/items` (pack opened) | players from `response.itemList` join the Unassigned list |
| `GET /purchased/items` (Unassigned viewed) | Unassigned list replaced with `response.itemData` |
| `PUT /item` with `{ itemData: [{ id, pile }] }` | `pile: "club"`: Unassigned or SBC storage → club. Any other pile: leaves club, Unassigned and SBC storage |
| `DELETE /item/:id` or `/item?itemIds=…` | quick sold: leaves club, Unassigned and SBC storage |
| `GET /sbs/sets` | replaces the cached SBC list |
| `GET /sbs/setId/:id/challenges` | replaces that set's cached challenges |
| `POST /club` | players upserted; a complete unfiltered scan (pages from `start: 0` to a short last page) replaces the club. With `jobId` (a club sync job's page): collected per job in any order, nothing upserted, and the club is replaced once page 0 through the short last page are all in |
| `GET /squad/list`, `GET /squad/:id`, `GET /squad/active` | the active squad (other saved squads are ignored) |
| `GET /chemistry/profiles` | replaces the promo chemistry profiles |
| `GET /storagepile` | replaces the cached SBC storage (players from `itemData`) |
| `POST /sbs/challenge/:id`, `GET/PUT /sbs/challenge/:id/squad` | the challenge's squad: locked slots and players already placed (last 6 kept raw in `challengeSquads/{id}`) |

```json
{ "method": "PUT", "path": "/item", "query": "", "request": { "itemData": [{ "id": 945213335495, "pile": "club" }] }, "response": { "itemData": [{ "id": 945213335495, "success": true }] } }
```

Optional `jobId`: set by extension 0.8.3+ on responses loaded for a sync job.

Returns `{ "ok": true, "summary": "1 added to club" }`. Items the server has no data for (for example moved back from the transfer list) are picked up by the next club sync.

### `GET /api/extension/version`

```json
{ "version": "0.4.0", "notes": ["Update notices in the web app and on the site"] }
```

### `GET /api/extension.zip`

The extension as a zip, with this server's origin written into it (default server and host permission). The origin is the request's `Host` (+ `X-Forwarded-Proto`), and only when it is one of ours (`SITE_ORIGINS` / `SITE_URL`); any other host gets our canonical origin, so a spoofed header can never produce a zip that talks to someone else's server. Sent with `Cache-Control: no-store`, and the site links it with a `?t=` query, so a cache (Cloudflare) never hands out a zip from before an update.
