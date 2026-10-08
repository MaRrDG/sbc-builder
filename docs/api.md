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

Returns `{ ok, account, accessKey, linked, linkRejected, clubQueued }` and switches the account to client mode (its stored SID, if any, is deleted). `linked`: the persona id when this call linked it (or it already was this user's), else `null`; `linkRejected`: a token was sent but was not valid, or the persona hit the link limit; `linkLimit: true` (only then): the persona was already linked to 3 other FC Solver accounts (`persona_links`, ever), so this user was not linked and `/api/me` reports `linkBlocked`. The limit is checked before any SID proof; `clubQueued`: this call newly linked the persona (not `already`) and queued a club sync for the web app tab (same limits as any sync: club syncs per day, EA budget; skipped quietly when over them).

### `GET /api/jobs/next` (extension)

The web app tab asks for work: `{ "job": { "id": "9f…", "kind": "club" | "sbc" | "challenges" | "academy", "setIds": [16] } }` or `{ "job": null }` (`academy` needs extension 0.8.9+; older ones are never given it). One job runs at a time; nothing is handed out when today's budget is used or the account is paused. Calling this marks the web app as open (`session: true` for 30 s). `?visible=1|0` (extension 0.8.4+): whether the tab is in front. `?ready=0` (extension 0.8.8+): the tab has no EA session yet (not logged in); it still counts as open but gets no job, so queued jobs wait for the login. A job handed out that makes no EA request within 60 s fails (`errorCode: "notStarted"` in the sync status), as does a queued job whose tab stopped polling; neither starts the club cooldown, which counts from a club job's first EA request. When the web app was closed, or the tab was hidden and is now in front, the SBC list refresh of `POST /api/sync/visit` is queued (same 30 min cooldown); it is handed out on the next poll. That same transition on `/api/jobs/next` also triggers the visit refresh (club + SBC list, same rules as `POST /api/sync/visit`).

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

The EA accounts this user owns (same shape as `account` in `/api/status`). Also `"admin": true|false` (email in `ADMIN_EMAILS`), so the site shows the Admin screen, and `"plan": { "tier": "free"|"premium", "premiumUntil": 1790000000000|null, "quota": { "used": 3, "limit": 20, "resetsAt": 1790605200000|null }|null, "founder": true|false }` (`server/plan.ts`). `quota` is `null` for Premium (no limit); for Free, `resetsAt` is `null` until the first counted solve opens the 7-day window. Admins are always Premium. Also `"prefs": { "lang": "en"|"ro"|"it", "evoEmails": true|false }`, the email language and whether evolution emails are on. Also `"onboarding": { "done": true|false }`: whether the user answered or skipped the onboarding survey (the site asks while it is `false`). Also `"linkBlocked": { "at": 1790000000000, "limit": 3, "supportEmail": "…"|null }|null`: the extension's last link attempt for this user was refused because that EA account already has `limit` FC Solver accounts; the site shows a "contact support" notice (`supportEmail` from the `SUPPORT_EMAIL` env). Cleared by the next successful link. Support lifts it by deleting a row from `persona_links`. Also `"takenOver": true|false`: the user owns no EA account now and one they owned was since proved by another user with EA (`personas.previous_user_id`); the setup screen says so.

### `PUT /api/me/prefs`

`{ "lang"?: "en"|"ro"|"it", "evoEmails"?: boolean }` → `{ "ok": true }`. Only the fields sent are changed; an unknown `lang` or a non-boolean `evoEmails` is ignored.

### `PUT /api/me/onboarding`

The onboarding survey (`server/onboarding.ts`): `{ "heardFrom": "tiktok"|"youtube"|"reddit"|"friends"|"google"|"other", "futYears": "lt1"|"1-3"|"4-7"|"8+" }`, or `{ "skip": true }` → `{ "ok": true }`. Anything else (one answer missing, an unknown value) → `400`. Saved once: after the first answer or skip a later call changes nothing.

Optional `"code"`: an invite, promo or gift code typed on the survey. The answer is saved first and a bad code never blocks it; the response then is `{ "ok": true, "redeem": { "kind", "days", "pending", "founder" } | { "error": "<code>" } }` (no `redeem` when no code was sent or the redeem limit was hit).

### `GET /api/evos` (site, Premium)

```json
{ "fetchedAt": 1790000000000, "evos": [{ "slotId": 2736, "level": 1, "levelCount": 3, "slotName": "Evolution name", "player": { "...": "Player as in /api/club" }, "startedAt": 1789900000000, "endsAt": 1790100000000, "ready": false }] }
```

The tracked timed trainings of the active persona (`X-Persona`), soonest `endsAt` first; times in ms, `player` is `null` when the item is unknown. `ready` is true once the training finished (stored flag or `endsAt` passed). `fetchedAt` is when the last full academy list arrived (`null` if never). Free users get `403` with `code: "premiumOnly"`. Reads the database only, no EA call.

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
  "sync": { "running": "club", "error": null, "errorCode": null, "clubNextAt": null, "club": { "state": "running", "loaded": 400, "expected": 1830 }, "clubAt": 1790064472801, "sbcAt": 1790062053735, "sbcNextAt": 1790063853735, "editedAt": null, "unassigned": 1,
            "ea": { "today": 12, "limit": 150, "pausedUntil": null, "byPath": { "/club": 3 }, "recent": [{ "at": 1790064472801, "method": "POST", "path": "/club", "status": 200 }] } },
  "extension": { "version": "0.4.0", "notes": ["Update notices in the web app and on the site"] }
}
```

`ea` counts today's requests to EA for this account (paths grouped, ids replaced by `:id`); `pausedUntil` is set after EA signalled throttling. `editedAt` changes whenever the cache was edited from web app activity; the UI polls this every 5 s and reloads when it moves. `unassigned` counts pack players not yet sent to the club. `club`: a club sync `queued` or `running` in the web app tab (else `null`), with the players its pages loaded so far and `expected`, the cached club size as a rough total (`null` before the first sync); the site shows a blocking progress modal while it runs and polls every 1.5 s then. `sbcNextAt`: from then on a visit refreshes the SBC list (`sbcAt` + 30 min, `SBC_VISIT_COOLDOWN_MIN`); `null` for legacy accounts.

### `POST /api/sync` (site)

Manual sync, club only: `what: "club"` (players, active squad, chemistry profiles), no daily cap, but not within `CLUB_MANUAL_COOLDOWN_MIN` (15) minutes of the last club load or club sync (`429` `clubCooldown` with `{ minutes }`; `sync.clubNextAt` says when it works again, `null` = now). `"sbc"` is refused with `403`: the SBC list refreshes on the schedule after the daily drop and on visits (`POST /api/sync/visit`). Returns the new `sync` status. Client mode: queues jobs for the web app tab (`sync.running` stays set until they finish) and fails with `409` when no web app tab is open, `429` when over budget or paused. Legacy: syncs from the server, `409`/`401` without a live EA session.

### `POST /api/sync/visit` (site)

Body `{ "sbcs": true }` (optional, default `true`). The site calls it on every screen when the account goes live and when the tab comes back in front. Client mode, web app open: queues a club sync (SBC storage included) when the cached club is older than `CLUB_VISIT_STALE_H` (2) hours and no club sync was queued in the last `CLUB_MANUAL_COOLDOWN_MIN` (15) minutes (no daily cap); with `sbcs`, also queues an `sbc` job when nothing is pending and the SBC list is older than 30 min (`SBC_VISIT_COOLDOWN_MIN`). Never fails for cooldown, closed web app or budget; it just does nothing. Returns the `sync` status.

When an `sbc` job finds set progress higher than cached (an SBC done on a console or in the companion app, not seen by the extension), it also queues a club sync (scheduled, so within the daily club cap).

---

### `GET|POST /api/evos/unsubscribe?u=&t=` (public)
Link in every evolution email (and its `List-Unsubscribe` header, RFC 8058 one-click POST). No sign-in: `t` is an HMAC of the user id `u` (`EMAIL_SECRET`). GET only shows a small confirm page (in the user's language) with a button that POSTs to the same URL, so mail link scanners can't unsubscribe anyone. POST (the button, or the one-click header) sets `users.evo_emails = false` and answers a short plain-text message in the user's language. Invalid: `400 Invalid link.`

### `GET /api/evos/card/:file.png` (public)
The player card shown in an evolution email, rendered when the email is sent (`server/evo-card.ts`) from the item EA sent with the training (`slot.player`, so every evolution and claimed level so far) and EA's card art. No sign-in, since mail clients fetch it without a session: the name is 32 hex chars, an HMAC of persona, slot and level (`EMAIL_SECRET`). `Cache-Control: public, max-age=2592000, immutable`. Files are kept 30 days; unknown or malformed names: `404`.

## Referrals (site)

Invite codes, promo codes, gift codes and points. Nothing here talks to EA. Prices: 7 days = 2 points, 14 days = 3, 30 days = 5. Error `code`s (translated as `err.<code>`): `codeUnknown`, `codeDisabled`, `codeExpired`, `codeFull`, `codeOwn`, `inviteUsed` (this user already used an invite), `codeUsed` (promo or gift already used), `pointsLow`, `pointsLifetime` (lifetime Premium cannot spend points on days), plus `rateLimited` (429).

### `GET /api/referral`

`{ "code": "K7M2QX", "link": "https://…/?ref=K7M2QX", "points": 1, "invited": 1, "pendingInvites": 0, "usedInvite": false, "gifts": [{ "code", "days", "usedAt": ms|null }], "ledger": [{ "delta", "reason", "at" }], "friends": [{ "email": "ma•••@gmail.com"|null, "at": ms, "status": "pending"|"granted", "point": true|false }] }`. `friends`: who joined with the user's invite code, newest first, at most 200; the email is masked on the server (first 2 characters of the local part, or 1 when it has 2 or fewer, then `•••` and the domain; `null` when none is on file). `point`: the invite earned the user a point (a granted invite whose EA account already gave one earned none). The user's own invite code is created on first call (one per account, for life).

### `POST /api/redeem`

`{ "code": "k7m-2qx" }` (typed freely: case and dashes are normalised) → `{ "kind": "invite"|"promo"|"gift", "days": 7, "pending": true|false, "founder": true|false }`. `pending: true` is an invite whose 7 days wait until the user links an EA account (the reward fires on the `/api/hello` link, which also gives the inviter 1 point, at most one per EA account ever). Failure → `400 { "error", "code", "params": {} }`. Limited to 10 per minute per IP (`429 rateLimited`).

### `POST /api/points/spend`

`{ "days": 7|14|30, "gift": false }` → `{ "premiumUntil": ms|null }`, or with `"gift": true` → `{ "giftCode": "ABC234" }` (a code for another user, once). Bad body → `400 { "error": "invalid spend" }`; not enough points → `400 pointsLow`.

## Admin (site)

Signed in with Clerk as a user whose email is in `ADMIN_EMAILS` (comma-separated, default `dragutmariotheodor1@gmail.com`); anyone else gets `403` `adminOnly` (`401` `signIn` when not signed in). The POSTs below are actions; after a successful one the next admin read is fresh (account rows are memoized 5 s otherwise).

All admin reads use only the cache and the DB, never EA. Lists are paged by 25 (`pageSize`); `page` starts at 1 and a page past the end returns the last page (the answer's `page` says which). Invalid query values fall back to the default, never a `400`. Days are calendar days in `SBC_DROP_TZ` (default `Europe/Bucharest`), oldest first.

`<account>`: `{ personaId, personaName, clubName, mode: "client"|"legacy", extVersion, online, clubAt, sbcAt, clubStale, sbcStale, players, unassigned, running, error, ea: { today, limit, pausedUntil }, forced, trusted }`. `*Stale`: fetched before the last SBC drop. `forced`: an admin sync waiting for the next web app visit. `trusted`: its brick layouts win over the vote. In `/api/admin/accounts` each also carries `ownerId` and `ownerEmail` (`null`: no site user owns it, extensions older than 0.8); in a user's detail each adds `linkedAt` and `previousUserId`.

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
  "onboarding": {
    "answered": 5, "skipped": 2,
    "heardFrom": [{ "value": "tiktok", "count": 3 }, "…"], "futYears": [{ "value": "lt1", "count": 0 }, "…"]
  },
  "db": { "sets": 9, "challenges": 12, "brickReports": 0, "trusted": 0 }
}
```

- `premium.total`: effective Premium (admins, and stored Premium whose `premiumUntil` is empty or still ahead), the same rule as `/api/me`. `expiring7d`: stored Premium ending within the next 7 days.
- `accounts.problem`: an error, stale club or SBC data, a throttle pause, or today's EA budget used up. `unlinked`: no site user owns it.
- `series` arrays line up with `days`. `found` / `notFound`: solves by outcome. `eaRequests`: EA calls per day, summed over accounts (one count per account and day even when logged twice); today's value is the live meter. `syncs` / `syncFailed`: syncs run and how many failed.
- `attention`: one item per account at most, the first that applies of `error` (`detail`: the message), `paused`, `atLimit`, `outdated` (`detail`: its extension version, `null` if unknown); then every user whose stored Premium ends within 7 days (`expiring`, `until` in ms). `userId` of an account item is its owner or `null`.
- `onboarding`: survey answers over all users, every answer listed in the order of `PUT /api/me/onboarding` (0 when nobody picked it). `skipped`: users who skipped; users not asked yet count in neither.
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
    "admin": false, "accounts": 1, "online": 0, "solves7d": 12,
    "heardFrom": "reddit", "futYears": "4-7"
  }],
  "total": 2, "page": 1, "pageSize": 25
}
```

`accounts`: EA accounts the user owns; `online`: how many of them have a live session; `solves7d`: solves in the last 7 days. `heardFrom` / `futYears`: onboarding answers, `null` when skipped or not asked yet.

### `GET /api/admin/users/:id`

```json
{
  "user": { "id": "user_2Rf…", "email": "you@example.com", "createdAt": 1790000000000, "lastSeenAt": 1790064400000, "admin": false },
  "planSet": "premium", "plan": { "tier": "premium", "premiumUntil": 1792000000000, "quota": null },
  "accounts": [{ "…": "<account>", "linkedAt": 1790000100000, "previousUserId": null }],
  "missing": [],
  "solves": { "days": ["2026-08-27", "…", "2026-09-25"], "found": [0, …], "notFound": [0, …] },
  "latestExtension": "0.8.6",
  "referral": { "points": 3, "invitedBy": { "id": "user_9Ab…", "email": "friend@example.com" }, "invited": 2, "inviteCode": "K7M2QX" }
}
```

`missing`: persona IDs the user owns that have no cached account on this server. `solves`: the last 30 days. `referral`: points balance, who invited the user (`null` if nobody), how many invitees were granted (`invited`), the user's own invite code (`null` until created). `404` `{ "error": "unknown user", "code": "unknownUser", "params": {} }` for an unknown id.

### `GET /api/admin/users/:id/events?page=`

The user's history, newest first: `{ "rows": [{ "id": 42, "at": 1790064400000, "type": "solve", "personaId": 1005016552645, "data": { "setId": 1, "challengeId": 2, "found": true } }], "total": 1, "page": 1, "pageSize": 25 }`. `type`: `solve` (`data`: `setId`, `challengeId`, `found`), `sync`, `ea_error`, `ea_day`; the latter three are logged per EA account (`personaId` only, no `userId`), and are matched to a user by the accounts they currently own (`personas` table), not by who owned them at the time. Events older than 180 days are deleted. An unknown user gives an empty list.

### `GET /api/admin/accounts?q=&state=&sort=&dir=&page=`

| param | values | default |
|---|---|---|
| `q` | text: persona name, club name or owner email contains it, or persona ID equals it | none |
| `state` | `all`, `online`, `problem`, `outdated`, `unlinked`, `trusted` | `all` |
| `sort` | `name`, `clubAt`, `sbcAt`, `eaToday` (empty dates last either way) | `name` |
| `dir` | `asc`, `desc` | `asc` |
| `page` | 1… | `1` |

`{ "rows": ["<account> + ownerId, ownerEmail"], "total": 1, "page": 1, "pageSize": 25, "latestExtension": "0.8.6" }`

### `GET /api/admin/codes?kind=promo|gift&page=`

Codes, newest first (`kind` defaults to `promo`): `{ "rows": [<code>], "total": 1, "page": 1, "pageSize": 25 }` with `<code>` = `{ code, kind, ownerEmail (gift: the buyer, else null), days (null: Premium for life), maxUses (null: unlimited), uses, expiresAt, disabled, note, createdAt }`.

### `POST /api/admin/codes`

Creates a promo code. Body: `{ "days": 30 | null, "code"?: "SUMMER26", "maxUses"?: 100 | null, "expiresAt"?: ISO string | null, "note"?: "…" }`. `days` must be present (`null` = for life, otherwise 1–3650). `code` is 4–20 characters of `A-Z0-9` (case-insensitive, stored upper-case); omitted = a random 8-character code. Returns the `<code>` row. `400` `{ "error": "…", "code": "invalid" | "codeTaken", "params": {} }`.

### `PATCH /api/admin/codes/:code`

`{ "disabled": true | false }`: disables or re-enables a code (redeeming a disabled code gives `codeDisabled`). `:code` is case-insensitive. Returns `{ "ok": true }`; `400` when `disabled` is not a boolean, `404` for an unknown code.

### `GET /api/admin/codes/:code`

`{ "code": <code>, "uses": [{ "userId", "email", "status", "at" }] }`, newest use first. `:code` is case-insensitive; `404` for an unknown code.

### `POST /api/admin/trust`

`{ "personaId": 1005016552645, "trusted": true }`: trusts (or untrusts) an EA account; its locked-slot (brick) layouts then win over the vote for every user (`server/bricks.ts`), effective at once. The note records which admin did it and when. Returns `{ "ok": true, "personaId": …, "trusted": true }`; `404` for an unknown account. Each `<account>` carries `trusted`. `npm run db:trust` still works from a shell.

### `POST /api/admin/plan`

`{ "userId": "user_2Rf…", "tier": "free" | "premium", "premiumUntil": "2026-12-31T23:59:59.000Z" | null }` (`premiumUntil` is an ISO timestamp, ignored — stored as `null` — when `tier` is `"free"`; a date-only string like `"2026-12-31"` parses as UTC midnight, so the admin UI sends the end of that day in the admin's local time instead). Sets the user's plan; the quota columns (`used`, the window) are left as they are. Returns `{ "ok": true }`; `400` on a bad payload (including a non-string, non-null `premiumUntil`), `404` `{ "error": "unknown user", "code": "unknownUser", "params": {} }` for an unknown user.

### `POST /api/admin/quota-reset`

`{ "userId": "user_2Rf…" }`: gives a Free user their whole week back (clears `quotaStart` and `quotaUsed`). Returns `{ "ok": true }`; `400` when `userId` is missing or not a string, `404` `{ "error": "unknown user", "code": "unknownUser", "params": {} }` for an unknown user.

### `POST /api/admin/sync`

`{ "what": "club" | "sbc" | "all", "personaIds"?: [1005016552645] }` (default `all`, every account). Same limits as everyone: EA budget, throttle pause, the club cooldown (`CLUB_MANUAL_COOLDOWN_MIN`). Per account:

```json
{ "results": [
  { "personaId": 1, "outcome": "queued", "clubSkipped": false },
  { "personaId": 2, "outcome": "deferred" },
  { "personaId": 3, "outcome": "skipped", "code": "budget", "params": { "limit": 150 } }
] }
```

`queued`: the web app tab is open (or a legacy SID is live), the sync started. `deferred`: offline; the next web app visit runs it (kept in memory, lost on a server restart). `skipped`: `code` is an `err.*` message code (`clubCooldown`, `budget`, `paused`, `syncRunning`).

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

`storage`: the SBC storage (from `GET /storagepile`, read by the club sync and whenever the web app opens SBC Storage), same player shape plus `inStorage: true`. In the `/api/solve` pool by default.

### `GET /api/gallery` (site, Premium)

FUT Gallery planner: for every set of the catalogue, the best lineup the account ever held and its score. Auth like `/api/club` (Bearer + `X-Persona`). Free accounts get 403 with `code: "premiumOnly"`. Never calls EA; it reads the item ledger (every club / storage / unassigned item ever seen, sold ones kept) and the cached club lists.

```json
{
  "fetchedAt": 1790064472801,
  "ledgerSize": 5120,
  "sets": [{
    "id": "premier-league-arsenal", "name": "Arsenal", "category": "club", "size": 20,
    "filled": 20, "missing": 0, "base": 92790, "bonus": 17228, "score": 110018,
    "grade": "C", "next": { "grade": "B", "need": 589982 },
    "grades": { "D": 10, "C": 110000, "B": 700000, "A": 1300000, "S": 2500000 }, "rewards": { "C": "Arsenal Kit", "...": "..." },
    "tags": [{ "id": "golden", "count": 20, "pct": 4, "bonus": 3711, "next": null },
             { "id": "firstOwner", "count": 4, "pct": 0, "bonus": 0, "next": { "min": 5, "pct": 150 } }],
    "badge": { "kind": "club", "id": 1 },
    "lineup": [{ "id": 943996158675, "name": "Hazard", "...": "Player fields as in /api/club", "inClub": true, "firstOwner": true, "score": 830 }]
  }]
}
```

`tags`: every bonus tag that counts at least one lineup item. Met ones (`pct` > 0) come first, largest `bonus` first; unmet ones have `pct` 0 and `bonus` 0. `next` is the next tier up (`min` items for `pct`%), `null` at the top tier. `score` = `base` + the sum of tag bonuses. `grade` is `null` while players are missing.

`inClub`: the item is still owned (club, storage or unassigned); otherwise it was owned before. `badge` is what the set's crest shows, taken from its filter: the first club, else the league, else the rarity (`id` = rareflag; a rarity kind such as TOTW or Heroes maps to its lowest rareflag); `null` when nothing fits (the site shows an icon). The answer is cached per account until the ledger or the club cache changes.

### `GET /api/objectives` (site, Premium)

The objectives the web app last loaded (`GET /scmp/objective/categories/all`, relayed by extension 0.9.0+; no EA call), active groups only, done objectives included and flagged: `{ "fetchedAt": 1791000000000 | null, "formation": "f433" | null, "groups": [{ "id": 120, "title": "Squad Foundations: Ringo Meerveld", "category": "Campaigns", "endsAt": 1791565199000 | null, "awards": [...], "objectives": [{ "id": 1798, "name": "The Dutch", "description": "Score 6 goals using a Dutch player in any FUT game mode.", "progress": 3, "target": 6, "awards": [...], "conditions": [{ "role": "score", "min": 1, "filter": { "nation": [34] } }], "done": false }] }] }`. `done` is `true` when EA says `COMPLETED` or `REDEEMED`, or `progress >= target`; the site shows those as done and never sends them to solve. `conditions` is empty when the text has no squad condition we can read. `formation`: the active squad's, if the web app loaded it. Free: `403 premiumOnly`.

### `POST /api/objectives/solve` (site, Premium)

`{ "objectiveIds": [1798, 1797], "formation": "f433", "options": { "excludeIds": [], "maxRating": 99, "includeLoans": false } }` → the in-position squad from the club (no storage; loan players only with `includeLoans: true`, default `false`, since loans run out after a few matches) that tries to cover as many of the picked objectives as possible (an objective is covered when every one of its conditions is met), then the strongest (rating + chemistry) among those; the maximum is proven only when `optimal` is `true` (CP-SAT finished within the 10 s limit). Only open objectives with a squad condition count; done or condition-less ids are ignored, and none left → `400 noObjectives`. `{ "found": true, "partial": false, "optimal": true, "ms": 2100, "formation": "f433", "slots": [{ "position": {...}, "player": {...} | null, "chem": 3 }], "eval": { "rating": 84, "chemistry": 31, ... }, "covers": [{ "objectiveId": 1798, "condition": {...}, "itemIds": [123], "met": true }], "reasons": [] }`. `found` comes from our own re-check (full XI, every player in position, no card twice, every condition met), never from the solver status.

Partial (`found: false`, `partial: true`): a playable XI that covers at least one picked objective but not all; per-objective coverage is read from `covers` (all rows of an `objectiveId` met). Not found (`found: false`, `partial: false`, every `slots[].player` null): no playable XI, or none of the picked objectives covered.

`reasons` (per uncovered objective, with `objectiveId`, when the solver found an XI; without `objectiveId` when it found none):
- `{ "code": "noSlot", "condition": {...}, "formations": ["f433c", "f4312"] }`: this formation has no slot where the condition can be met (e.g. a CAM in 4-3-3); `formations` names up to two that have one, closest first.
- `{ "code": "noMatch", "condition": {...}, "hidden": 2 }`: the slots exist, nobody in the playable pool can meet it there; `hidden` (only when > 0): how many more cards the club (no storage) has that the settings keep out (`excludeIds`, `maxRating`, loans off).
- `{ "code": "noXi", "short": [{ "position": "LWB", "need": 1, "have": 0, "hidden": 1 }] }` (no `objectiveId`): the pool cannot field a full in-position XI in this formation whatever the objectives (the soft solve was INFEASIBLE); `short` lists each slot type with fewer in-position cards than slots (`hidden`: more the settings keep out); empty when every type is covered on its own but the same players would be needed twice.
- `{ "code": "combo" }`: proven (optimal) not to fit together with the other covered picks in this formation (without `objectiveId`: the old whole-problem "these do not fit together").
- `{ "code": "selfClash" }`: proven (optimal, nothing covered) that its own conditions cannot all be met at once in this formation.
- `{ "code": "timeout" }`: not fitted before the time limit; nothing is proven, more may fit (without `objectiveId`: no squad at all within the limit).

Errors: `400 badFormation`, `400 noObjectives`, `409 clubEmpty`, `403 premiumOnly`, `429 busy` (one objectives solve per user at a time: another one sent while it runs is refused). Logged as a `solve` event with `kind: "objectives"` (+ `found`, `partial`, `optimal`, `objectives`); no quota.

### `GET /api/sets` (site)

The cached SBC categories and sets exactly as EA returns them (`setId`, `name`, `challengesCount`, `challengesCompletedCount`, `repeatable`, `timesCompleted`, ...).

How often a set can be done comes from `repeatabilityMode`:

| `repeatabilityMode` | Meaning | Progress fields |
|---|---|---|
| `NON_REPEATABLE` | once | `challengesCompletedCount` / `challengesCount` |
| `UNLIMITED` | any number of times | `timesCompleted` |
| `REFRESH` | `repeats` times per `repeatRefreshInterval` seconds (86400 = daily) | `timesCompletedInInterval`, `lastCompletedTime` (unix s) |

Refresh windows tick from `releaseTime` (the daily drop). A `REFRESH` set whose `lastCompletedTime` is before the current window start has 0 completions in this window. `/api/sbc-submitted` updates these fields in the cache.

A set whose challenge is a points challenge (EA `scoreRequirement` above 0) also carries `pointsTarget`: the points still missing (`scoreRequirement - submittedScore`, never below 0), read from the cached challenges. No EA call.

### `GET /api/sets/:id/challenges?refresh=1` (site)

Challenges of one set, each with its parsed requirements. Always from cache (empty list if the set was never loaded); only `refresh=1` asks EA.

```json
{ "challenges": [{ "challengeId": 35, "name": "Celtic v Rangers", "formation": "f442", "status": "IN_PROGRESS", "elgOperation": "AND",
    "requirements": [{ "slot": 1, "scope": 0, "count": 1, "combined": false, "keys": { "10": [42] }, "text": "Scotland: Min. 1 Player" }] }] }
```

Points challenges also pass through EA's `scoreRequirement` (points to reach) and `submittedScore` (points already submitted), and every challenge carries `fetchedAt` (ms, `null` if never loaded): when its cached copy was read from EA, so the site can show "as of" for `submittedScore`.

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

`deep: true` gives the solver 30 s instead of 10 s. The SBC storage is in the pool by default (storage players cost 0.8× an identical club card, so a duplicate in storage goes before its club copy, and the same player never goes twice); `useStorage: false` solves club only. The answer has `usedStorage: true` when at least one player comes from storage (those carry `inStorage: true`) and `clubOnly: true` when storage was left out. Any option left out uses the default above; `keepPlaced` (default `false`) keeps players already placed in the web app where the requirements allow. A brick challenge without a known layout answers `409`. Each slot in the answer carries `brick` (`null` or `{ custom, nation, league, club }`) and `fixed` (kept from the web app); `missingPlaced` lists placed items no longer in the club.

**Points challenges** (`scoreRequirement` above 0, no formation): the answer has `slots: []` and a `points` object instead of a squad. The pool is the usual one (same options and storage rules) minus cards the challenge's own rules exclude and cards without points.

```json
{
  "found": true, "status": "OPTIMAL", "ms": 310, "cost": 2.4,
  "eval": { "rating": 0, "chemistry": 0, "allMet": true, "results": [{ "text": "Min. 2 Players from ...", "met": true, "actual": 3 }] },
  "slots": [],
  "points": { "target": 120, "required": 300, "submitted": 180, "total": 124, "overshoot": 4, "cards": [{ "…": "…" }] },
  "usedStorage": false, "clubOnly": false, "quota": { "used": 5, "limit": 20, "resetsAt": 1790605200000 }
}
```

`points.target` is what is still missing, `total` the points of `cards`, `overshoot` = `total - target`. When the club's eligible cards hold fewer points than the target the solver does not run and the answer is `found: false` with `reasons: [{ "code": "points", "have": 80, "need": 120, "hidden": 40 }]` (`hidden`: points your solver settings keep out; duplicates of one card, e.g. club + storage copy, count once because the solver takes one card per player). When the eligible points reach the target but the solver finds no selection (infeasible, unknown or timeout: the per-card requirements cannot be combined), the reason is `{ "code": "combo" }` instead, and `eval.results` is `[]` so the requirement rows stay neutral. When nothing is missing the answer is `409` `{ "code": "pointsDone" }`. Quota works as for squads (a found answer counts, the rest costs nothing).

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
| `GET /sbs/hub/v2`, `GET /sbs/sets` | replaces the cached SBC list (`hub/v2` is what the web app loads when points SBCs are on) |
| `GET /sbs/setId/:id/challenges` | replaces that set's cached challenges |
| `POST /club` | players upserted; a complete unfiltered scan (pages from `start: 0` to a short last page) replaces the club. With `jobId` (a club sync job's page): collected per job in any order, nothing upserted, and the club is replaced once page 0 through the short last page are all in |
| `GET /squad/list`, `GET /squad/:id`, `GET /squad/active` | the active squad (other saved squads are ignored) |
| `GET /chemistry/profiles` | replaces the promo chemistry profiles |
| `GET /academy/*` (Evolutions) | timed trainings saved per slot and level; a full unfiltered `/academy/hub/v2` list (first page, short) also replaces the tracked set and stamps `fetchedAt` |
| `GET /storagepile` | replaces the cached SBC storage (players from `itemData`) |
| `POST /sbs/challenge/:id`, `GET/PUT /sbs/challenge/:id/squad` | the challenge's squad: locked slots and players already placed (last 6 kept raw in `challengeSquads/{id}`) |

```json
{ "method": "PUT", "path": "/item", "query": "", "request": { "itemData": [{ "id": 945213335495, "pile": "club" }] }, "response": { "itemData": [{ "id": 945213335495, "success": true }] } }
```

Optional `jobId`: set by extension 0.8.3+ on responses loaded for a sync job.

Returns `{ "ok": true, "summary": "1 added to club" }`. Items the server has no data for (for example moved back from the transfer list) are picked up by the next club sync.

### `GET /api/founders`

Public, cached 30 s. Founding 50: `{ "limit": 50, "taken": 13, "left": 37 }`. The landing shows its hero board and the Premium ribbon while `left > 0`. A spot is given when a user links an EA persona through `POST /api/hello` (a new link, not `already`): lifetime Premium (`plan: "premium"`, `premium_until: null`), unless the user is an admin, already a founder, or that persona already earned a spot for someone. `FOUNDERS_LIMIT` (50) sets the number.

### `GET /api/extension/version`

```json
{ "version": "0.4.0", "notes": ["Update notices in the web app and on the site"] }
```

### `GET /api/extension.zip`

The extension as a zip, with this server's origin written into it (default server and host permission). The origin is the request's `Host` (+ `X-Forwarded-Proto`), and only when it is one of ours (`SITE_ORIGINS` / `SITE_URL`); any other host gets our canonical origin, so a spoofed header can never produce a zip that talks to someone else's server. Sent with `Cache-Control: no-store`, and the site links it with a `?t=` query, so a cache (Cloudflare) never hands out a zip from before an update.
