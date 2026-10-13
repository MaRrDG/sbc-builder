# EA safety + solve load Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FC Solver never sends EA more than the user asked for, never more than the daily budget, never during a throttling pause (also across restarts), and a burst of solves cannot take the server down.

**Architecture:** Browsing stops calling EA (auto-read removed); the server-side legacy SID sync is deleted so the only server→EA call is the one-time proof in `/api/hello`. The job queue hands out a job only when its estimated cost fits today's remaining budget (pure `server/job-cost.ts`), the throttling pause is persisted in the meter file. Every CP-SAT run goes through one gate (pure-ish `server/solve-gate.ts`: 2 at once, queue of 12) with a kill timer; one SBC solve per user.

**Tech Stack:** Node 24 + TypeScript (tsx), Fastify 5, node:test, React 19, OR-Tools CP-SAT (Python).

**Spec:** `docs/superpowers/specs/2026-10-13-ea-safety-solve-load-design.md`

## Global Constraints

- Read-only toward EA; never add a job recipe that writes to EA; no extension change (no version bump).
- Every user-facing string through `t()`, keys in `web/src/locales/en.ts` + `ro.ts` + `it.ts` (each language written, Romanian plurals `_one`/`_few`/`_other`, Italian `_one`/`_other`); `npm run i18n:check` must pass.
- Server errors shown to users carry a `msgCode` (`SessionError(msg, status, msgCode, params)`), the site shows them as `err.<msgCode>`.
- New endpoint behaviour or payload change → `docs/api.md`.
- No changelog entry (no user-visible feature).
- Exact values: CP-SAT gate `max = 2`, queue `12`, `workers: 4`, kill at `timeLimit + 15` s; club cost `ceil(items / 91) + 1 + 4`, unknown club `60`, challenges = set ids (max 40), sbc `2`, academy `1`, challengeSquad `1`; `/api/session` → `410` `extTooOld`; new codes `solverBusy` (503), `solverTimeout` (504), `solveRunning` (409); pin `ortools==9.15.6755`.
- Commits: `type(scope): subject`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Verify with `npm run typecheck`, `npm test`, `npm run build`, `npm run i18n:check`.

## Review Focus

1. A queued club job that does not fit must not block a small job behind it (SBC list, cost 2) that does fit — test in Task 4 (`pickJob` skips to the first job that fits).
2. The gate must release its slot when the solver throws or is killed, or two failures lock solving for everyone — test in Task 5 (`release on throw`).
3. A persisted pause from yesterday's file must not resurrect after it expired, and a new day must keep `pausedUntil` (a pause at 23:55 lasts past midnight) — test in Task 3.
4. Accounts loaded with an old `sid` in `account.json` must not keep it in memory or on disk — Task 2 Step 4 (`loadAccounts` clears and saves).
5. A user who double-clicks Solve gets one solve and one `solveRunning`, and the lock is freed when the first one throws — test in Task 5 (`userLock`).

---

### Task 1: No EA call when a started challenge is opened

**Files:**
- Modify: `web/src/App.tsx` (auto-read effect ~`:703-714`, the `readAsked` state, the notice block ~`:1495-1512`)
- Modify: `web/src/locales/en.ts`, `ro.ts`, `it.ts`

**Interfaces:**
- Consumes: `api.readChallenge(id)` (unchanged), `status.running === 'squad'`.
- Produces: nothing for later tasks.

- [ ] **Step 1: Remove the auto-read.** Delete `readFromWebApp`, the `useEffect` that calls it, and the `readAsked` state + its setter (grep `readAsked` to remove every use).

- [ ] **Step 2: Show the read button for a started challenge without a squad.** Today the button shows only when `challenge.needsLayout`. Add a second notice for `challenge.status === 'IN_PROGRESS' && !challenge.layout && !challenge.needsLayout && account?.session`:

```tsx
{!challenge.needsLayout && challenge.status === 'IN_PROGRESS' && !challenge.layout && account?.session && (
  <div className="notice-inline" role="status">
    {t('set.placedRead')}{' '}
    <button
      type="button"
      className="text"
      disabled={status?.running === 'squad'}
      onClick={() => api.readChallenge(challenge.challengeId).then(setStatus).catch(onApiError)}
    >
      {status?.running === 'squad' ? t('set.bricksReading') : t('set.bricksReadButton')}
    </button>
  </div>
)}
```

- [ ] **Step 3: Strings** (next to `set.bricksRead` in each file):
  - en `'set.placedRead': 'Started in the web app: players you already placed there show up after one read.'`
  - ro `'set.placedRead': 'Început în web app: jucătorii pe care i-ai pus deja acolo apar după o citire.'`
  - it `'set.placedRead': 'Iniziata nella web app: i giocatori che hai già inserito lì compaiono dopo una lettura.'`

- [ ] **Step 4: Verify.** `npm run typecheck && npm run i18n:check`. In the browser (dev server, real data): open a set with an IN_PROGRESS challenge; the network log shows no `POST /api/challenges/*/read` until the button is clicked.

- [ ] **Step 5: Commit** `fix(web): reading a started challenge from the web app only on click`.

### Task 2: Remove legacy mode

**Files:**
- Modify: `server/index.ts:182-192` (`/api/session`), import line 19
- Modify: `server/accounts.ts` (`Account.utas`, constructor, `attach`, `registerSession`, `loadAccounts`, `hello`, `AccountInfo.sid` comment)
- Modify: `server/sync.ts` (`utasOf`, `run`, `syncClub`, `syncSbcs`, `legacyClubAt`, `getChallenges` refresh, legacy branches of `getStatus`, `requestSync`, `autoSync`, `adminSync`)
- Modify: `server/ea.ts` only to delete `Utas` methods no longer referenced (keep `userInfo` and whatever `hello` uses)
- Modify: `web/src/locales/en.ts`, `ro.ts`, `it.ts` (`err.extTooOld`)
- Modify: `CLAUDE.md` (Auth paragraph: the "Legacy mode … remove it once all accounts run 0.7" sentence), `docs/architecture.md`, `docs/api.md`, `docs/extension.md` (grep `legacy` / `/api/session`)

**Interfaces:**
- Produces: `Account` without `utas` / `attach`; `hasSession` = `webAppOpen(this)` for client mode, `false` otherwise; `getChallenges(acc, setId)` cache-only (drop the `refresh` param and update callers).

- [ ] **Step 1: `/api/session` answers 410.**

```ts
// extensions before 0.7 synced from the server with the user's SID; that mode is gone (2026-10-13)
app.post('/api/session', async () => {
  throw new SessionError('This extension version is too old. Download the new one from FC Solver.', 410, 'extTooOld');
});
```

Remove `registerSession` from the import.

- [ ] **Step 2: `accounts.ts`.** Delete `registerSession`, `attach`, the `utas` field and `if (info.sid) this.attach(info.sid)`. `hasSession` becomes `return this.clientMode && webAppOpen(this);`. `useClientMode` keeps `this.info.sid = null`. Drop the `Utas` import only if `hello` no longer needs it (it does: `new Utas(opts.sid).userInfo()`; keep).

- [ ] **Step 3: `content.guid` only after the proof.** In `hello`, delete the first line `if (opts.contentGuid) content.guid = opts.contentGuid;` and set it after `await new Utas(opts.sid).userInfo()` succeeded and the persona check passed:

```ts
  if (opts.personaId && opts.personaId !== userInfo.personaId)
    throw Object.assign(new Error('Session does not belong to that account.'), { statusCode: 403 });
  if (opts.contentGuid) content.guid = opts.contentGuid; // only from a session EA just accepted
```

For the key path (`byKey`, no EA call) the guid is not taken: a held key is not a fresh proof.

- [ ] **Step 4: `loadAccounts` drops stored SIDs.**

```ts
    const acc = new Account({ ...c.data, sid: null, accessKey: c.data.accessKey || newKey() });
    if (!c.data.accessKey || c.data.sid) await acc.save(); // legacy SIDs are never kept
```

- [ ] **Step 5: `sync.ts`.** Delete `utasOf`, `run`, `syncClub`, `syncSbcs`, `legacyClubAt` and the `running` / `errors` maps if nothing else reads them after the edits (check `getStatus`, `autoSync`, `adminSync`; replace their legacy reads with the client-mode values: `running: jobs?.running ?? null`, `error: jobs?.error ?? null`). `requestSync`: non-client accounts throw `SessionError('Open the FC27 web app in this browser to sync. FC Solver asks EA only from there.', 409, 'webAppClosed')` (same as a closed tab). `autoSync`: return early unless `acc.clientMode`; delete the trailing legacy `requestSync`. `adminSync`: always `await requestSync(acc, kind, true)` (delete the `else void requestSync…` branch). `getChallenges`: cache only:

```ts
/** Challenges of a set, from cache only: filled by syncs and by the extension when the set is opened in the web app. */
export async function getChallenges(acc: Account, setId: number): Promise<Cached<Challenge[]> | null> {
  return readCache<Challenge[]>(acc.key(`challenges/${setId}`));
}
```

Fix every caller that passed `refresh` (grep `getChallenges(`). Remove imports that become unused.

- [ ] **Step 6: `ea.ts`.** `grep -n "utas\.\|new Utas" server -r` and delete the `Utas` methods that have no caller left (e.g. `clubPlayers`, `sets`, `challenges`, `activeSquad`, `chemistryProfiles` if unused). Keep `userInfo` and the request/meter plumbing it uses.

- [ ] **Step 7: Strings.**
  - en `'err.extTooOld': 'This FC Solver extension is too old. Download the new one from Setup and unzip it over the old folder.'`
  - ro `'err.extTooOld': 'Extensia FC Solver e prea veche. Descarc-o pe cea nouă din Setup și dezarhiveaz-o peste folderul vechi.'`
  - it `'err.extTooOld': "L'estensione FC Solver è troppo vecchia. Scarica quella nuova da Setup ed estraila sopra la vecchia cartella."`

- [ ] **Step 8: Docs.** `CLAUDE.md`: replace "Legacy mode (old extensions) still syncs server-side; remove it once all accounts run 0.7." with "Extensions before 0.7 (server-side SID sync) are refused: `/api/session` answers 410 `extTooOld`." Update `docs/architecture.md`, `docs/extension.md`, `docs/api.md` (`POST /api/session` → `410 { code: 'extTooOld' }`).

- [ ] **Step 9: Verify.** `npm run typecheck && npm test && npm run i18n:check`. `curl -s -X POST localhost:5178/api/session -H 'content-type: application/json' -d '{"sid":"00000000-0000-0000-0000-000000000000"}'` → `410` with `"code":"extTooOld"`. Dev site loads the dashboard and the activity panel as before.

- [ ] **Step 10: Commit** `refactor(server): drop legacy SID sync, old extensions get 410`.

### Task 3: Meter — persisted pause, over-budget log

**Files:**
- Modify: `server/meter.ts`
- Modify: `server/index.ts` (`/api/jobs/:id/call`: `await acc.meter.pause()`, pass the job kind to `record`)
- Test: `server/meter.test.ts`

**Interfaces:**
- Produces: `MeterData.pausedUntil?: number`; `RequestMeter.pause(): Promise<void>`; `RequestMeter.record(method, path, status, kind?: string): Promise<void>`; `RequestMeter.summary()` unchanged shape (`{ today, limit, pausedUntil, byPath, recent }`).

- [ ] **Step 1: Failing tests** (append to `server/meter.test.ts`; the file must set a temp data dir before importing, so move the import to a dynamic one at the top):

```ts
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.SBC_DATA_DIR = await mkdtemp(join(tmpdir(), 'fcs-meter-'));
const { RequestMeter, shouldLogRollover } = await import('./meter.js');
type MeterData = import('./meter.js').MeterData;

test('a throttling pause survives a restart (a new meter on the same file)', async () => {
  const a = new RequestMeter('t/pause', 1);
  await a.pause();
  const b = new RequestMeter('t/pause', 1);
  const s = await b.summary();
  assert.ok(s.pausedUntil && s.pausedUntil > Date.now() + 14 * 60_000);
  await assert.rejects(b.check(), /slow down/);
});

test('an expired pause on disk is not a pause', async () => {
  const { writeCache } = await import('./store.js');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' }).format(new Date());
  await writeCache('t/old', { day, count: 0, byPath: {}, recent: [], pausedUntil: Date.now() - 1000 });
  const m = new RequestMeter('t/old', 1);
  assert.equal((await m.summary()).pausedUntil, null);
  await m.check();
});

test('a pause carries over the day rollover', async () => {
  const { writeCache } = await import('./store.js');
  await writeCache('t/roll', { day: '2000-01-01', count: 3, byPath: {}, recent: [], pausedUntil: Date.now() + 60_000 });
  const m = new RequestMeter('t/roll', 1);
  assert.ok((await m.summary()).pausedUntil);
});
```

Keep the two existing `shouldLogRollover` tests (they use `MeterData` as a type).

- [ ] **Step 2: Run** `node --import tsx --test server/meter.test.ts` → the new tests FAIL (`pause()` returns void, nothing on disk).

- [ ] **Step 3: Implement.** In `meter.ts`: add `pausedUntil?: number` and `overLogged?: boolean` to `MeterData`; remove the `private pausedUntil` field; the rollover keeps the pause: `this.data = { day: today(), count: 0, byPath: {}, recent: stale?.recent ?? [], pausedUntil: stale?.pausedUntil };`. Then:

```ts
  private async pausedUntil(): Promise<number | null> {
    const until = (await this.load()).pausedUntil ?? 0;
    return until > Date.now() ? until : null;
  }

  async check() {
    const until = await this.pausedUntil();
    if (until) {
      const min = Math.ceil((until - Date.now()) / 60000);
      throw new SessionError(`EA asked us to slow down. FC Solver pauses its EA requests for ${min} more min.`, 429, 'paused', { min });
    }
    const d = await this.load();
    if (d.count >= DAILY_LIMIT) throw new SessionError(/* unchanged budget error */);
  }

  async record(method: string, path: string, status: number | null, kind?: string) {
    const d = await this.load();
    const ep = endpoint(path);
    d.count++;
    d.byPath[ep] = (d.byPath[ep] ?? 0) + 1;
    d.recent = [{ at: Date.now(), method, path: ep, status }, ...d.recent].slice(0, RECENT);
    // a job ran past the cap (its cost estimate was low): once a day in the admin log, to tune job-cost.ts
    if (d.count > DAILY_LIMIT && !d.overLogged) {
      d.overLogged = true;
      logEvent({ type: 'ea_error', personaId: this.personaId, data: { code: 'overBudget', kind: kind ?? null, count: d.count } });
    }
    await writeCache(this.cacheKey, d);
  }

  /** EA signalled throttling: stop sending anything for this account for a while (kept across restarts). */
  async pause() {
    const d = await this.load();
    d.pausedUntil = Date.now() + COOLDOWN_MS;
    await writeCache(this.cacheKey, d);
    logEvent({ type: 'ea_error', personaId: this.personaId, data: { code: 'throttle' } });
  }

  async summary() {
    const d = await this.load();
    return { today: d.count, limit: DAILY_LIMIT, pausedUntil: await this.pausedUntil(), byPath: d.byPath, recent: d.recent.slice(0, 10) };
  }
```

The rollover resets `overLogged` (new object without it). In `server/index.ts` `/api/jobs/:id/call`: `await acc.meter.record(method..., path..., status..., job.kind);` and `await acc.meter.pause();`. Grep other `meter.pause(` callers (e.g. `server/ea.ts`) and `await` them / make the caller `void` them where it cannot be async.

- [ ] **Step 4: Run** `node --import tsx --test server/meter.test.ts` → PASS; `npm run typecheck`.

- [ ] **Step 5: Commit** `fix(server): EA throttling pause survives restarts, over-budget logged`.

### Task 4: Jobs only start when they fit today's budget

**Files:**
- Create: `server/job-cost.ts`, `server/job-cost.test.ts`
- Modify: `server/jobs.ts` (`Job.budget`, `nextJob`)
- Modify: `server/index.ts` (`/api/jobs/next` passes the budget)
- Modify: `server/job-view.ts` + `server/job-view.test.ts` (state `budget`)
- Modify: `web/src/api.ts` (`JobState`, `JobView`), `web/src/activity.ts` (`ACTIVE`), `web/src/components/Activity.tsx`, `web/src/locales/en.ts`, `ro.ts`, `it.ts`
- Modify: `docs/api.md` (job view `state: 'budget'`, `budget: { cost, left }`)

**Interfaces:**
- Produces: `jobCost(job: { kind: JobKind; setIds?: number[] }, clubItems: number | null): number`; `pickJob<T extends { status: string; kind: JobKind; setIds?: number[] }>(queue: T[], left: number, clubItems: number | null): { job: T | null; blocked: { job: T; cost: number }[] }`; `Job.budget?: { cost: number; left: number }`; `nextJob(acc, canRun, budget?: { left: number; clubItems: number | null })`; `JobView.budget: { cost: number; left: number } | null`, `JobState` gains `'budget'`.

- [ ] **Step 1: Failing tests** `server/job-cost.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobCost, pickJob, UNKNOWN_CLUB_COST } from './job-cost.js';

test('club cost: pages of 91 plus a spare page plus 4 fixed calls', () => {
  assert.equal(jobCost({ kind: 'club' }, 4950), Math.ceil(4950 / 91) + 1 + 4); // 60
  assert.equal(jobCost({ kind: 'club' }, 91), 1 + 1 + 4);
  assert.equal(jobCost({ kind: 'club' }, 0), UNKNOWN_CLUB_COST);
  assert.equal(jobCost({ kind: 'club' }, null), UNKNOWN_CLUB_COST);
});

test('other kinds', () => {
  assert.equal(jobCost({ kind: 'challenges', setIds: [1, 2, 3] }, null), 3);
  assert.equal(jobCost({ kind: 'challenges', setIds: Array.from({ length: 50 }, (_, i) => i) }, null), 40);
  assert.equal(jobCost({ kind: 'sbc' }, null), 2);
  assert.equal(jobCost({ kind: 'academy' }, null), 1);
  assert.equal(jobCost({ kind: 'challengeSquad' }, null), 1);
});

test('pickJob takes the first queued job that fits and reports the ones that do not', () => {
  const q = [
    { status: 'done', kind: 'sbc' as const },
    { status: 'queued', kind: 'club' as const },
    { status: 'queued', kind: 'sbc' as const },
  ];
  const r = pickJob(q, 10, 2000);
  assert.equal(r.job, q[2]);
  assert.deepEqual(r.blocked.map((b) => [b.job, b.cost]), [[q[1], Math.ceil(2000 / 91) + 5]]);
});

test('pickJob at the edge: cost equal to what is left fits', () => {
  const q = [{ status: 'queued', kind: 'sbc' as const }];
  assert.equal(pickJob(q, 2, null).job, q[0]);
  assert.equal(pickJob(q, 1, null).job, null);
});
```

- [ ] **Step 2: Run** `node --import tsx --test server/job-cost.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `server/job-cost.ts`:**

```ts
// Pure: how many EA requests a sync job will make, so a job only starts when today's budget
// (EA_DAILY_LIMIT) still has room for all of it. A job cannot be stopped half way, so estimates
// round up; the meter logs `overBudget` when one still ran past the cap.
import type { JobKind } from './jobs.js';

const CLUB_PAGE = 91; // extension/hook.js PAGE
const CLUB_FIXED = 4; // squad list, active squad, chemistry profiles, storage
export const UNKNOWN_CLUB_COST = 60;
const MAX_SETS = 40;

export function jobCost(job: { kind: JobKind; setIds?: number[] }, clubItems: number | null): number {
  switch (job.kind) {
    case 'club':
      return clubItems ? Math.ceil(clubItems / CLUB_PAGE) + 1 + CLUB_FIXED : UNKNOWN_CLUB_COST;
    case 'challenges':
      return Math.min(job.setIds?.length ?? 0, MAX_SETS);
    case 'sbc':
      return 2; // the hub, or the old list when the hub is off
    case 'academy':
    case 'challengeSquad':
      return 1;
  }
}

/** The first queued job whose cost fits in `left`; queued jobs before it that do not fit are reported. */
export function pickJob<T extends { status: string; kind: JobKind; setIds?: number[] }>(
  queue: T[], left: number, clubItems: number | null,
): { job: T | null; blocked: { job: T; cost: number }[] } {
  const blocked: { job: T; cost: number }[] = [];
  for (const j of queue) {
    if (j.status !== 'queued') continue;
    const cost = jobCost(j, clubItems);
    if (cost <= left) return { job: j, blocked };
    blocked.push({ job: j, cost });
  }
  return { job: null, blocked };
}
```

- [ ] **Step 4: Run** the test → PASS.

- [ ] **Step 5: `jobs.ts`.** Add to `Job`: `/** queued but over today's EA budget: its estimated cost and what was left */ budget?: { cost: number; left: number };`. `nextJob(acc, canRun = true, budget?: { left: number; clubItems: number | null })`:

```ts
  const q = queueOf(acc);
  if (!canRun) return null;
  if (q.some((j) => j.status === 'running')) return null;
  if (Date.now() - (lastFinished.get(acc.id) ?? 0) < REST_BETWEEN_JOBS) return null;
  const { job, blocked } = budget ? pickJob(q, budget.left, budget.clubItems) : { job: q.find((j) => j.status === 'queued') ?? null, blocked: [] };
  let changed = false;
  for (const j of q) {
    const b = blocked.find((x) => x.job === j);
    const next = b && budget ? { cost: b.cost, left: budget.left } : undefined;
    if (j.budget?.cost !== next?.cost || j.budget?.left !== next?.left) changed = true;
    j.budget = next;
  }
  if (job) {
    job.status = 'running';
    job.startedAt = Date.now();
    changed = true;
  }
  if (changed) notify(acc.id);
  return job;
```

- [ ] **Step 6: `/api/jobs/next`.** Before the first `nextJob` call compute the budget once and pass it to both `nextJob` calls (refresh it inside the hold loop after each `meter.check()`):

```ts
  const budgetNow = async () => {
    const [m, club] = await Promise.all([acc.meter.summary(), readShared<unknown[]>(acc.key('club'))]);
    return { left: Math.max(0, m.limit - m.today), clubItems: club?.data.length ?? null };
  };
  let budget = await budgetNow();
  let job = nextJob(acc, canRun, budget);
  // in the loop, after the meter check:  budget = await budgetNow(); job = nextJob(acc, canRun, budget);
```

(import `readShared` from `./store.js` if not imported in `index.ts`.)

- [ ] **Step 7: Job view — failing test first** (append to `server/job-view.test.ts`, reuse that file's existing helpers / ctx shape):

```ts
test('a queued job over the budget shows as budget with its cost and what is left', () => {
  const v = jobView(
    { id: 'a', kind: 'club', status: 'queued', createdAt: 1, budget: { cost: 58, left: 25 } },
    { tabOpen: true, tabReady: true, pausedUntil: null, clubExpected: 4000 },
  );
  assert.equal(v.state, 'budget');
  assert.deepEqual(v.budget, { cost: 58, left: 25 });
});

test('a closed tab or a pause wins over budget', () => {
  const j = { id: 'a', kind: 'club' as const, status: 'queued' as const, createdAt: 1, budget: { cost: 58, left: 25 } };
  assert.equal(jobView(j, { tabOpen: false, tabReady: true, pausedUntil: null, clubExpected: null }).state, 'waitingTab');
  assert.equal(jobView(j, { tabOpen: true, tabReady: true, pausedUntil: Date.now() + 1000, clubExpected: null }).state, 'paused');
});
```

Run `node --import tsx --test server/job-view.test.ts` → FAIL. Then in `job-view.ts`: `JobState` adds `'budget'`; `JobLike` adds `budget?: { cost: number; left: number }`; `JobView` adds `budget: { cost: number; left: number } | null`; state order: `… : !ctx.tabReady ? 'waitingLogin' : j.budget ? 'budget' : 'queued'`; return `budget: state === 'budget' ? j.budget ?? null : null`. Run → PASS.

- [ ] **Step 8: Web.** `web/src/api.ts`: `JobState` adds `'budget'`, `JobView` adds `budget: { cost: number; left: number } | null`. `web/src/activity.ts`: add `'budget'` to `ACTIVE`. `Activity.tsx`: `ActivityButton` treats `budget` like `paused` (`const paused = job?.state === 'paused' || job?.state === 'budget';`, short text `job.state === 'budget' ? t('activity.budgetShort') : …`); `JobRow` icon for `budget` = `PauseCircle`, state text:

```tsx
  const state =
    job.state === 'paused'
      ? t('activity.state.paused', { time: job.resumeAt ? timeOf(job.resumeAt, lang) : '…' })
      : job.state === 'budget'
        ? t('activity.state.budget', { cost: job.budget?.cost ?? 0, left: job.budget?.left ?? 0 })
        : t(`activity.state.${job.state}`);
```

Strings:
  - en `'activity.budgetShort': 'limit'`, `'activity.state.budget': "Not enough EA requests left today (needs ~{cost}, {left} left). It runs after midnight."`
  - ro `'activity.budgetShort': 'limită'`, `'activity.state.budget': 'Nu mai sunt destule cereri EA azi (necesar ~{cost}, rămase {left}). Pornește după miezul nopții.'`
  - it `'activity.budgetShort': 'limite'`, `'activity.state.budget': 'Richieste EA di oggi quasi finite (servono ~{cost}, ne restano {left}). Parte dopo mezzanotte.'`

If `npm run i18n:check` flags `activity.state.budget` as unused (dynamic `activity.state.${…}` keys), keep the direct `t('activity.state.budget', …)` call as above, which is static.

- [ ] **Step 9: Verify.** `npm run typecheck && npm test && npm run i18n:check`. No local EA run (it would spend the owner's real budget); the browser check of the budget row happens on the owner's dev server after merge — list it in the report.

- [ ] **Step 10: Commit** `feat(server): sync jobs start only when they fit today's EA budget`.

### Task 5: Solve gate, kill timer, one solve per user

**Files:**
- Create: `server/solve-gate.ts`, `server/solve-gate.test.ts`
- Modify: `server/solver.ts` (`runCpSat`, `workers: 8` → `4` at `:208` and `:442`)
- Modify: `server/objectives/play.ts:83` (`workers: 4`)
- Modify: `server/solve-run.ts` (`runSolve` per-user lock)
- Modify: `solver/requirements.txt` (`ortools==9.15.6755`)
- Modify: `web/src/locales/en.ts`, `ro.ts`, `it.ts`, `docs/api.md`
- Modify: `server/index.ts:709` comment ("8 workers" → "4 workers")

**Interfaces:**
- Produces: `createGate(max: number, maxQueue: number): { run<T>(fn: () => Promise<T>): Promise<T>; stats(): { running: number; queued: number } }`; `class GateFull extends Error`; `userLock(): { take(key: string): boolean; release(key: string): void }`.

- [ ] **Step 1: Failing tests** `server/solve-gate.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGate, GateFull, userLock } from './solve-gate.js';

const deferred = () => {
  let resolve!: () => void;
  const p = new Promise<void>((r) => (resolve = r));
  return { p, resolve };
};

test('at most `max` run at once, the rest wait in order', async () => {
  const g = createGate(2, 12);
  const order: number[] = [];
  const d = [deferred(), deferred(), deferred()];
  const runs = d.map((x, i) => g.run(async () => { order.push(i); await x.p; return i; }));
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(order, [0, 1]);
  assert.deepEqual(g.stats(), { running: 2, queued: 1 });
  d[0].resolve();
  await runs[0];
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(order, [0, 1, 2]);
  d[1].resolve(); d[2].resolve();
  assert.deepEqual(await Promise.all(runs), [0, 1, 2]);
  assert.deepEqual(g.stats(), { running: 0, queued: 0 });
});

test('a full queue refuses at once', async () => {
  const g = createGate(1, 1);
  const hold = deferred();
  const a = g.run(() => hold.p);
  const b = g.run(async () => 1);
  await assert.rejects(g.run(async () => 2), GateFull);
  hold.resolve();
  await a; await b;
});

test('release on throw: a failing run frees its slot', async () => {
  const g = createGate(1, 5);
  await assert.rejects(g.run(async () => { throw new Error('boom'); }), /boom/);
  assert.equal(await g.run(async () => 7), 7);
  assert.deepEqual(g.stats(), { running: 0, queued: 0 });
});

test('userLock: one per key until released', () => {
  const l = userLock();
  assert.equal(l.take('u1'), true);
  assert.equal(l.take('u1'), false);
  assert.equal(l.take('u2'), true);
  l.release('u1');
  assert.equal(l.take('u1'), true);
});
```

- [ ] **Step 2: Run** `node --import tsx --test server/solve-gate.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement `server/solve-gate.ts`:**

```ts
// Limits CP-SAT runs for the whole server: `max` at once (each takes 4 cores for up to 10-30 s),
// the rest wait in arrival order; past `maxQueue` waiting, a solve is refused at once.
export class GateFull extends Error {}

export function createGate(max: number, maxQueue: number) {
  let running = 0;
  const waiting: (() => void)[] = [];
  const next = () => {
    running--;
    waiting.shift()?.();
  };
  return {
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (running >= max) {
        if (waiting.length >= maxQueue) throw new GateFull('solver queue full');
        await new Promise<void>((resolve) => waiting.push(resolve));
      }
      running++;
      try {
        return await fn();
      } finally {
        next();
      }
    },
    stats: () => ({ running, queued: waiting.length }),
  };
}

/** One run per key (user) at a time. */
export function userLock() {
  const held = new Set<string>();
  return {
    take: (key: string) => (held.has(key) ? false : (held.add(key), true)),
    release: (key: string) => void held.delete(key),
  };
}
```

Note the hand-off: `next()` decrements and wakes one waiter, which then increments; between them `running` is briefly `max - 1`, and a new arrival could take the slot first. Accepted: order among waiters is FIFO, a newcomer may overtake by one tick; the count never exceeds `max`.

- [ ] **Step 4: Run** the test → PASS.

- [ ] **Step 5: `runCpSat` through the gate with a kill timer** (`server/solver.ts`):

```ts
import { SessionError } from './ea.js';
import { createGate, GateFull } from './solve-gate.js';

const gate = createGate(2, 12); // 2 runs x 4 workers = the host's 8 cores
const KILL_GRACE_S = 15;

export async function runCpSat(problem: unknown): Promise<CpResult> {
  try {
    return await gate.run(() => spawnCpSat(problem));
  } catch (e) {
    if (e instanceof GateFull) throw new SessionError('The solver is busy, try again in a few seconds.', 503, 'solverBusy');
    throw e;
  }
}

function spawnCpSat(problem: unknown): Promise<CpResult> {
  const limit = Number((problem as { timeLimit?: number }).timeLimit ?? 10);
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, [SCRIPT], { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    let killed = false;
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, (limit + KILL_GRACE_S) * 1000);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) return reject(new SessionError('The solver took too long and was stopped.', 504, 'solverTimeout'));
      if (code !== 0) return reject(new Error(`solver exited ${code}: ${err.slice(-500)}`));
      try {
        resolve(JSON.parse(out) as CpResult);
      } catch {
        reject(new Error(`solver returned invalid JSON: ${out.slice(0, 200)}`));
      }
    });
    child.stdin.end(JSON.stringify(problem));
  });
}
```

(If `SessionError` is already imported in `solver.ts`, don't import it twice.) Set `workers: 4` in both problem builders in `solver.ts` and in `server/objectives/play.ts`.

- [ ] **Step 6: One SBC solve per user** (`server/solve-run.ts`):

```ts
import { userLock } from './solve-gate.js';

const solving = userLock(); // one SBC solve per user (site and Discord bot share it)

export async function runSolve(userId: string, acc: Account, body: SolveBody, via: 'site' | 'discord' = 'site') {
  if (!solving.take(userId)) throw new SessionError('A solve is already running.', 409, 'solveRunning');
  try {
    return await solveOnce(userId, acc, body, via);
  } finally {
    solving.release(userId);
  }
}
```

Rename the current body of `runSolve` to `async function solveOnce(...)` unchanged. `SolveAnswer` stays `Awaited<ReturnType<typeof runSolve>>`.

- [ ] **Step 7: Strings** (in the `err.` group):
  - en `'err.solverBusy': 'The solver is busy right now. Try again in a few seconds.'`, `'err.solverTimeout': 'The solver took too long and was stopped. Try again, or loosen the settings.'`, `'err.solveRunning': 'A solve is already running. Wait for it to finish.'`
  - ro `'err.solverBusy': 'Solverul e ocupat acum. Încearcă din nou în câteva secunde.'`, `'err.solverTimeout': 'Solverul a durat prea mult și a fost oprit. Încearcă din nou sau relaxează setările.'`, `'err.solveRunning': 'Rulează deja un solve. Așteaptă să se termine.'`
  - it `'err.solverBusy': 'Il solver è occupato. Riprova tra qualche secondo.'`, `'err.solverTimeout': 'Il solver ci ha messo troppo ed è stato fermato. Riprova o allenta le impostazioni.'`, `'err.solveRunning': 'Un calcolo è già in corso. Aspetta che finisca.'`

Ruling (spec left it open): the Solve button keeps its current spinner text while queued; no "Queued…" label (the site has no cheap signal for "waiting in the gate").

- [ ] **Step 8: Pin OR-Tools.** `solver/requirements.txt` → `ortools==9.15.6755`.

- [ ] **Step 9: Docs.** `docs/api.md` under `/api/solve` and `/api/objectives/solve`: `503 solverBusy`, `504 solverTimeout`, `409 solveRunning` (solve only).

- [ ] **Step 10: Verify.** `npm run typecheck && npm test && npm run i18n:check`. The gate itself is covered by the unit tests (a parallel run from one user is stopped by the per-user lock first). One real solve on the owner's dev server (`npm run dev` is running, real `data/`): open an SBC, press Solve, a squad comes back with a similar `ms` as before.

- [ ] **Step 11: Commit** `feat(server): solver gate (2 at once, queue 12), kill timer, one solve per user`.

### Task 6: Final check

- [ ] **Step 1:** `npm run typecheck && npm test && npm run build && npm run i18n:check` — all green.
- [ ] **Step 2:** `grep -rn "utas\b\|registerSession\|legacy" server docs CLAUDE.md` — only intended mentions left (admin `mode: 'legacy'` label may stay for old rows).
- [ ] **Step 3:** Browser on the owner's dev server (`npm run dev` already running): dashboard loads, open an SBC with an IN_PROGRESS challenge (no read request until click), press Solve once (squad), press it twice fast (second gets the "already running" banner or is disabled).
- [ ] **Step 4:** Commit any doc fixes `docs: EA safety and solver gate`.
