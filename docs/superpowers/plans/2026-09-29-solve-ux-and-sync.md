# Solve UX + club / SBC sync on visit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Obvious solve loader, multi-player exclude, working Requirements caret, club auto-sync on visit (older than 2 h), and SBC challenges reused across accounts.

**Architecture:** Two pure server rules (`server/visit-rules.ts`, `server/shared-sbc.ts`) with node:test tests, wired into `server/sync.ts` (visit) and `server/jobs.ts` (`finishJob`). Web changes stay in `Pitch.tsx`, `PlayerPanel.tsx`, `App.tsx`, `styles.css`, locales.

**Tech Stack:** Fastify 5 + TS (`tsx`), Drizzle/Postgres, React 19 + Vite, plain CSS (OKLCH tokens), Phosphor icons, node:test.

**Spec:** `docs/superpowers/specs/2026-09-29-solve-ux-and-sync-design.md`

## Global Constraints

- Read-only toward EA: no new EA endpoint, no job recipe that writes to EA.
- Club syncs stay capped at `CLUB_SYNCS_PER_DAY` (3) per account per day, visit syncs included.
- `CLUB_VISIT_STALE_H` env, default `2`.
- Daily drop stays 20:01 Europe/Bucharest (`lastSbcDrop()`); do not switch to UTC.
- Every site string through `t()`; keys in `web/src/locales/en.ts` + `ro.ts`; Romanian plurals `_one` / `_few` / `_other`; `npm run i18n:check` passes.
- `--go` green only for the primary action; requirement / mark state never by color alone.
- Respect `prefers-reduced-motion` (global rule at `web/src/styles.css:2838` already caps animations).
- Check 390px phone width for every UI change.
- `docs/api.md` updated for the `/api/sync/visit` body; `docs/architecture.md` for freshness + shared data.
- Commits: `type(scope): subject`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

- A club job already queued / running when a visit fires → no second club job, no extra count (Task 2 relies on `requestSync`'s `hasPending`; test the pure rule for the cap).
- Shared challenges exist but only some were seen after the drop (count ≠ `challengesCount`) → fall back to EA, never a partial set (Task 3 test).
- Account with progress on the set (completed > 0 or `timesCompleted` > 0) → never seeded (Task 3 test).
- Postgres down / `db` not initialized → `finishJob` still queues challenges as before (Task 4 try/catch, manual check).
- Marked players when the challenge changes or a new solve starts → marks cleared, no stale ⊘ badges (Task 7 manual check).

---

### Task 1: Pure rule `clubDueOnVisit`

**Files:**
- Create: `server/visit-rules.ts`
- Test: `server/visit-rules.test.ts`

**Interfaces:**
- Produces: `clubDueOnVisit(fetchedAt: number | null, now: number, staleMs: number, usedToday: number, limit: number): boolean`

- [ ] **Step 1: Write the failing test** — `server/visit-rules.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clubDueOnVisit } from './visit-rules.js';

const H = 60 * 60 * 1000;

test('clubDueOnVisit', () => {
  const now = 100 * H;
  assert.equal(clubDueOnVisit(null, now, 2 * H, 0, 3), true); // never synced
  assert.equal(clubDueOnVisit(now - 3 * H, now, 2 * H, 1, 3), true); // stale
  assert.equal(clubDueOnVisit(now - 2 * H, now, 2 * H, 1, 3), true); // exactly at the threshold
  assert.equal(clubDueOnVisit(now - 1 * H, now, 2 * H, 0, 3), false); // fresh
  assert.equal(clubDueOnVisit(now - 5 * H, now, 2 * H, 3, 3), false); // cap reached
  assert.equal(clubDueOnVisit(null, now, 2 * H, 3, 3), false); // cap wins over missing club
});
```

- [ ] **Step 2: Run to verify it fails** — `node --import tsx --test server/visit-rules.test.ts` → FAIL (cannot find module `./visit-rules.js`).

- [ ] **Step 3: Implement** — `server/visit-rules.ts`

```ts
// Pure rules for what a visit (site opened, web app back in front) may refresh.

/** A visit syncs the club when it is older than `staleMs` and today's club cap is not used up. */
export function clubDueOnVisit(fetchedAt: number | null, now: number, staleMs: number, usedToday: number, limit: number): boolean {
  if (usedToday >= limit) return false;
  return fetchedAt === null || now - fetchedAt >= staleMs;
}
```

- [ ] **Step 4: Run to verify it passes** — same command → PASS.

- [ ] **Step 5: Commit** — `git add server/visit-rules.ts server/visit-rules.test.ts && git commit -m "feat(sync): club-due-on-visit rule"`

---

### Task 2: Club sync on visit (server + site)

**Files:**
- Modify: `server/sync.ts:293-307` (replace `refreshSbcsOnVisit`), import from `./visit-rules.js`
- Modify: `server/index.ts:14` (import), `server/index.ts:221-225` (`/api/sync/visit`), `server/index.ts:288` (jobs/next return)
- Modify: `web/src/api.ts:234` (`syncVisit`)
- Modify: `web/src/App.tsx:307-319` (visit effect)
- Modify: `docs/api.md:117-121`, `docs/architecture.md:90` (freshness table, club row)

**Interfaces:**
- Consumes: `clubDueOnVisit` (Task 1); existing `requestSync(acc, 'club', true)` (counts the sync, skips when a club job is pending), `clubSyncsToday`, `CLUB_SYNCS_PER_DAY`, `sbcNextAt`, `hasPending`, `webAppOpen`, `enqueue`.
- Produces: `refreshOnVisit(acc: Account, opts?: { sbcs?: boolean }): Promise<{ club: boolean; sbc: boolean }>`, `CLUB_VISIT_STALE_MS`; site `api.syncVisit(sbcs: boolean)`.

- [ ] **Step 1: Replace `refreshSbcsOnVisit` in `server/sync.ts`** (keep the doc comment style)

```ts
// A visit also refreshes a club older than this (within the daily club cap), so the club the
// solver uses is almost always current.
export const CLUB_VISIT_STALE_MS = Number(process.env.CLUB_VISIT_STALE_H ?? 2) * 60 * 60 * 1000;

/**
 * A visit (site opened, web app back in front): queue a club sync when the club is stale and a
 * list refresh when the SBC cooldown is over. Client-mode only, and only with the web app open
 * (nothing else may call EA). Never throws: a visit is not a click.
 */
export async function refreshOnVisit(acc: Account, { sbcs = true }: { sbcs?: boolean } = {}): Promise<{ club: boolean; sbc: boolean }> {
  const out = { club: false, sbc: false };
  try {
    if (!acc.clientMode || !webAppOpen(acc)) return out;
    await acc.meter.check();
    const club = await readCache(acc.key('club'));
    if (!hasPending(acc, 'club') && clubDueOnVisit(club?.fetchedAt ?? null, Date.now(), CLUB_VISIT_STALE_MS, await clubSyncsToday(acc), CLUB_SYNCS_PER_DAY)) {
      await requestSync(acc, 'club', true);
      out.club = true;
    }
    if (sbcs && !hasPending(acc, 'sbc') && Date.now() >= (await sbcNextAt(acc))) {
      await enqueue(acc, 'sbc');
      out.sbc = true;
    }
  } catch {
    // over today's EA budget or paused
  }
  return out;
}
```

Add `import { clubDueOnVisit } from './visit-rules.js';` to the imports.

- [ ] **Step 2: Wire `server/index.ts`** — replace `refreshSbcsOnVisit` with `refreshOnVisit` in the import on line 14, then:

```ts
/** The site opened (or came back in front): refresh a stale club, and the SBC list on the SBC screens. */
app.post<{ Body: { sbcs?: boolean } | undefined }>('/api/sync/visit', async (req) => {
  const acc = await siteAccount(req);
  await refreshOnVisit(acc, { sbcs: req.body?.sbcs !== false });
  return getStatus(acc);
});
```

and at line 288: `if (returned) await refreshOnVisit(acc);`

- [ ] **Step 3: Site** — `web/src/api.ts:234`:

```ts
  syncVisit: (sbcs: boolean) => req<SyncStatus>('/api/sync/visit', { method: 'POST', body: { sbcs } }),
```

`web/src/App.tsx:307-319` becomes:

```tsx
  // On every screen, a visit lets the server refresh a club older than 2 h (ClubSyncModal shows
  // it); on the SBC screens also the SBC list (30 min cooldown). Needs the web app open.
  const onSbcs = view === 'sbcs';
  const live = !!account?.session;
  useEffect(() => {
    if (!activeId || !live) return;
    const visit = () => {
      if (!document.hidden) void api.syncVisit(onSbcs).then(setStatus, () => {});
    };
    visit();
    document.addEventListener('visibilitychange', visit);
    return () => document.removeEventListener('visibilitychange', visit);
  }, [onSbcs, activeId, live]);
```

- [ ] **Step 4: Docs** — `docs/api.md` `POST /api/sync/visit`: body `{ "sbcs": true }` (optional, default `true`); client mode + web app open: queues a club sync when the cached club is older than `CLUB_VISIT_STALE_H` (2) hours and the daily club cap is not reached (counts toward it), and with `sbcs` the SBC list refresh as before; the site calls it on every screen when the account goes live and when the tab comes back in front. `docs/architecture.md:90` club row: add "or a visit (site opened / back in front) when older than 2 h (`CLUB_VISIT_STALE_H`)".

- [ ] **Step 5: Verify** — `npm run typecheck` → no errors; `npm test` → all pass.

- [ ] **Step 6: Manual check** — with `npm run dev` running and the EA web app open (Live): with the cached club older than 2 h, open `/dashboard/club` → `ClubSyncModal` shows the running club sync; reload right after → no second sync (`sync.clubSyncs.used` did not grow).

- [ ] **Step 7: Commit** — `git add server/sync.ts server/index.ts web/src/api.ts web/src/App.tsx docs/api.md docs/architecture.md && git commit -m "feat(sync): refresh stale club on site visit"`

---

### Task 3: Pure rule `seedChallenges`

**Files:**
- Create: `server/shared-sbc.ts`
- Test: `server/shared-sbc.test.ts`

**Interfaces:**
- Consumes: `Challenge`, `SbcSet` from `server/ea.ts`
- Produces: `seedChallenges(set: SeedSet, shared: Challenge[] | null): Challenge[] | null` with `type SeedSet = Pick<SbcSet, 'setId' | 'challengesCount' | 'challengesCompletedCount' | 'timesCompleted'>`

- [ ] **Step 1: Write the failing test** — `server/shared-sbc.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Challenge } from './ea.js';
import { seedChallenges } from './shared-sbc.js';

const ch = (challengeId: number, priority: number, extra: Partial<Challenge> = {}) =>
  ({ challengeId, setId: 7, name: `c${challengeId}`, priority, status: 'COMPLETED', timesCompleted: 4, formation: 'f442', repeatable: false, elgReq: [], elgOperation: 'AND', awards: [], endTime: 1, description: '', ...extra }) as Challenge;
const set = { setId: 7, challengesCount: 2, challengesCompletedCount: 0, timesCompleted: 0 };

test('seeds a fresh set, per-account fields reset, EA order', () => {
  const out = seedChallenges(set, [ch(11, 2), ch(10, 1)]);
  assert.deepEqual(out?.map((c) => c.challengeId), [10, 11]);
  assert.ok(out?.every((c) => c.status === 'NOT_STARTED' && c.timesCompleted === 0));
  assert.equal(out?.[0].formation, 'f442'); // the rest stays as EA sent it
});

test('no seed when the account has progress', () => {
  assert.equal(seedChallenges({ ...set, challengesCompletedCount: 1 }, [ch(10, 1), ch(11, 2)]), null);
  assert.equal(seedChallenges({ ...set, timesCompleted: 1 }, [ch(10, 1), ch(11, 2)]), null);
});

test('no seed from a partial, foreign or empty list', () => {
  assert.equal(seedChallenges(set, [ch(10, 1)]), null);
  assert.equal(seedChallenges(set, [ch(10, 1), ch(11, 2, { setId: 8 })]), null);
  assert.equal(seedChallenges(set, []), null);
  assert.equal(seedChallenges(set, null), null);
});

test('does not mutate the shared rows', () => {
  const shared = [ch(10, 1), ch(11, 2)];
  seedChallenges(set, shared);
  assert.equal(shared[0].status, 'COMPLETED');
});
```

- [ ] **Step 2: Run to verify it fails** — `node --import tsx --test server/shared-sbc.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — `server/shared-sbc.ts`

```ts
// Challenges are the same for everyone; only status and timesCompleted are per account. A set
// this account never touched can take its challenges from the shared copy instead of asking EA.
import type { Challenge, SbcSet } from './ea.js';

export type SeedSet = Pick<SbcSet, 'setId' | 'challengesCount' | 'challengesCompletedCount' | 'timesCompleted'>;

/** This account's copy of the set's challenges, or null when it must ask EA itself. */
export function seedChallenges(set: SeedSet, shared: Challenge[] | null): Challenge[] | null {
  if (!shared?.length || shared.length !== set.challengesCount) return null;
  if (set.challengesCompletedCount !== 0 || set.timesCompleted !== 0) return null;
  if (shared.some((c) => c.setId !== set.setId)) return null;
  const prio = (c: Challenge) => (c as Challenge & { priority?: number }).priority ?? 0;
  return [...shared]
    .sort((a, b) => prio(a) - prio(b) || a.challengeId - b.challengeId)
    .map((c) => ({ ...c, status: 'NOT_STARTED', timesCompleted: 0 }));
}
```

- [ ] **Step 4: Run to verify it passes** — same command → PASS.

- [ ] **Step 5: Commit** — `git add server/shared-sbc.ts server/shared-sbc.test.ts && git commit -m "feat(sbc): seed-challenges-from-shared rule"`

---

### Task 4: Reuse shared challenges after an SBC list sync

**Files:**
- Modify: `server/db/sbcs.ts` (new `sharedChallenges`, import `and`, `gte` from `drizzle-orm`)
- Modify: `server/jobs.ts:125-156` (`finishJob`), imports
- Modify: `docs/architecture.md:38` (shared data) and `:92` (challenges row)

**Interfaces:**
- Consumes: `seedChallenges` (Task 3); `lastSbcDrop()` from `server/sync.ts` (runtime import inside a function; `sync.ts` already imports `jobs.ts`, the cycle is safe because it is only called at run time); `writeCache` from `server/store.ts`.
- Produces: `sharedChallenges(setId: number, since: Date): Promise<Challenge[]>`

- [ ] **Step 1: `server/db/sbcs.ts`** — after `saveChallenges`:

```ts
/** A set's challenges as last seen by any account since `since` (for seeding other accounts). */
export async function sharedChallenges(setId: number, since: Date): Promise<Challenge[]> {
  const rows = await db
    .select({ raw: challenges.raw })
    .from(challenges)
    .where(and(eq(challenges.setId, setId), gte(challenges.lastSeen, since)));
  return rows.map((r) => r.raw as Challenge);
}
```

Change the import to `import { and, eq, gte, sql } from 'drizzle-orm';`.

- [ ] **Step 2: `server/jobs.ts`** — imports:

```ts
import { readCache, writeCache } from './store.js';
import type { Challenge, SbcSet } from './ea.js';
import { sharedChallenges } from './db/sbcs.js';
import { seedChallenges } from './shared-sbc.js';
import { lastSbcDrop, type SetsData } from './sync.js';
```

(replace the existing `readCache` and `type SetsData` imports). Add above `finishJob`:

```ts
/** A set new to this account and untouched: take its challenges from the shared copy, no EA call. */
async function seedFromShared(acc: Account, set: SbcSet): Promise<boolean> {
  try {
    const list = seedChallenges(set, await sharedChallenges(set.setId, new Date(lastSbcDrop())));
    if (!list) return false;
    await writeCache<Challenge[]>(acc.key(`challenges/${set.setId}`), list);
    return true;
  } catch (e) {
    console.error(`[db] shared challenges for set ${set.setId} failed: ${(e as Error).message}`);
    return false; // ask EA as before
  }
}
```

In the loop, after the "finished one-off sets" `continue` line:

```ts
    if (!cached && (await seedFromShared(acc, set))) continue;
```

- [ ] **Step 3: Verify** — `npm run typecheck` → no errors; `npm test` → all pass.

- [ ] **Step 4: Real-data check** — scratch script (not committed), run with `node --env-file=.env --import tsx <scratch>/seed-check.ts`: `initDb()`, then for each `data/accounts/*/challenges/<setId>.json` read the set from `data/accounts/*/sets.json`, call `sharedChallenges(setId, new Date(0))`, and compare `seedChallenges({...set, challengesCompletedCount: 0, timesCompleted: 0}, shared)` against the cached list with `status` / `timesCompleted` removed from both (`assert.deepEqual` on the rest). Expected: every set with a full shared copy matches; print counts of matched / skipped. Then `closeDb()`.

- [ ] **Step 5: Docs** — `docs/architecture.md`: in Shared data, "An SBC list sync seeds the challenges of a set that is new to the account and untouched (0 completed, 0 repeats) from `challenges` rows seen since the latest drop, with `status` / `timesCompleted` reset, instead of asking EA; a started-but-not-submitted challenge shows `NOT_STARTED` until the set is opened in the web app." Challenges row in the freshness table: "…the set is new (taken from the shared copy when untouched and complete since the drop) or its progress changed…".

- [ ] **Step 6: Commit** — `git add server/db/sbcs.ts server/jobs.ts docs/architecture.md && git commit -m "feat(sbc): seed untouched sets from shared challenges"`

---

### Task 5: Requirements caret opens the list

**Files:**
- Modify: `web/src/styles.css:1236-1247` (`.pitch-header`), `web/src/styles.css:2729-2733` (≤1280 rule)

- [ ] **Step 1: CSS** — `.pitch-header`: remove `background` and `clip-path`, add `isolation: isolate;`. Add:

```css
/* the header shape lives on its own layer: a clip-path on the header itself would hide the requirements dropdown */
.pitch-header::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: -1;
  background: oklch(0.17 0.02 225);
  clip-path: polygon(0 0, 100% 0, calc(100% - 26px) 100%, 26px 100%);
}
```

In the media rule at 2729, replace `clip-path: none;` on `.pitch-header` with a new rule `.pitch-header::before { clip-path: none; }` inside the same media query.

- [ ] **Step 2: Verify** — `npm run build` → ok. Browser (`npm run dev`, open an SBC): click "Requirements ⌄" → list shows under the header, caret rotates, click again closes. Repeat at 390px and 1280px wide. Header shape looks unchanged.

- [ ] **Step 3: Commit** — `git add web/src/styles.css && git commit -m "fix(pitch): requirements dropdown no longer clipped"`

---

### Task 6: Solve loader in the middle of the pitch

**Files:**
- Modify: `web/src/components/Pitch.tsx:189` (replace the pill)
- Modify: `web/src/styles.css:1437-1448` (replace `.pitch-status`)

- [ ] **Step 1: Pitch.tsx** — replace line 189 with:

```tsx
        {solving && (
          <div className="pitch-loading" role="status">
            <div className="deck" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <p>{t('pitch.searching')}</p>
          </div>
        )}
```

- [ ] **Step 2: CSS** — replace `.pitch-status { … }` with:

```css
.pitch-loading {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 16px;
  background: oklch(0.14 0.03 215 / 0.55);
  backdrop-filter: blur(2px);
  color: var(--ink);
  font-weight: 600;
}

.pitch-loading p {
  margin: 0;
  padding: 6px 14px;
  border-radius: 999px;
  background: oklch(0.17 0.02 225 / 0.9);
}

.deck {
  display: flex;
  gap: 10px;
  perspective: 600px;
}

.deck span {
  width: 44px;
  height: 60px;
  border: 1px solid var(--line);
  border-radius: 8px 8px 22px 22px;
  background: linear-gradient(160deg, oklch(0.42 0.06 190), oklch(0.26 0.04 210));
  animation: deck-flip 1.2s var(--ease) infinite;
}

.deck span:nth-child(2) { animation-delay: 0.15s; }
.deck span:nth-child(3) { animation-delay: 0.3s; }

@keyframes deck-flip {
  0%, 60%, 100% { transform: rotateY(0) translateY(0); }
  30% { transform: rotateY(180deg) translateY(-8px); }
}
```

Reduced motion: the global rule at `styles.css:2838` stops the animation after one 1 ms run → static cards + text; nothing else to add.

- [ ] **Step 3: Verify** — `npm run build` → ok. Browser: press Solve → three cards flip in the pitch center with "Searching your club", slots dimmed; 390px fits. DevTools "Emulate prefers-reduced-motion: reduce" → static.

- [ ] **Step 4: Commit** — `git add web/src/components/Pitch.tsx web/src/styles.css && git commit -m "feat(pitch): centered solve loader"`

---

### Task 7: Mark several players, keep them all out with one re-solve

**Files:**
- Modify: `web/src/App.tsx` (state near :104, `runSolve` :377, `excludeAndResolve` :396-402, challenge click :827, Pitch props :911-924, PlayerPanel :934-944, bar after Pitch)
- Modify: `web/src/components/Pitch.tsx` (prop `marked`, badge)
- Modify: `web/src/components/PlayerPanel.tsx:50-57,145-153` (new optional `excludedLabel`)
- Modify: `web/src/locales/en.ts`, `web/src/locales/ro.ts`
- Modify: `web/src/styles.css` (`.slot-marked`, `.mark-bar`)

**Interfaces:**
- Pitch gets `marked: Set<number>`; PlayerPanel gets optional `excludedLabel?: string` (App uses `onExclude` / `excluded` / `excludeLabel` / `excludedLabel` as mark / unmark; ClubView unchanged).

- [ ] **Step 1: Locales** — `en.ts` next to `player.*`:

```ts
  'player.mark': 'Mark to keep out',
  'player.unmark': 'Unmark',
  'mark.count_one': '{count} player marked',
  'mark.count_other': '{count} players marked',
  'mark.apply': 'Keep out & re-solve',
  'mark.applyNoSolve': 'Keep out',
  'mark.clear': 'Clear',
  'pitch.marked': 'Marked to keep out',
```

`ro.ts`:

```ts
  'player.mark': 'Marchează pentru excludere',
  'player.unmark': 'Scoate marcajul',
  'mark.count_one': '{count} jucător marcat',
  'mark.count_few': '{count} jucători marcați',
  'mark.count_other': '{count} de jucători marcați',
  'mark.apply': 'Exclude și rezolvă din nou',
  'mark.applyNoSolve': 'Exclude',
  'mark.clear': 'Anulează',
  'pitch.marked': 'Marcat pentru excludere',
```

(`en.ts` uses only `_one` / `_other`, like `clubSync.loaded_*`.)

- [ ] **Step 2: App state + actions** — near `selectedId` (:104): `const [marked, setMarked] = useState<Set<number>>(new Set());`. In `runSolve` next to `setSelectedId(null)`: `setMarked(new Set());`. In the challenge click handler (:827) next to `setSelectedId(null)`: `setMarked(new Set());`. Add a `useEffect(() => setMarked(new Set()), [setId]);`. Replace `excludeAndResolve` with:

```ts
  // marked players are kept out of this SBC only, all at once with one solve; the club screen keeps players out of every SBC
  const toggleMark = (playerId: number) =>
    setMarked((prev) => {
      const next = new Set(prev);
      if (!next.delete(playerId)) next.add(playerId);
      return next;
    });

  const excludeMarked = () => {
    if (!setId || !marked.size) return;
    const ids = [...marked];
    updateSetExcludes(setId, [...new Set([...setKept, ...ids])]);
    setMarked(new Set());
    if (!outOfSolves) void runSolve(false, { ...solveOptions, excludeIds: [...new Set([...solveOptions.excludeIds, ...ids])] }, !result?.clubOnly);
  };
```

- [ ] **Step 3: App render** — Pitch gets `marked={marked}`. PlayerPanel:

```tsx
                        onExclude={() => toggleMark(selected.id)}
                        excluded={marked.has(selected.id)}
                        excludeLabel={t('player.mark')}
                        excludedLabel={t('player.unmark')}
```

Right after `<Pitch … />` and before the hint:

```tsx
                    {marked.size > 0 && !solving && (
                      <div className="mark-bar" role="region" aria-label={t('pitch.marked')}>
                        <span>{t('mark.count', { count: marked.size })}</span>
                        <button type="button" className="ghost" onClick={() => setMarked(new Set())}>
                          {t('mark.clear')}
                        </button>
                        <button type="button" className="solve-sm" onClick={excludeMarked}>
                          <Prohibit weight="bold" aria-hidden="true" /> {outOfSolves ? t('mark.applyNoSolve') : t('mark.apply')}
                        </button>
                      </div>
                    )}
```

Import `Prohibit` from `@phosphor-icons/react` in App.tsx. `solve-sm` is the existing small `--go` button (`styles.css:1090`).

- [ ] **Step 4: PlayerPanel** — `ClubView.tsx:169` also uses it (global keep-out, "Allow in SBCs again"), so add an optional prop instead of changing the default: `/** label when `excluded` (default: allow again) */ excludedLabel?: string;`, destructure it, and in the `excluded` branch render `{excludedLabel ?? t('player.allowAgain')}`. The other branch stays `excludeLabel ?? t('player.keepOutResolve')`. Club screen unchanged.

- [ ] **Step 5: Pitch badge** — Props: `/** players marked to keep out (⊘ badge) */ marked: Set<number>;`. Inside the slot, next to the `slot-fixed` badge:

```tsx
              {player && marked.has(player.id) && !solving && (
                <span className="slot-marked" title={t('pitch.marked')}>
                  <Prohibit weight="bold" aria-label={t('pitch.marked')} />
                </span>
              )}
```

Import `Prohibit`.

- [ ] **Step 6: CSS**

```css
.slot-marked {
  position: absolute;
  top: -6px;
  right: calc(50% - var(--card-w) / 2 - 4px);
  z-index: 2;
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--bad);
}

.mark-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: var(--r-box);
  background: var(--surface);
}

.mark-bar span {
  margin-right: auto;
  font-weight: 600;
}
```

- [ ] **Step 7: Verify** — `npm run typecheck`, `npm run i18n:check`, `npm run build` → all ok. Browser: solve, click 3 players → "Mark" each → ⊘ badges + bar "3 players marked"; "Clear" removes them; mark 2 → "Keep out & re-solve" → one solve, neither player in the new squad, both listed in the set's excluded players; switch challenge → marks gone. 390px: bar wraps cleanly. Romanian UI text correct.

- [ ] **Step 8: Commit** — `git add web/src && git commit -m "feat(pitch): mark several players and keep them out at once"`

---

### Task 8: Final verification

- [ ] `npm test`, `npm run typecheck`, `npm run i18n:check`, `npm run build` → paste results.
- [ ] Browser pass at 1280px and 390px over Tasks 2, 5, 6, 7.
- [ ] `git log --oneline dev..HEAD` lists the task commits; hand off with superpowers:finishing-a-development-branch (merge into `dev`, no push without asking).
