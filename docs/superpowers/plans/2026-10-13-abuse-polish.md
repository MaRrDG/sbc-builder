# Points abuse fixes and polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Implement `docs/superpowers/specs/2026-10-13-abuse-polish-design.md`.
**Architecture:** Pure rules in their existing pure modules (`server/referrals.ts`, `server/daily/*.ts`, `server/limits.ts`) with unit tests; DB changes as one additive Drizzle migration per task that needs one (`npm run db:generate`); UI via `t()`.
**Tech Stack:** Fastify 5, Drizzle/Postgres, node:test, React 19.
**Spec:** `docs/superpowers/specs/2026-10-13-abuse-polish-design.md` (binding).

## Global Constraints
- Read `CLAUDE.md` first. Every user-visible string through `t()` in en/ro/it (Romanian plurals `_one/_few/_other`); `npm run i18n:check` passes.
- Server errors shown to users carry `msgCode`; add `err.<code>` keys.
- No EA calls. Never print or commit anything from `data/`.
- Migrations additive only; generate with `npm run db:generate`, apply locally with the project's migrate path (the server runs migrations on start).
- Each task ends green: `npm run typecheck`, `npm test`, `npm run build`, `npm run i18n:check`.
- Commit as `type(scope): subject`, author email `dragutmariotheodor1@gmail.com`, trailer lines:
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01DNPTMMgWMnN1pHcWe77TmR`.
- `docs/api.md` for any endpoint/payload change. No push.

## Review Focus
1. A signed-in user who already lost/won today still sees the answer (only signed-out views hide it).
2. A user who links their first EA account mid-streak gets later milestones normally; a user with no EA account keeps playing and keeping the streak, just without points.
3. Two FC Solver accounts on one EA account: only the first Daily milestone of the day pays.
4. Existing usernames keep working; a user without a name can set one immediately.
5. CSP enforce is off unless `CSP_ENFORCE=1`; prod behaviour unchanged.

### Task 1: Daily — hidden signed-out answer, 1-guess wins
Spec D1. Files: `server/daily/service.ts`, `server/daily/game.ts`, `server/daily/leaderboard.ts`, `server/daily/streak.ts` (or where `daily_streak` points are decided, `server/db/daily.ts`), admin Daily users table (`server/admin/daily.ts`, `web/src/components/admin/*Daily*`), `web/src/daily/*` (render a finished signed-out game without answer + the sign-in note), locales, `server/daily/abuse.test.ts` (flip D1 todos), new pure tests. Changelog item (en/ro/it) in today's entry of `shared/changelog.ts`.

### Task 2: Points — EA account required, gift caps, self-invite, redeem limits
Spec P1, P2, R2. Files: `server/db/schema.ts` (+migration: `point_ledger.persona_id` nullable, partial unique index), `server/db/daily.ts` (grant with persona), `server/referrals.ts` (pure gift checks, generic `codeInvalid`), `server/db/referrals.ts` (gift caps, `grantPendingInvite` self-invite skip), `server/limits.ts` (IPv6 /64 key; per-user redeem limiter 20/day), `server/index.ts` redeem route, locales `err.*`, web code that maps old code errors, `server/abuse.test.ts` (flip P1/P2/R2 todos). Changelog item for gift limits.

### Task 3: Admin signals and reversal
Spec A1, I1. Files: `server/db/events.ts` (types `redeem`, `points`, `daily_win`), new pure `server/ip-hash.ts` (+test), call sites (redeem, point grants/spends, daily win), `server/admin/routes.ts` + `server/admin/users.ts` (points adjust, revoke, flags), `web/src/components/admin/*` (actions with confirm, flags column, "unverified" label on anonymous Daily stats), `.env.example` `IP_HASH_SALT`, `docs/api.md`, flip A1/I1 todos.

### Task 4: Usernames
Spec L1. Files: `server/daily/username.ts` (reserved rule), `server/db/schema.ts` (+migration `users.username_changed_at`), `server/db/dailyProfile.ts` + `server/daily/routes.ts` (cooldown → `usernameCooldown` with date param), web Settings `DailyProfileCard` + Daily `ProfilePrompt` error display, locales, flip L1 todo. Changelog item.

### Task 5: Server polish
Spec 4b: CSP switch (`CSP_ENFORCE`), `minExtension` in `/api/hello` + blocking update notice in the site, zip strips localhost entries when the public origin is not local (`server/extension.ts`), 90-day prune of ownerless inactive EA accounts in the daily ticker (reuse the deletion purge helpers for persona data). Docs: `docs/deploy.md`, `docs/api.md`, `docs/architecture.md`.

### Task 6: Web polish, tests, docs
Spec 4b: landing prices from billing config, `server/squad.test.ts` for rating / chemistry / `isRequirementMet`, `CLAUDE.md` layout line for new files, audit doc statuses (each finding: fixed in stage 4).
