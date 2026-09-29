# Solve UX + club / SBC sync on visit — design

Date: 2026-09-29. Status: approved in chat, spec for review.

## Goal

Five user asks, one branch:

1. Solving is obvious: a loader in the middle of the pitch, not a small pill at the bottom.
2. After a solve, several players can be kept out at once, with one re-solve.
3. Opening the site with the EA web app live loads the club automatically (full-screen loader already exists), so the club is almost always current.
4. The Requirements caret on the pitch header opens the requirements list (today it does nothing visible).
5. SBC definitions loaded by one account after the daily drop are reused by every other account; each account only asks EA for its own progress.

Out of scope: changing the daily drop time (20:01 Europe/Bucharest is right all year: EA drops at 18:00 UK time and both countries switch DST on the same dates), new EA endpoints, any EA write.

## 1. Solve loader (web)

- `Pitch.tsx`: while `solving`, render a centered overlay inside `.pitch` (semi-transparent scrim over the slots) with an animation of three card silhouettes flipping in sequence and the `pitch.searching` text under it. Keeps `role="status"`. The bottom `.pitch-status` pill goes.
- `prefers-reduced-motion: reduce`: no flip, a slow opacity pulse only.
- Colors from existing tokens; no `--go` (it is not an action).

## 2. Multi-exclude (web)

- New App state `marked: Set<number>` (player ids), cleared when a solve starts, the challenge changes or the set changes.
- `PlayerPanel`: the exclude button toggles the mark ("Mark to keep out" / "Unmark"); it no longer re-solves by itself.
- `Pitch`: a marked card shows a ⊘ badge (icon + `aria-label`, not color alone).
- A bar under the pitch while `marked.size > 0`: primary "Keep out N & re-solve" (`--go`), secondary "Clear". The primary adds all marked ids to the set's excludes (`updateSetExcludes`) and runs one solve; out of solves → only saves the excludes (same as today's single exclude).
- New i18n keys in `en.ts` + `ro.ts` (Romanian plurals `_one` / `_few` / `_other` for N).

## 3. Club sync on visit (server + web)

- `server/sync.ts`: new `CLUB_VISIT_STALE_H` (env, default 2). New pure rule `clubDueOnVisit(fetchedAt, now, staleH, usedToday, limit)` in a pure module with unit tests.
- `refreshOnVisit(acc, { sbcs })` replaces `refreshSbcsOnVisit`: client mode, web app open, meter ok. Club: queue a `club` job when no club job is pending, the cached club is older than `CLUB_VISIT_STALE_H` and `clubSyncsToday < CLUB_SYNCS_PER_DAY`. SBC list: unchanged rule (30 min cooldown), only when `sbcs` is true. Never throws.
- `POST /api/sync/visit` takes an optional body `{ sbcs?: boolean }` (default true, so old clients keep working).
- `App.tsx`: when the account becomes live, and on `visibilitychange` back to the tab, call `syncVisit({ sbcs: view === 'sbcs' })` on every view. `ClubSyncModal` shows on its own because the status says the club job is running.
- Worst case per day: the post-drop sync plus two visit syncs; at the cap nothing more is tried.
- `docs/api.md` (body), `docs/architecture.md` (freshness table) updated.

## 4. Requirements caret (web)

- Root cause: `.pitch-header` has `clip-path` (`styles.css`), which also clips its absolutely positioned child `.req-dropdown`.
- Fix: move the header shape (`background` + `clip-path`) to `.pitch-header::before` (`inset: 0; z-index: -1`) so the dropdown can overflow. Check 390px and desktop.

## 5. Shared SBC challenges (server)

- `server/db/sbcs.ts`: `sharedChallenges(setId, since: Date): Promise<Challenge[] | null>` — the set's challenges whose `last_seen >= since`, ordered like EA sends them (priority, then challengeId); null when none.
- Pure rule (unit tested), e.g. `server/shared-sbc.ts`: `seedChallenges(set, shared)` returns the per-account list or null. Seed only when: the set has `challengesCompletedCount === 0` and `timesCompleted === 0`, `shared.length === set.challengesCount`, and every challenge's `setId` matches. Per-account fields reset: `status: 'NOT_STARTED'`, `timesCompleted: 0`. Everything else is the shared `raw` as EA sent it.
- `server/jobs.ts` `finishJob` (sbc): for a changed set with no cached challenges, try `sharedChallenges(setId, lastSbcDrop())` + `seedChallenges`; on success write the account cache (`challenges/<setId>`) and do not queue it; otherwise queue it as today. A DB error falls back to queueing (logged, never breaks the sync).
- Known limit: a challenge started in the web app but never submitted is `IN_PROGRESS` on EA while its set still shows 0 completed; the seeded copy says `NOT_STARTED`. Opening that set in the web app relays the real data and fixes it. Rare right after a drop; accepted.
- `docs/architecture.md` (shared data + freshness) updated.

## Testing

- `npm test`: `clubDueOnVisit`, `seedChallenges` (seed, progress > 0, count mismatch, wrong setId, field reset).
- `npm run typecheck`, `npm run build`, `npm run i18n:check`.
- Browser (desktop + 390px): loader during solve, reduced motion, marking 2+ players and one re-solve, caret opens the list, club modal on open when the club is older than 2 h.
- Real data: seed a set from Postgres and diff it against the account's own EA copy in `data/accounts/*/challenges/` (only `status` / `timesCompleted` may differ).
