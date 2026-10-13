# Ops hardening — design

Date: 2026-10-13. Status: approved in chat, sections 1-3. Stage 2 of the production-readiness audit fixes (stage 1 EA safety + solve load is done; stage 3 GDPR / legal, stage 4 the rest).

## Goal

Data can be recovered, a bad deploy can be undone in a minute, deploys do not cut users off mid-request, and the owner hears about crashes, 500s, failed backups and downtime without watching logs.

Non-goals: off-server backup copies (owner decision 2026-10-13: on the server only for now; an rclone target can be added later), Sentry or any new data processor, CSP enforcement (stage 4), horizontal scaling.

## Findings (2026-10-13)

1. Real client IP is already handled on the host: `/etc/nginx/conf.d/cloudflare-realip.conf` (`set_real_ip_from` for every Cloudflare range, `real_ip_header CF-Connecting-IP`) and ufw allows 80/443 only from Cloudflare. Fastify `trustProxy: ['loopback', 'uniquelocal']` takes the rightmost address of `X-Forwarded-For`, which nginx sets from `$remote_addr`. Not in the repo, so the audit missed it.
2. No backups of FC Solver (`/root/backups` holds only OpenWebTrack dumps). Prod `data/` is 69 MB including `data/postgres`; 337 GB free.
3. No rollback path: `docker compose up -d --build` replaces `:latest`.
4. No SIGTERM handling; `docker stop` kills open requests, `/api/stream` streams, held `/api/jobs/next` polls and CP-SAT children after 10 s. No `unhandledRejection` / `uncaughtException` handlers. The image runs `node` directly (`CMD ["node", "--import", "tsx", "server/index.ts"]`), so signals reach the process.
5. 500s answer `{ error: 'Something went wrong…' }` without a `code`, so the site cannot translate them.
6. No alerting, no uptime monitor; the compose health check calls `/api/meta` (no DB check).
7. `docker-compose.yml` does not forward `SUPPORT_EMAIL`, `ADMIN_EMAILS`, `FREE_WEEKLY_SOLVES`, `EA_DAILY_LIMIT`, `CLUB_MANUAL_COOLDOWN_MIN`, `DAILY_SECRET`, `DAILY_*` (the server reads them); no log rotation, no memory limits.
8. DB pool `max: 5` (`server/db/index.ts:20`).

## 1. Backups and rollback

- `deploy/backup.sh <app-dir>` (e.g. `/var/www/fc-solver`): reads `APP_NAME` from that dir's `.env`; `docker exec <app>-db pg_dump -U fcsolver -Fc fcsolver` → `/root/backups/<app>/<YYYY-MM-DD>/db.dump`; `tar --zstd` of `data/` excluding `data/postgres` → `data.tar.zst`; files `chmod 600`, dirs `700` (data/ holds extension keys); deletes day dirs older than 14 days; on any failure posts to `ALERT_WEBHOOK_URL` from that `.env` (if set) and exits non-zero. Idempotent per day (re-run overwrites that day).
- Cron on the host (`/etc/cron.d/fc-solver-backup`, documented, installed by hand): 04:30 prod, 04:40 dev.
- Restore steps in `docs/deploy.md`; one real restore of a prod dump into dev's DB is done once to prove the dumps work (owner present, dev only).
- `deploy/release.sh <app-dir>`: tags the running image `<APP_NAME>:prev`, `git pull --ff-only`, `docker compose [--profile discord] up -d --build` (profile when `DISCORD_TOKEN` is set in `.env`), waits for the app container to be `healthy` (max 3 min), prints the result. `deploy/rollback.sh <app-dir>`: retags `:prev` as `:latest` and `docker compose up -d --no-build`. Migrations are never rolled back: `docs/deploy.md` states migrations must be additive (old code must run on the new schema).
- `deploy/cloudflare-realip.conf` (copy of the host file) + the ufw rule set described in `docs/deploy.md`.

## 2. Graceful shutdown, process errors, health

- `SIGTERM` / `SIGINT` → one `shutdown()`: stop accepting (Fastify `close()`), end every live stream and held job poll at once (they reconnect to the new server), kill running CP-SAT children, wait for in-flight requests up to 20 s, close the DB pool, exit 0. A second signal exits at once. Compose `stop_grace_period: 30s`.
- `unhandledRejection` → log + alert, keep running. `uncaughtException` → log + alert (awaited up to 2 s) + exit 1 (Docker restarts it).
- `GET /api/health`: `select 1` with a 2 s timeout → `200 { ok: true }`, else `503 { ok: false }`; no auth, no data, `Cache-Control: no-store`, not in the sitemap; excluded from per-IP limits. Compose health check uses it.
- 500 answers become `{ error: 'Something went wrong on the FC Solver server.', code: 'internal', params: {} }`; `err.internal` in en/ro/it.

## 3. Alerts, compose, DB

- `server/alert.ts`: `alert(kind, detail)` posts to `ALERT_WEBHOOK_URL` (Discord webhook, private admin channel; unset = log only). Message: environment (`SITE_URL` host or `dev`), kind (`500` / `uncaught` / `unhandled` / `backup`), method + route path without query, error name + message (first 200 chars) + top 5 stack lines. Never request bodies, headers, emails, user / persona ids, keys. Pure `alertGate` (testable): same fingerprint (kind + route + first stack line) at most once per 10 min with a "+N more" count on the next send, at most 20 sends per hour overall. Webhook failures are logged, never thrown.
- Uptime: owner creates an UptimeRobot or Better Stack monitor on `https://fc-solver.app/api/health` every 5 min (steps in `docs/deploy.md`); dev optional.
- `docker-compose.yml`: forward the env vars of finding 7 plus `ALERT_WEBHOOK_URL` (all `${VAR:-}` so today's defaults stay); `logging: json-file, max-size 10m, max-file 5` on app, bot, db; `mem_limit` app 2g, db 512m, bot 256m; app health check on `/api/health`; `stop_grace_period: 30s` on app.
- DB: pool `max: 10`. Run `EXPLAIN` on prod (read-only) for the hot queries — events by persona (admin account page), solve count per user over 7 days (`countSolve`), challenges by set, completions per persona — and add indexes only where the plan shows a sequential scan on a growing table, via `npm run db:generate` (additive migration).
- `.env.example` and `docs/deploy.md` updated (backup, restore, release, rollback, uptime, alerts, Cloudflare real-IP).

## Rules kept

No change to EA paths; every user-facing string through `t()` (en/ro/it); `docs/api.md` gets `/api/health` and the `internal` code; no changelog entry (no user-visible feature); no extension change.

## Testing

Unit: `alertGate` (dedupe window, hourly cap, "+N more"), health handler with a failing DB stub if the codebase has a pattern for it, otherwise a manual curl. `npm run typecheck`, `npm test`, `npm run build`, `npm run i18n:check`. Local: `kill -TERM` the API during a held poll and an open stream → clean exit 0 within 20 s. `bash -n` and shellcheck (if installed) on the scripts. On the server (dev first): run `backup.sh` once by hand, list the files and perms, restore check on dev, `release.sh` + `rollback.sh` on dev, then prod.
