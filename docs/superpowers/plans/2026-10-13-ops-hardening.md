# Ops hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Data can be recovered, a bad deploy can be undone in a minute, deploys do not cut users off mid-request, and the owner hears about crashes, 500s, failed backups and downtime.

**Architecture:** A small alert module (pure dedupe gate + Discord webhook post) used by the error handler, process handlers and the backup script. A single `shutdown()` that closes Fastify, ends live streams and held polls, kills solver children and closes the DB. `/api/health` with a DB ping. Host scripts in `deploy/` for backup, release and rollback; compose gains env forwarding, log rotation, memory limits and the new health check.

**Tech Stack:** Node 24 + TypeScript (tsx), Fastify 5, postgres.js + Drizzle, node:test, bash, Docker Compose, nginx.

**Spec:** `docs/superpowers/specs/2026-10-13-ops-hardening-design.md`

## Global Constraints

- No change to any EA path; no extension change; no changelog entry.
- Every user-facing string through `t()`, keys in `web/src/locales/en.ts`, `ro.ts`, `it.ts`; `npm run i18n:check` passes.
- Alerts never contain request bodies, headers, emails, user / persona ids, keys or SIDs.
- Exact values: alert dedupe 10 min per fingerprint, cap 20 sends per hour; shutdown waits up to 20 s for in-flight requests; compose `stop_grace_period: 30s`; health DB ping timeout 2 s; backups at 04:30 (prod) / 04:40 (dev), kept 14 days, files `600`, dirs `700`; release waits up to 3 min for `healthy`; DB pool `max: 10`; log rotation `json-file` 10m × 5; `mem_limit` app 2g, db 512m, bot 256m.
- New endpoint → `docs/api.md`. Migrations additive only.
- Commits `type(scope): subject`, body ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push. Implementers never ssh to the server; server steps are the controller's.
- Verify: `npm run typecheck`, `npm test`, `npm run build`, `npm run i18n:check`.

## Review Focus

1. A shutdown while an SSE stream is open must not hang until Docker's SIGKILL: Fastify `close()` waits for hijacked sockets unless the stream is ended — Task 2 ends every tracked stream first; verified by the local `kill -TERM` check.
2. A failing webhook (timeout, 4xx, DNS) must never throw into the request path or crash the process — Task 1 test `send failure is swallowed`.
3. `uncaughtException` must exit even when the webhook hangs — Task 2 awaits the alert at most 2 s.
4. `backup.sh` must not leave a half-written day dir that looks complete, and must alert on failure — Task 4 writes to a tmp dir and renames at the end; `set -euo pipefail` + trap.
5. `rollback.sh` with no `:prev` image must fail loudly, not start nothing — Task 4 checks the tag exists first.

---

### Task 1: Alert module

**Files:**
- Create: `server/alert.ts`, `server/alert.test.ts`
- Modify: `.env.example` (`ALERT_WEBHOOK_URL=` with a comment)

**Interfaces:**
- Produces: `type AlertKind = '500' | 'uncaught' | 'unhandled' | 'backup'`; `createAlertGate(opts?: { windowMs?: number; hourCap?: number; now?: () => number }): { take(fingerprint: string): { send: boolean; skipped: number } }`; `alertText(input: { env: string; kind: AlertKind; route?: string; err: { name?: string; message?: string; stack?: string } }): string`; `alert(kind: AlertKind, err: unknown, route?: string): Promise<void>` (never throws; no-op without `ALERT_WEBHOOK_URL`).

- [ ] **Step 1: Failing tests** `server/alert.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertText, createAlertGate } from './alert.js';

test('same fingerprint at most once per window, then reports how many were skipped', () => {
  let t = 0;
  const g = createAlertGate({ windowMs: 600_000, hourCap: 20, now: () => t });
  assert.deepEqual(g.take('a'), { send: true, skipped: 0 });
  assert.deepEqual(g.take('a'), { send: false, skipped: 0 });
  assert.deepEqual(g.take('a'), { send: false, skipped: 0 });
  t = 600_001;
  assert.deepEqual(g.take('a'), { send: true, skipped: 2 });
  assert.deepEqual(g.take('b'), { send: true, skipped: 0 });
});

test('at most hourCap sends per rolling hour across fingerprints', () => {
  let t = 0;
  const g = createAlertGate({ windowMs: 1, hourCap: 3, now: () => t });
  assert.equal(g.take('a').send, true);
  assert.equal(g.take('b').send, true);
  assert.equal(g.take('c').send, true);
  assert.equal(g.take('d').send, false);
  t = 3_600_001;
  assert.equal(g.take('e').send, true);
});

test('alertText: route without query, top 5 stack lines, nothing else', () => {
  const stack = ['Error: boom', ...Array.from({ length: 9 }, (_, i) => `    at f${i} (/app/server/x.ts:${i}:1)`)].join('\n');
  const s = alertText({ env: 'fc-solver.app', kind: '500', route: 'POST /api/solve?x=secret', err: { name: 'Error', message: 'boom', stack } });
  assert.match(s, /fc-solver\.app/);
  assert.match(s, /POST \/api\/solve/);
  assert.doesNotMatch(s, /secret/);
  assert.match(s, /at f4/);
  assert.doesNotMatch(s, /at f5/);
});

test('alertText: long messages are cut to 200 chars', () => {
  const s = alertText({ env: 'dev', kind: 'uncaught', err: { name: 'Error', message: 'x'.repeat(500) } });
  assert.ok(!s.includes('x'.repeat(201)));
});
```

And a test that a failed send is swallowed (set `process.env.ALERT_WEBHOOK_URL` to an unroutable URL like `http://127.0.0.1:9/hook` before importing via dynamic import, then `await alert('500', new Error('x'), 'GET /a')` resolves).

- [ ] **Step 2: Run** `node --import tsx --test server/alert.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `server/alert.ts`:**

```ts
// Owner alerts on a private Discord channel (ALERT_WEBHOOK_URL; unset = log only): 500s, crashes,
// failed backups. Never request data: route, error type, message and the top of the stack only.
export type AlertKind = '500' | 'uncaught' | 'unhandled' | 'backup';

const WINDOW_MS = 10 * 60 * 1000;
const HOUR_CAP = 20;

/** Pure: same fingerprint once per window (the next send says how many were skipped), and a cap per hour. */
export function createAlertGate({ windowMs = WINDOW_MS, hourCap = HOUR_CAP, now = Date.now } = {}) {
  const last = new Map<string, { at: number; skipped: number }>();
  let sent: number[] = [];
  return {
    take(fingerprint: string) {
      const t = now();
      sent = sent.filter((x) => t - x < 3_600_000);
      const prev = last.get(fingerprint);
      if (prev && t - prev.at < windowMs) {
        prev.skipped++;
        return { send: false, skipped: 0 };
      }
      if (sent.length >= hourCap) return { send: false, skipped: 0 };
      sent.push(t);
      last.set(fingerprint, { at: t, skipped: 0 });
      return { send: true, skipped: prev?.skipped ?? 0 };
    },
  };
}

export function alertText({ env, kind, route, err }: { env: string; kind: AlertKind; route?: string; err: { name?: string; message?: string; stack?: string } }) {
  const where = route ? ` · ${route.split('?')[0]}` : '';
  const msg = `${err.name ?? 'Error'}: ${(err.message ?? '').slice(0, 200)}`;
  const stack = (err.stack ?? '').split('\n').slice(1, 6).join('\n');
  return `**[${env}] ${kind}**${where}\n${msg}${stack ? `\n\`\`\`\n${stack}\n\`\`\`` : ''}`;
}

const gate = createAlertGate();
const env = () => {
  try {
    return process.env.SITE_URL ? new URL(process.env.SITE_URL).host : 'dev';
  } catch {
    return 'dev';
  }
};

export async function alert(kind: AlertKind, e: unknown, route?: string): Promise<void> {
  const err = e instanceof Error ? e : new Error(String(e));
  const first = (err.stack ?? '').split('\n')[1]?.trim() ?? '';
  const { send, skipped } = gate.take(`${kind}|${route?.split('?')[0] ?? ''}|${first}`);
  const url = process.env.ALERT_WEBHOOK_URL;
  if (!send || !url) return;
  const content = alertText({ env: env(), kind, route, err }) + (skipped ? `\n(+${skipped} more since the last one)` : '');
  try {
    await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: content.slice(0, 1900) }), signal: AbortSignal.timeout(5000) });
  } catch (x) {
    console.error(`[alert] webhook failed: ${(x as Error).message}`);
  }
}
```

- [ ] **Step 4: Run** the test → PASS. `.env.example`: add `# Discord webhook for owner alerts (500s, crashes, failed backups); empty = log only` + `ALERT_WEBHOOK_URL=`.

- [ ] **Step 5: Commit** `feat(server): owner alerts on a Discord webhook`.

### Task 2: Health, 500 code, process errors, graceful shutdown

**Files:**
- Modify: `server/index.ts` (error handler `:100-110`, `onRequest` limiter `:88-98`, new `/api/health`, `listen` area `:883`, the `/api/stream` route, `/api/jobs/next` hold loop)
- Modify: `server/live.ts` (track open streams), `server/jobs.ts` (`wakeAll`), `server/solver.ts` (track children), `server/db/index.ts` (`max: 10`; `closeDb` exists)
- Modify: `web/src/locales/en.ts`, `ro.ts`, `it.ts` (`err.internal`), `docs/api.md`

**Interfaces:**
- Consumes: `alert(kind, err, route?)` from Task 1; `closeDb()` (`server/db/index.ts:25`).
- Produces: `trackStream(end: () => void): () => void` and `endAllStreams(): void` in `live.ts`; `wakeAll(): void` and `shuttingDown` flag getter `isShuttingDown(): boolean` in `jobs.ts`; `killAllSolvers(): void` in `solver.ts`.

- [ ] **Step 1: 500 code + alert.** In `setErrorHandler`, the unexpected-500 branch becomes:

```ts
  if (status >= 500 && !(err instanceof SessionError)) {
    console.error(`[error] ${req.method} ${req.url.split('?')[0]}:`, err);
    void alert('500', err, `${req.method} ${req.routeOptions.url ?? req.url.split('?')[0]}`);
    return reply.code(status).send({ error: 'Something went wrong on the FC Solver server.', code: 'internal', params: {} });
  }
```

Strings: en `'err.internal': 'Something went wrong on the FC Solver server. Try again in a moment.'`, ro `'err.internal': 'Ceva n-a mers pe serverul FC Solver. Încearcă din nou peste câteva momente.'`, it `'err.internal': 'Qualcosa è andato storto sul server di FC Solver. Riprova tra poco.'`.

- [ ] **Step 2: `/api/health`.** Exempt it from the per-IP limiter in `onRequest` (`&& req.url !== '/api/health'`). Route (next to `/api/meta`):

```ts
/** Uptime monitor + compose health check: the API answers and Postgres answers within 2 s. */
app.get('/api/health', async (_req, reply) => {
  reply.header('Cache-Control', 'no-store');
  const ok = await Promise.race([db.execute(sql`select 1`).then(() => true, () => false), new Promise<boolean>((r) => setTimeout(() => r(false), 2000).unref())]);
  return reply.code(ok ? 200 : 503).send({ ok });
});
```

(import `db` from `./db/index.js` and `sql` from `drizzle-orm` if not already imported in `index.ts`; check `robots`/sitemap do not list it — they list pages only.)

- [ ] **Step 3: Track streams, wake polls, kill solvers.**
  - `live.ts`: `const closers = new Set<() => void>(); export function trackStream(end: () => void) { closers.add(end); return () => closers.delete(end); } export function endAllStreams() { for (const end of [...closers]) end(); }`. In the `/api/stream` route, register the function that already ends the stream (the one the 5 min timer calls) with `trackStream`, and call the returned untrack on close.
  - `jobs.ts`: `let shutting = false; export const isShuttingDown = () => shutting; export function wakeAll() { shutting = true; for (const set of waiters.values()) for (const w of set) w(); waiters.clear(); }`. In the `/api/jobs/next` hold loop condition add `&& !isShuttingDown()`.
  - `solver.ts`: `const children = new Set<ChildProcess>();` add each spawned child, delete on `close`; `export function killAllSolvers() { for (const c of children) c.kill('SIGKILL'); }`.
  - `db/index.ts`: `max: 10`.

- [ ] **Step 4: Process handlers + shutdown** (in `index.ts`, right after `app.listen`):

```ts
process.on('unhandledRejection', (e) => {
  console.error('[unhandledRejection]', e);
  void alert('unhandled', e);
});
process.on('uncaughtException', (e) => {
  console.error('[uncaughtException]', e);
  // Docker restarts the container; the alert gets 2 s at most
  void Promise.race([alert('uncaught', e), new Promise((r) => setTimeout(r, 2000))]).finally(() => process.exit(1));
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) process.exit(0); // a second signal: no more waiting
  stopping = true;
  console.log(`[shutdown] ${signal}: closing`);
  const hard = setTimeout(() => process.exit(0), 20_000).unref(); // in-flight requests get 20 s
  endAllStreams(); // live streams and held polls reconnect to the next server
  wakeAll();
  killAllSolvers();
  try {
    await app.close();
    await closeDb();
  } catch (e) {
    console.error(`[shutdown] ${(e as Error).message}`);
  }
  clearTimeout(hard);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
```

Note: `tsx watch` (local `npm run dev:api`) sends SIGTERM on restart; the handler must keep local restarts fast (they are: nothing in flight).

- [ ] **Step 5: Docs.** `docs/api.md`: `GET /api/health` (200 `{ok:true}` / 503 `{ok:false}`, no auth, not rate limited) and `code: 'internal'` on unexpected 500s.

- [ ] **Step 6: Verify.** `npm run typecheck && npm test && npm run i18n:check`. Local shutdown check WITHOUT touching the owner's dev server: start a second API on another port from this worktree with a throwaway data dir — `SBC_DATA_DIR=$(mktemp -d) PORT=5199 node --import tsx server/index.ts &` (it needs `DATABASE_URL` from `.env`; it only reads/writes the throwaway dir and runs no EA call: no accounts exist there). Then `curl -s localhost:5199/api/health` → `{"ok":true}`; open `curl -N localhost:5199/api/stream` in the background (401 is fine — then instead hold `curl localhost:5199/api/health` loops; the point is exit timing); `kill -TERM <pid>` → process exits 0 within a couple of seconds, log shows `[shutdown] SIGTERM`. Report the commands and output. If the server refuses to start without more env, report it rather than inventing values.

- [ ] **Step 7: Commit** `feat(server): health endpoint, graceful shutdown, crash alerts`.

### Task 3: DB indexes

**Files:**
- Modify: `server/db/schema.ts` (`challenges` table, `events` table)
- Create: the migration generated by `npm run db:generate` under `server/db/migrations/`

Prod tables are tiny today (players 1 160 rows, others < 1 100), so `EXPLAIN` says nothing yet; the two indexes follow the query shapes that grow every season / with every account:
- `challenges` filtered by `set_id` (`server/db/sbcs.ts:71`) → `index('challenges_set').on(t.setId)`.
- `events` filtered by `persona_id` (admin account history, `server/db/events.ts:45`, `server/admin/overview.ts:54`) → `index('events_persona_at').on(t.personaId, t.at)`.

- [ ] **Step 1:** Add the two indexes in `schema.ts` (the `challenges` table has no index callback yet: add `(t) => [index('challenges_set').on(t.setId)]` as its third argument, matching how other tables declare theirs).
- [ ] **Step 2:** `npm run db:generate` → one new migration with exactly two `CREATE INDEX` statements; read it, nothing else in it.
- [ ] **Step 3:** `npm run typecheck && npm test`.
- [ ] **Step 4: Commit** `perf(db): indexes for challenges by set and events by persona`.

### Task 4: Compose + host scripts + docs

**Files:**
- Modify: `docker-compose.yml`
- Create: `deploy/backup.sh`, `deploy/release.sh`, `deploy/rollback.sh`, `deploy/cloudflare-realip.conf`, `deploy/fc-solver-backup.cron`
- Modify: `docs/deploy.md`, `.env.example`, `CLAUDE.md` (Docs line: mention `deploy/release.sh`)

**Interfaces:**
- Consumes: `/api/health` (Task 2), `ALERT_WEBHOOK_URL` (Task 1).

- [ ] **Step 1: Compose.** `app.environment` add (each `${VAR:-}`): `SUPPORT_EMAIL`, `ADMIN_EMAILS`, `FREE_WEEKLY_SOLVES`, `EA_DAILY_LIMIT`, `CLUB_MANUAL_COOLDOWN_MIN`, `DAILY_SECRET`, `DAILY_MIN_RATING`, `DAILY_RATING_FLOOR`, `DAILY_MIN_POOL`, `DAILY_HARD_MIN_POOL`, `DAILY_WOMEN_SHARE`, `DAILY_WOMEN_MIN_RATING`, `DAILY_WOMEN_RATING_FLOOR`, `DAILY_WOMEN_MIN_POOL`, `DAILY_WOMEN_HARD_MIN`, `DAILY_ICON_SHARE`, `DAILY_ICON_MIN_RATING`, `DAILY_ICON_HARD_MIN`, `ALERT_WEBHOOK_URL`. CAUTION: an empty string is not "unset" for code that does `Number(process.env.X ?? 150)` → `Number('')` = 0. Before forwarding a var as `${VAR:-}`, check how the server reads it (`grep -rn "process.env.VAR"`); where an empty string would change behaviour, make the reader treat `''` as unset (e.g. `Number(process.env.EA_DAILY_LIMIT || 150)`) in the same commit, and list each such change in the report. Add to `app`: `stop_grace_period: 30s`, `mem_limit: 2g`, health check `fetch('http://127.0.0.1:5178/api/health')` (same node one-liner as today). `db`: `mem_limit: 512m`. `bot`: `mem_limit: 256m`. All three: `logging: { driver: json-file, options: { max-size: "10m", max-file: "5" } }` (use a YAML anchor `x-logging: &logging` at the top).
- [ ] **Step 2: `deploy/backup.sh`** (bash, `set -euo pipefail`):

```bash
#!/usr/bin/env bash
# Nightly backup of one FC Solver install: Postgres dump + data/ (without the raw Postgres files).
# Usage: deploy/backup.sh /var/www/fc-solver   (cron: deploy/fc-solver-backup.cron). Keeps 14 days.
# data/ holds extension keys: everything is root-only (dirs 700, files 600).
set -euo pipefail
DIR=${1:?usage: backup.sh <app dir>}
APP=$(grep -E '^APP_NAME=' "$DIR/.env" | cut -d= -f2- || true); APP=${APP:-sbc-builder}
HOOK=$(grep -E '^ALERT_WEBHOOK_URL=' "$DIR/.env" | cut -d= -f2- || true)
ROOT=/root/backups/$APP
DAY=$(date +%F)
TMP=$ROOT/.tmp-$DAY
fail() {
  local msg="[backup] $APP failed: ${1:-unknown error}"
  echo "$msg" >&2
  [ -n "$HOOK" ] && curl -fsS -m 10 -H 'Content-Type: application/json' -d "{\"content\":\"**[$APP] backup** failed: ${1:-unknown error}\"}" "$HOOK" >/dev/null || true
  rm -rf "$TMP"
  exit 1
}
trap 'fail "line $LINENO"' ERR
umask 077
mkdir -p "$ROOT"
rm -rf "$TMP" && mkdir -p "$TMP"
docker exec "$APP-db" pg_dump -U fcsolver -Fc fcsolver > "$TMP/db.dump"
[ -s "$TMP/db.dump" ] || fail "empty database dump"
tar --zstd -C "$DIR" --exclude=./data/postgres -cf "$TMP/data.tar.zst" ./data
chmod 600 "$TMP"/*
rm -rf "${ROOT:?}/$DAY" && mv "$TMP" "$ROOT/$DAY"
find "$ROOT" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +14 -exec rm -rf {} +
echo "[backup] $APP $DAY ok: $(du -sh "$ROOT/$DAY" | cut -f1)"
```

`deploy/fc-solver-backup.cron`:

```
# /etc/cron.d/fc-solver-backup (copy by hand, see docs/deploy.md)
30 4 * * * root /var/www/fc-solver/deploy/backup.sh /var/www/fc-solver >> /var/log/fc-solver-backup.log 2>&1
40 4 * * * root /var/www/sbc-builder/deploy/backup.sh /var/www/sbc-builder >> /var/log/fc-solver-backup.log 2>&1
```

- [ ] **Step 3: `deploy/release.sh` and `deploy/rollback.sh`:**

```bash
#!/usr/bin/env bash
# Release one install: keep the running image as :prev, pull, rebuild, wait for healthy.
# Usage: deploy/release.sh /var/www/fc-solver     Undo: deploy/rollback.sh /var/www/fc-solver
set -euo pipefail
DIR=${1:?usage: release.sh <app dir>}
cd "$DIR"
APP=$(grep -E '^APP_NAME=' .env | cut -d= -f2- || true); APP=${APP:-sbc-builder}
PROFILE=(); grep -qE '^DISCORD_TOKEN=.+' .env && PROFILE=(--profile discord)
docker image inspect "$APP:latest" >/dev/null 2>&1 && docker tag "$APP:latest" "$APP:prev"
git pull --ff-only
docker compose "${PROFILE[@]}" up -d --build
for _ in $(seq 1 36); do
  state=$(docker inspect -f '{{.State.Health.Status}}' "$APP" 2>/dev/null || echo missing)
  [ "$state" = healthy ] && { echo "[release] $APP healthy at $(git log --oneline -1)"; exit 0; }
  sleep 5
done
echo "[release] $APP not healthy after 3 min (state: $state). Undo: deploy/rollback.sh $DIR" >&2
exit 1
```

```bash
#!/usr/bin/env bash
# Go back to the image that ran before the last release.sh. Code in the folder stays at the new
# commit; the database keeps any new migration (migrations are additive, so the old code runs on it).
set -euo pipefail
DIR=${1:?usage: rollback.sh <app dir>}
cd "$DIR"
APP=$(grep -E '^APP_NAME=' .env | cut -d= -f2- || true); APP=${APP:-sbc-builder}
docker image inspect "$APP:prev" >/dev/null 2>&1 || { echo "[rollback] no $APP:prev image: nothing to go back to" >&2; exit 1; }
PROFILE=(); grep -qE '^DISCORD_TOKEN=.+' .env && PROFILE=(--profile discord)
docker tag "$APP:prev" "$APP:latest"
docker compose "${PROFILE[@]}" up -d --no-build
echo "[rollback] $APP back on the previous image; check: docker inspect -f '{{.State.Health.Status}}' $APP"
```

`chmod +x deploy/*.sh` (git tracks the mode). Run `bash -n` on each, and `shellcheck` if installed.

- [ ] **Step 4: `deploy/cloudflare-realip.conf`** — the controller provides the host file's content in the dispatch (do not ssh); commit it verbatim with a 2-line header comment saying it lives at `/etc/nginx/conf.d/` on the host and that ufw allows 80/443 only from the same ranges.
- [ ] **Step 5: Docs.** `docs/deploy.md`: replace the "Releasing" commands with `deploy/release.sh` (+ rollback); new sections "Backups" (cron file install, where files land, perms, 14 days, restore: `docker exec -i <app>-db pg_restore -U fcsolver -d fcsolver --clean --if-exists < db.dump` with the app stopped, and `tar --zstd -xf data.tar.zst -C <app dir>`), "Alerts" (`ALERT_WEBHOOK_URL`: Discord channel → Integrations → Webhooks), "Uptime" (UptimeRobot / Better Stack HTTP monitor on `https://fc-solver.app/api/health`, 5 min, keyword or status 200), "Real client IP" (the realip file + ufw rule; why Fastify trustProxy then sees the right IP), migrations must be additive. `.env.example`: the forwarded vars with one-line comments. `CLAUDE.md` Docs line: "release with `deploy/release.sh` (rollback `deploy/rollback.sh`)".
- [ ] **Step 6: Verify.** `docker compose config -q` with a scratch `.env` copy is NOT possible without secrets — instead run `docker compose -f docker-compose.yml config --no-interpolate -q` (syntax only) and `npm run typecheck && npm test`. Report.
- [ ] **Step 7: Commit** `feat(deploy): backups, release and rollback scripts, compose limits and env`.

### Task 5: On the server (controller, after merge, with the owner's go-ahead for prod)

- [ ] Dev: `deploy/release.sh /var/www/sbc-builder` → healthy; `curl https://sbc-builder.mario-theodor.ro/api/health`; `deploy/backup.sh /var/www/sbc-builder` → files + perms; `deploy/rollback.sh` once and `release.sh` again.
- [ ] Prod: `deploy/release.sh /var/www/fc-solver`; health; one manual backup; install `/etc/cron.d/fc-solver-backup`.
- [ ] Restore proof: restore the prod dump into a scratch database on dev's Postgres container (`createdb restore_check` + `pg_restore` + row counts, then drop it) — never into dev's live DB without the owner.
- [ ] Owner items: create the Discord webhook (`ALERT_WEBHOOK_URL` in both `.env`), the uptime monitor.
