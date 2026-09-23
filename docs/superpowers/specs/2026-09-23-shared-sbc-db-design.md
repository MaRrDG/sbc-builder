# Shared SBC database (sub-project 1 of 3)

Date: 2026-09-23. Status: approved design, awaiting spec review.

## Context and scope

FC Solver is going public. Three sub-projects, in order:

1. **This spec:** a Postgres database that keeps every SBC set / challenge ever seen and shares locked-slot ("brick") layouts between all accounts.
2. Users via Clerk (Google + email, custom UI through `useSignIn` / `useSignUp`, no Clerk components). Separate spec.
3. 5 EUR monthly subscription. Separate spec; sub-project 2's user schema must allow it.

Problem today: brick challenges (`type` contains `BRICK`) cannot be solved until *this* account has opened the challenge in the EA web app, because the locked slots only come from `GET /sbs/challenge/{id}/squad` / `POST /sbs/challenge/{id}` (`server/layout.ts`). The layout is the same for everyone, but it is stored per account (`data/accounts/<id>/challengeSquads/<challengeId>.json`). Sets and challenges are also per account and overwritten on every sync, so expired SBCs are lost.

Goals:
- Once any account has seen a brick layout, every account can solve that challenge. The layout is never lost.
- Every SBC set and challenge seen is kept forever (latest definition + `first_seen` / `last_seen`).
- No new EA requests. Never start a challenge on EA to learn its layout (`POST /sbs/challenge/{id}` is a write; project rule: never write to EA).

Non-goals: a history screen in the UI, app users / Clerk, subscriptions, moving per-account data (club, squad, meter, per-account SBC progress) into the DB, full version history of changed definitions.

## Stack

- Postgres 18. Local: existing `postgresql` container (port 5432), role + database `fcsolver`. Production: new `db` service in `docker-compose.yml`.
- Drizzle ORM (`drizzle-orm`) over `postgres` (postgres.js); `drizzle-kit` (dev) generates SQL migrations committed to git.
- Schema in `server/db/schema.ts`, connection + migration runner in `server/db/index.ts`, migrations in `server/db/migrations/`. The server applies pending migrations on start.
- `DATABASE_URL` env var, required. The server exits with a clear message when it cannot connect or migrate (compose restarts it).

## Schema

| Table | Columns |
|---|---|
| `sbc_sets` | `set_id` int PK, `name`, `description`, `category_id`, `repeatability_mode`, `end_time` (nullable), `raw` jsonb (full EA object), `first_seen`, `last_seen` timestamptz |
| `challenges` | `challenge_id` int PK, `set_id` → `sbc_sets`, `name`, `type`, `formation`, `elg_operation`, `elg_req` jsonb, `raw` jsonb, `first_seen`, `last_seen` |
| `brick_reports` | `id` serial PK, `challenge_id` → `challenges`, `persona_id` bigint, `layout` jsonb (`BrickSlot[]` only, never the reporter's placed players), `layout_hash` text, `captured_at` timestamptz; unique (`challenge_id`, `persona_id`, `layout_hash`) |
| `trusted_accounts` | `persona_id` bigint PK, `note` text, `added_at` |

Per-account fields such as `timesCompleted`, `status`, `challengesCompletedCount` stay in `raw` as last seen but are never read from the DB; each account's progress keeps coming from its own JSON cache.

Upsert rule for sets/challenges: insert with `first_seen = last_seen = now()`; on conflict overwrite the definition columns and `raw`, bump `last_seen`, keep `first_seen`. Rows are never deleted. If a challenge arrives before its set (FK), upsert a minimal set row first.

`layout_hash`: SHA-256 of the canonical JSON of the bricks sorted by `index` with fixed key order.

## Choosing the shared layout

For a challenge, among its `brick_reports`:
1. If any report comes from a `trusted_accounts` persona, the newest trusted report wins.
2. Otherwise the `layout_hash` reported by the most distinct personas wins; ties go to the earliest `captured_at`.

The result is cached in memory per challenge; the entry is dropped when a report for that challenge is inserted and expires after 10 minutes (`db:trust` runs in a separate process and cannot clear the server's cache).

## Consistency checks (before inserting a report)

A report is rejected (logged, not stored) when:
- the challenge is unknown in the DB, or its `type` has no `BRICK`;
- there are no bricks, or more than 10 (at least one slot must stay free);
- a brick `index` is outside 0..10 or repeats;
- a nation / league / club / rareflag is not a non-negative integer, or `positions` is neither null nor a list of strings.

Only structural checks: no real brick capture exists yet to confirm how custom bricks relate to the challenge type or its requirements, so rules about that would risk rejecting real layouts. Forged-but-plausible layouts are handled by the majority vote and trusted accounts.

## Data flow

Writes (no new EA traffic, all on existing hooks):
- Sets: `server/events.ts:117` (web app relay) and `server/sync.ts:161` (sync) also upsert `sbc_sets`.
- Challenges: `server/events.ts:125`, `server/sync.ts:159`, `server/sync.ts:175` also upsert `challenges`.
- Bricks: `server/events.ts:142` (challenge squad capture) runs `parseLayout`; if it has bricks, run the checks and insert a `brick_report` (`ON CONFLICT DO NOTHING`).
- JSON caches stay as they are.
- DB write failures during sync/relay are logged and do not fail the sync; the next relay writes again.

Reads:
- `challengeLayout()` (`server/layout.ts:78`) stays the single entry point. `bricks` come from the shared layout in the DB, falling back to the account's own capture; `placed` still comes from the account's own capture (and later PUT).
- `needsLayout` (`server/index.ts:232`) and the "open it once" error (`server/index.ts:267`) therefore clear for everyone after the first accepted report, with no changes there.

## Scripts

- `npm run db:generate`: drizzle-kit migration from `schema.ts`.
- `npm run db:import`: one-off backfill from `data/accounts/*/` (`sets.json`, `challenges/*.json`, `challengeSquads/*.json`), through the same upsert and check code. Idempotent.
- `npm run db:trust <personaId> [note]` / `npm run db:trust -- --remove <personaId>`.

## Deploy

- `docker-compose.yml`: service `db` (`postgres:18-alpine`, volume `./data/postgres`, healthcheck `pg_isready`, no host port, `POSTGRES_USER/DB=fcsolver`, `POSTGRES_PASSWORD=${DB_PASSWORD}`). `app` gets `DATABASE_URL=postgres://fcsolver:${DB_PASSWORD}@db:5432/fcsolver` and `depends_on: db: condition: service_healthy`.
- `DB_PASSWORD` in the server's `.env` (git-ignored). `.env.example` without secrets.
- Migrations ship inside the image (`server/` is already copied).

## Docs

- `docs/architecture.md`: the DB, what is shared vs per account, layout choice.
- `docs/deploy.md`: `db` service, `DB_PASSWORD`, backup with `pg_dump`, first-run `db:import`.
- `CLAUDE.md`: `server/db/` in Layout, `DATABASE_URL` in Commands.
- `docs/api.md`: no change (no endpoint or payload changes).

## Verification

The pure brick logic (hash, checks, layout choice) gets `node:test` unit tests (`npm test`); the rest is verified by hand:
1. `npm test`, `npm run typecheck`, `npm run build`, `npm run i18n:check`.
2. Migrations apply on local `fcsolver`; `db:import` fills tables from `data/`; row counts and imported bricks checked with `psql`.
3. Shared layout: remove one account's own `challengeSquads/<id>.json` for a brick challenge that has a report → `/api/sets` shows no `needsLayout`, solve uses the shared bricks, `found` still comes from the `squad.ts` re-check.
4. A forged report (index 12, repeated index, negative club) is rejected.
5. `docker compose config` valid; the `app` container starts against `db` and applies migrations.
