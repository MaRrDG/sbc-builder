# Analytics Events Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Typed, cookieless OpenWebTrack custom events for the landing → solve funnel and the Daily game, admins excluded, policies and docs updated.

**Architecture:** `web/src/track.ts` wraps `window.owt.trackEvent` with a typed event map and pure prop cleaning; call sites in the existing components fire one line each. The server keeps injecting `ANALYTICS_SNIPPET`, now skips admin pages and warns about a cookie-setting / non-deferred snippet.

**Tech Stack:** React 19, Fastify 5, node:test.

**Spec:** `docs/superpowers/specs/2026-10-12-analytics-events-design.md`

## Global Constraints

- Event names and props exactly as in the spec tables; values are fixed enums or small numbers, never personal data.
- `track()` never throws and is a no-op without `window.owt` or with `window._trk_disabled`.
- Policy text en / ro / it; `npm run i18n:check`; `UPDATED` bumped.
- `localStorage` key `sbc-no-track`, try/catch around storage.

## Review Focus

- Reloading a finished or half-played Daily must not send `daily_start` / `daily_end` again.
- A solve that errors (quota, network) sends no `solve` event.
- An admin's first full page load after sign-in elsewhere: flag stored → later loads not counted; `/dashboard/admin` never gets the snippet.
- A props object with >10 keys or long strings is trimmed, not rejected by the tracker.
- No snippet (local dev): every call site is a silent no-op.

---

### Task 1: `track.ts` + server snippet rules
**Files:** create `web/src/track.ts`, `web/src/track.test.ts`; modify `server/seo.ts` (+ test), `server/index.ts` (startup warning, skip admin paths), `web/src/main.tsx` (no-track flag).
- [ ] tests: `cleanProps` keeps ≤10 keys, drops undefined, stringifies, trims to 255; `streakBucket(0|3|7|14|30)`; `analyticsWarnings` for `/script.js`, missing `defer`, missing `data-website-id` / `data-domain`, clean snippet → `[]`; `withAnalytics` skipped for `/dashboard/admin`.
- [ ] implement, `npm test`, typecheck, commit `feat(analytics): typed event helper and snippet checks`.

### Task 2: funnel events
**Files:** `web/src/landing/*` (`cta_click`, `premium_view`, `discord_click`), `web/src/components/SignIn.tsx` + `Root.tsx` SSO callback (`signin_done`), `web/src/App.tsx` (`extension_linked`, `sync_done`, `sbc_open`, `solve`, admin → `disableTracking()`, sidebar `discord_click`), `InvitePage.tsx` (`invite_copy`).
- [ ] wire, typecheck, browser check with a stub `window.owt`, commit `feat(analytics): funnel events`.

### Task 3: Daily events
**Files:** `web/src/daily/Daily.tsx` (`daily_start`, `daily_end`), `EndPanel.tsx` (`daily_share`), `Leaderboard` (`daily_leaderboard`), reminder button (`reminder_on`), Daily Premium link (`premium_view`).
- [ ] wire, typecheck, browser check, commit `feat(analytics): daily events`.

### Task 4: policies and docs
**Files:** `web/src/legal/docs.ts` (en / ro / it statistics text, `UPDATED`), `docs/analytics.md` (new), `docs/deploy.md`, `CLAUDE.md`, `task.csv` state.
- [ ] write, i18n check, build, commit `docs(analytics): events, setup and policy text`.
