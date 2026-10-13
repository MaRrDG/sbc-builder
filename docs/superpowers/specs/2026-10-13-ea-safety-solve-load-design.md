# EA safety + solve load — design

Date: 2026-10-13. Status: approved in chat, sections 1-3. Stage 1 of the production-readiness audit fixes (stage 2 ops, stage 3 GDPR / legal, stage 4 the rest).

## Goal

FC Solver never sends EA more than the user asked for, never more than the daily budget, never during a throttling pause (also across restarts), and a burst of solves cannot take the server down.

Non-goals: stopping a running job half way from the extension (needs a new extension; a half-synced club is worse than a few calls over the estimate), per-IP limits behind Cloudflare (stage 2), any change to game formulas or job recipes.

## Findings (2026-10-13)

1. `web/src/App.tsx:709` reads a started challenge from the web app tab (`POST /api/challenges/:id/read` → one EA GET) as soon as the set is opened. Breaks "only syncs may call EA, never a page load or set open". The manual button already exists (`App.tsx:1503`).
2. Legacy mode: `POST /api/session` still registers new accounts whose SID the server keeps and syncs with (`server/accounts.ts` `registerSession`, `server/sync.ts` `utasOf` paths, the `autoSync` legacy branch). On 2026-10-13 no account on prod or dev holds a SID (extensions 0.9.0 / 1.0.2 only).
3. `registerSession` sets the global `content.guid` from the request before the SID is proven.
4. `server/meter.ts`: the daily cap (`EA_DAILY_LIMIT`, 150) is checked only when a job is handed out; a club job (≈55 pages of 91 + 4 calls) started near the cap overshoots it. `pausedUntil` lives only in memory: a restart or deploy lifts the 15 min throttling pause.
5. `server/solver.ts` `runCpSat` spawns one CP-SAT process per call with 8 workers (host: 8 cores), with no global cap, no queue and no kill timer. Site solves have no per-user lock (objectives have one, `server/index.ts:709`). `solver/requirements.txt` has `ortools` unpinned (local 9.15.6755).

## 1. No EA call from browsing; legacy mode removed

- Delete the auto-read effect in `App.tsx`. A started challenge without a squad shows the existing "read from web app" button plus one line of text saying why (i18n en/ro/it). Only the click sends the request.
- `POST /api/session` answers `410` with `msgCode: 'extTooOld'`; the site / popup text says "update the extension". Remove `registerSession`, the SID-based sync paths in `sync.ts` (`utasOf` and its callers' legacy branches), the legacy branch of `autoSync`, and `Account.utas` handling that only legacy mode used. `Utas` stays for the one-time proof in `/api/hello`.
- `content.guid` is only taken from a request after that request's SID proof succeeded (`/api/hello` path).
- Docs: drop the legacy-mode sentence in `CLAUDE.md`, update `docs/architecture.md`, `docs/api.md` (`/api/session` → 410), `docs/extension.md`.

## 2. The daily budget is a real cap

- Pure `jobCost(job, ctx)` in `server/job-cost.ts`: club = `ceil(lastClubItems / 91) + 1 + 4` (no known club → 60); challenges = number of set ids (max 40); sbc = 2; academy = 1; challengeSquad = 1. Pure `fits(cost, used, limit)`.
- `nextJob` hands out a queued job only when `fits`. A job that does not fit stays queued with a reason; the activity panel shows "Not enough EA requests left today (club ~58, 25 left), resumes after midnight" (job view state `budget`, i18n en/ro/it). Works with every extension version: the decision is on the server.
- Backstop: when `record()` takes the count past the limit, log `ea_error` `{ code: 'overBudget', kind, count }` once per day (`count`: today's requests at that moment) so the estimate can be tuned; `check()` already refuses further jobs.
- `pausedUntil` is stored in the meter cache file (`MeterData.pausedUntil`) and read back on load; `pause()` persists it.
- Unit tests: `jobCost` per kind incl. unknown club, `fits` at the edges, meter pause survives a new `RequestMeter` on the same key.

## 3. Solve load

- `server/solve-gate.ts`: one gate in front of every `runCpSat` call (SBC, points, objectives, Discord `/sbc`): at most 2 CP-SAT processes at once, a FIFO queue of at most 12; beyond that `503` `msgCode: 'solverBusy'`. The gate is released on success, error and timeout.
- `workers: 4` in every problem (`server/solver.ts` both places, `server/objectives/play.ts`), so 2 runs fill the 8 cores.
- Kill timer in `runCpSat`: `SIGKILL` at `timeLimit + 15 s` (deep 30 s → 45 s), then `SessionError` `msgCode: 'solverTimeout'`.
- One SBC solve per user at a time (site and bot share it): a second one gets `409` `msgCode: 'solveRunning'`.
- While queued the Solve button says "Queued…" (the site learns it from a `queued` flag only if cheap; otherwise the existing spinner text stays, decided in the plan).
- Pin `ortools==9.15.6755` in `solver/requirements.txt`.
- Unit tests for the gate (limit, FIFO order, queue full → busy, release on throw). A local run of 5 parallel solves against real cached data.

## Rules kept

Every new user-facing string through `t()` in en/ro/it; server errors carry `msgCode`; `docs/api.md` lists the new codes and the 410; no changelog entry (no visible feature); no extension change (no version bump).

## Testing

`npm run typecheck`, `npm test`, `npm run build`, `npm run i18n:check`; local dev with real `data/`: open a started challenge (no request in the network log until the click), budget refusal by lowering `EA_DAILY_LIMIT`, pause across an API restart, 5 parallel solves.
