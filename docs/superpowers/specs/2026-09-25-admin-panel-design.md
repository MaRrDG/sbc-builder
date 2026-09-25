# Admin panel redesign

Date: 2026-09-25. Status: approved in chat, awaiting spec review.

## Goal

Replace the current admin screen (one long list of user cards, everything from one `GET /api/admin/stats` payload) with a real admin panel: a dashboard with KPIs and charts, a paginated/filterable/sortable users table, a user detail page, and an EA accounts table. Server-side pagination and filtering; screen state in the URL.

Out of scope: new destructive actions (unlink persona, delete user), revenue, admin audit log.

## Routes (web)

All under `/dashboard/admin`, admins only (existing gate). State lives in the URL (`route.ts`, `navigate`).

| Path | Screen |
|---|---|
| `/dashboard/admin` | Overview (dashboard) |
| `/dashboard/admin/users?q&plan&activity&ea&sort&dir&page` | Users table |
| `/dashboard/admin/users/:id` | User detail |
| `/dashboard/admin/accounts?q&state&sort&dir&page` | EA accounts table |

Sub-tabs Overview · Users · EA accounts in the admin section header; under 860px they scroll horizontally.

## Overview

- **KPI row**, each card links to the pre-filtered table: users total; active 24h / 7d; new 7d; Premium (of which expiring in 7d); EA accounts online / total; accounts failing or stale; solves today; EA requests today (vs sum of limits).
- **Charts**, range tab 7 / 30 days, days in `Europe/Bucharest` (`SBC_DROP_TZ`):
  - solves per day, stacked found / not found (`events`)
  - signups per day (`users.created_at`, full history)
  - EA requests per day and syncs per day (`events`)
- **Needs attention** list: accounts with error, paused, at EA limit, outdated extension; Premium expiring within 7 days. Each row links to the user or account.
- **Extension versions**: version → account count, latest marked.

Charts are hand-written SVG (`Chart.tsx`: bar + stacked bar), no chart library, no CSP change. Colors from existing tokens; values readable without color (labels / tooltips / `aria-label` + a visually hidden table).

## Users table

Columns: email · plan (badge + premium end date) · quota (`3/20`, `—` for Premium) · EA accounts (count + online dot with text) · solves 7d · last seen · signed up.

Sort (header click, `aria-sort`): `lastSeen` (default, desc), `createdAt`, `solves7d`, `email`.

Filters:
- `q`: case-insensitive substring over email, persona name, club name, exact personaId
- `plan`: `all` | `free` | `premium` | `expiring` (Premium ending in ≤ 7 days)
- `activity`: `all` | `24h` | `7d` | `inactive30` (last seen > 30 days ago)
- `ea`: `all` | `with` | `without` | `problem` (error or stale club/SBC) | `outdated` (extension older than latest)

Page size 25. Filters that need account state (`problem`, `outdated`, persona/club name in `q`) are resolved from the in-memory account list into a personaId set, then applied in SQL (`personas.persona_id IN (...)`). Row click opens user detail.

Under 860px rows become compact stacked rows (email, plan badge, last seen; rest hidden).

## User detail

- **Header**: email, Clerk id (copy button), signed up, last seen, plan badge, back link that keeps the table's query string.
- **Plan & quota**: tier select, premium-until date, save (existing `POST /api/admin/plan`, same end-of-local-day rule); used / limit, window reset time, "Reset quota" (existing `POST /api/admin/quota-reset`).
- **EA accounts**: one card per persona with the existing `<account>` fields (name, club, mode, extension version + outdated, online, players, club/SBC fetched at + stale, EA today / limit, paused, error, forced, trusted) plus `linkedAt` and `previousUserId`. Actions: sync club / SBC / all (`POST /api/admin/sync`), trust / untrust (`POST /api/admin/trust`).
- **Activity**: solves per day (30 days, same chart), then the user's events newest first, 25 per page.

## EA accounts table

All accounts from `listAccounts()`, including unlinked ones. Columns: persona · club · owner email (or "unlinked") · mode · extension · online · club at · SBC at · EA today/limit · trusted.
Filters: `q` (persona, club, personaId, owner email), `state`: `all` | `online` | `problem` | `outdated` | `unlinked` | `trusted`. Sort: `clubAt`, `sbcAt`, `eaToday`, `name`. Filtered, sorted and paged in memory (accounts are file-cached, count is small). Row click → owner's user detail; unlinked rows expand inline with the actions.

## History: `events` table

```
events(id serial pk, at timestamptz not null default now(), type text not null,
       user_id text null, persona_id bigint null, data jsonb not null default '{}')
index (type, at), index (user_id, at)
```

Types and where they are written:

| type | written in | data |
|---|---|---|
| `solve` | `/api/solve` after a solve | `{ setId, challengeId, found }` |
| `sync` | sync completion in `sync.ts` (club / sbc, client and legacy) | `{ what, ok }` |
| `ea_error` | `meter.ts` `pause()` (EA throttling) | `{ code }` |
| `ea_day` | `meter.ts` on day rollover, one per account | `{ day, count }` |

Failed syncs are `sync` rows with `ok: false` and `error`.

Signups come from `users.created_at`, not events. `logEvent()` in `server/db/events.ts` is fire-and-forget: it never throws into the caller, errors are logged once. Rows older than 180 days are deleted by a daily cleanup (at server start + every 24 h). Charts start empty and fill from deploy day on; EA requests for "today" come from the live meter, past days from `ea_day`.

## API

New (all `requireAdmin`, read only DB + cache, never EA):

- `GET /api/admin/overview?range=7|30` → `{ at, kpis, series: { days[], solves[{found,notFound}], signups[], eaRequests[], syncs[] }, attention[], versions[], latestExtension }`
- `GET /api/admin/users?q&plan&activity&ea&sort&dir&page` → `{ rows[], total, page, pageSize }`
- `GET /api/admin/users/:id` → `{ user, plan, planSet, accounts[<account> + linkedAt, previousUserId], solvesByDay[] }`; `404` unknown
- `GET /api/admin/users/:id/events?page` → `{ rows[], total, page, pageSize }`
- `GET /api/admin/accounts?q&state&sort&dir&page` → `{ rows[], total, page, pageSize }`

Invalid query values fall back to defaults (no 400). Existing `POST` actions unchanged. `GET /api/admin/stats` is removed. `docs/api.md` updated.

## Server layout

- `server/admin/` replaces `server/admin.ts`: `auth.ts` (`isAdmin`, `requireAdmin`), `accounts.ts` (account row builder, list + filter), `users.ts` (list SQL, detail), `overview.ts`, `routes.ts` (Fastify registration, called from `index.ts`).
- `server/admin/query.ts`: pure parsing of query params to a typed filter, sort, page; pure day bucketing (`dayKey(ts, tz)`, `fillDays(range, rows)`); pure account filter/sort. Unit tested.
- `server/db/events.ts`: `logEvent`, range queries, cleanup. Migration via `npm run db:generate`.

## Web layout

`web/src/components/admin/`: `AdminLayout.tsx` (sub-tabs), `Overview.tsx`, `UsersTable.tsx`, `UserDetail.tsx`, `AccountsTable.tsx`, `AccountCard.tsx`, `DataTable.tsx` (sortable headers, pagination, empty + skeleton loading states), `Chart.tsx`, `KpiCard.tsx`. `AdminView.tsx` removed. Typed helpers in `api.ts`. Filter inputs debounce `q` (300 ms) and write to the URL with replace; page resets to 1 on filter change. All strings through `t()` (en + ro, plurals), `npm run i18n:check`. EA-provided names shown as sent.

Visual: EA web app look per `DESIGN.md` — dark teal surfaces, 14px containers, 8px controls, `--go` only for primary action / selected tab, state never by color alone, `prefers-reduced-motion`, WCAG AA. Check at 390px.

## Testing

- `npm test`: query parsing + defaults, account filter/sort/paging, day bucketing across the Bucharest DST change, `expiring` / `inactive30` boundaries.
- `npm run typecheck`, `npm run build`, `npm run i18n:check`.
- Browser against real local data: each screen, filters in URL + Back, pagination, detail actions (plan save, quota reset, trust, sync), 390px width.
