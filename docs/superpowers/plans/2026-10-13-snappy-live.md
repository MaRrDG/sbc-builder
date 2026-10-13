# Snappy Dashboard + Live Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The dashboard shows the last known data at once, refreshes it cheaply, and shows every EA job in flight live, without blocking the page.

**Architecture:** Server: an in-memory read-through cache in `store.ts` for hot read-only paths, ETags on the big GETs, a pure job-progress model, a per-persona notify bus pushed over `GET /api/stream` (server-sent events over a streaming `fetch`), and a long-poll `/api/jobs/next?wait=1` for extension 1.0.3. Site: App chunk prefetched with Clerk, skeleton boot, locales on demand, IndexedDB last-known state, live stream with polling fallback, and a non-blocking activity indicator + panel replacing the club sync modal.

**Tech Stack:** Fastify 5 / Node 24 / TypeScript via tsx, node:test; React 19 + Vite 8, plain CSS (OKLCH tokens), Phosphor icons; Chrome MV3 extension (plain JS).

**Spec:** `docs/superpowers/specs/2026-10-13-snappy-live-design.md`

## Global Constraints

- Never add or change an EA call path; EA paging pace (1.5-3 s per page in `extension/hook.js`) and meter caps stay as they are.
- Game formulas (`server/squad.ts`) untouched.
- Every user-visible string through `t()` with keys in `web/src/locales/en.ts` + `ro.ts` + `it.ts` (Romanian plurals `_one`/`_few`/`_other`, Italian `_one`/`_other`); `npm run i18n:check` passes.
- `--go` green only for done / primary action; `--pos` yellow only for position pills; controls 8px radius, containers 14px; respect `prefers-reduced-motion`; state never by colour alone; check 390px.
- Extension change → bump `extension/manifest.json` to `1.0.3` + entry in `extension/release.json`. The zip folder name stays `fc27-sbc-builder`.
- New endpoint / payload change → `docs/api.md`. User-visible change → `shared/changelog.ts` entry for today in en / ro / it, each written for its readers.
- Unit tests only for pure logic (`npm test`); verify with `npm run typecheck`, `npm test`, `npm run build`, `npm run i18n:check`, and in the browser.
- Commits: `git pull --rebase` first, message `type(scope): subject`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.
- Spec deviation (decided while planning): `personaRow` is NOT memoized. It is one indexed lookup and a persona takeover must cut access immediately.

## Review Focus

- A cached object returned by `readShared` gets mutated by a caller → the next reader sees corrupted data. Expect: only read-only call sites use `readShared`; mutating code keeps `readCache`. (Task 1 test pins that a write replaces the shared entry; Task 2 lists the exact call sites.)
- Two tabs of the same user + a third, fourth → the 4th `/api/stream` gets 429 and that tab silently falls back to polling, still updating. (Task 8 test: fallback after failures.)
- Long-poll answered after the extension's tab went away → a job marked `running` that nobody runs. Expect: the server stops holding when the socket is gone and never hands a job to a closed request. (Task 5 step checks `gone()` before `nextJob`.)
- Signed out, or a different Clerk user on the same browser → no previous user's club or SBCs shown. Expect: cache cleared on sign-out, other users' keys dropped on sign-in. (Task 7 test on `ownedBy`.)
- Stream through nginx / Cloudflare buffered → events arrive in bursts. Expect: `X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform`, 25 s heartbeat. (Task 4 test on `sseFrame` + manual check in Task 10.)

---

## File Structure

Server
- Modify `server/store.ts`: `readShared` (in-memory, LRU), unique tmp names, per-key write queue.
- Create `server/store.test.ts`.
- Create `server/etag.ts` + `server/etag.test.ts`: pure `etagOf`, `notModified`.
- Create `server/job-view.ts` + `server/job-view.test.ts`: pure job → view model.
- Create `server/live.ts` + `server/live.test.ts`: notify bus, `keyOwner`, `sseFrame`, stream slot counter.
- Modify `server/jobs.ts`: `calls`, `finishedAt`, ready tracking, `markPoll`, `wake` / `waitForWork`, `restLeft`, `jobList`, notify calls.
- Modify `server/sync.ts`: `getStatus` uses `readShared`, adds `jobs` + `graceUntil`; `markEdited` notifies.
- Modify `server/solve-run.ts`: `clubPlayers` via `readShared` + memo.
- Modify `server/events.ts:83`: notify on club page progress.
- Modify `server/index.ts`: `/api/me` parallel, ETag on `/api/club` `/api/meta` `/api/sets`, `/api/sets` via `readShared`, `/api/stream`, long-poll `/api/jobs/next`, notify on meter pause.

Extension
- Modify `extension/bridge.js`, `extension/background.js`, `extension/manifest.json`, `extension/release.json`.

Site
- Modify `web/src/Root.tsx`: prefetch App, skeleton boot, lazy legal / changelog / guides, cache clear on sign-out, pass `userId`.
- Create `web/src/components/BootSkeleton.tsx`.
- Modify `web/src/i18n.tsx`: `en` eager, `ro` / `it` on demand.
- Create `web/src/cache.ts` + `web/src/cache.test.ts`.
- Create `web/src/sse.ts` + `web/src/sse.test.ts`: SSE parser + refetch plan (pure).
- Create `web/src/useLive.ts`: stream hook with fallback.
- Create `web/src/activity.ts` + `web/src/activity.test.ts`: pure activity rules.
- Create `web/src/components/Activity.tsx`: indicator + panel + toast.
- Modify `web/src/App.tsx`, `web/src/api.ts`, `web/src/components/SetList.tsx`, `web/src/components/Pitch.tsx`, `web/src/components/PointsArea.tsx`, `web/src/styles.css`.
- Delete `web/src/components/ClubSyncModal.tsx` (replaced by `Activity.tsx`); keep `web/src/club-sync.ts`.
- Modify locales, `shared/changelog.ts`, `docs/api.md`, `docs/architecture.md`, `docs/deploy.md`.

---

### Task 1: In-memory read cache and safe writes in `store.ts`

**Files:**
- Modify: `server/store.ts:23-48`
- Test: `server/store.test.ts` (create)

**Interfaces:**
- Produces: `readShared<T>(key: string): Promise<Readonly<Cached<T>> | null>`. The returned object is shared: callers must never mutate it.
- Produces: `writeCache` unchanged signature; now serialized per key, unique tmp file, updates the shared entry.

- [ ] **Step 1: Write the failing test**

```ts
// server/store.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'fcs-store-'));
process.env.SBC_DATA_DIR = dir;
const { readShared, writeCache, readCache } = await import('./store.js');

test('readShared: missing key is null, a later write is visible', async () => {
  assert.equal(await readShared('t/a'), null);
  await writeCache('t/a', [1, 2]);
  assert.deepEqual((await readShared<number[]>('t/a'))?.data, [1, 2]);
});

test('readShared: a write replaces the shared entry without a disk read', async () => {
  await writeCache('t/b', { v: 1 });
  assert.equal((await readShared<{ v: number }>('t/b'))?.data.v, 1);
  await writeCache('t/b', { v: 2 });
  await rm(join(dir, 't/b.json')); // memory must answer now
  assert.equal((await readShared<{ v: number }>('t/b'))?.data.v, 2);
});

test('writeCache: parallel writes to one key all succeed, last one wins, no tmp left', async () => {
  await Promise.all(Array.from({ length: 20 }, (_, i) => writeCache('t/c', i)));
  assert.equal((await readCache<number>('t/c'))?.data, 19);
  assert.deepEqual((await readdir(join(dir, 't'))).filter((f) => f.endsWith('.tmp')), []);
});

test.after(() => rm(dir, { recursive: true, force: true }));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --import tsx --test server/store.test.ts`
Expected: FAIL, `readShared` is not exported.

- [ ] **Step 3: Implement**

In `server/store.ts`, add `import { randomBytes } from 'node:crypto';` and replace `readCache` / `writeCache` with:

```ts
export async function readCache<T>(key: string): Promise<Cached<T> | null> {
  try {
    return JSON.parse(await readFile(file(key), 'utf8')) as Cached<T>;
  } catch {
    return null;
  }
}

// Read-through copy of the last parsed entry per key, for hot read-only paths (status poll, set list,
// club, solve). Shared between callers: never mutate what readShared returns; use readCache to edit.
const shared = new Map<string, Cached<unknown> | null>();
const generation = new Map<string, number>(); // bumped on every write: a slow read never overwrites a newer write
const SHARED_MAX = 400;

function share(key: string, entry: Cached<unknown> | null) {
  shared.delete(key);
  shared.set(key, entry);
  if (shared.size > SHARED_MAX) shared.delete(shared.keys().next().value as string);
}

export async function readShared<T>(key: string): Promise<Readonly<Cached<T>> | null> {
  if (shared.has(key)) {
    const hit = shared.get(key) as Cached<T> | null;
    share(key, hit); // most recently used
    return hit;
  }
  const gen = generation.get(key) ?? 0;
  const entry = await readCache<T>(key);
  if ((generation.get(key) ?? 0) === gen) share(key, entry);
  return entry;
}

const writing = new Map<string, Promise<unknown>>();

/** `fetchedAt` defaults to now; pass the old one for local edits that are not a fresh fetch. */
export function writeCache<T>(key: string, data: T, fetchedAt = Date.now()): Promise<Cached<T>> {
  // one write per key at a time, in call order
  const run = (writing.get(key) ?? Promise.resolve()).catch(() => {}).then(() => write(key, data, fetchedAt));
  writing.set(key, run);
  void run.finally(() => {
    if (writing.get(key) === run) writing.delete(key);
  }).catch(() => {});
  return run;
}

async function write<T>(key: string, data: T, fetchedAt: number): Promise<Cached<T>> {
  const entry: Cached<T> = { fetchedAt, data };
  const path = file(key);
  await mkdir(dirname(path), { recursive: true });
  // write-then-rename so a crash never leaves a half-written cache file; a unique tmp name per write
  const tmp = `${path}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`;
  await writeFile(tmp, JSON.stringify(entry));
  await rename(tmp, path);
  generation.set(key, (generation.get(key) ?? 0) + 1);
  share(key, entry);
  for (const fn of listeners) {
    try {
      fn(key, data);
    } catch (err) {
      console.warn(`[store] cache write listener failed for ${key}:`, err);
    }
  }
  return entry;
}
```

- [ ] **Step 4: Run tests**

Run: `node --import tsx --test server/store.test.ts && npm test`
Expected: PASS (all suites).

- [ ] **Step 5: Commit**

```bash
git pull --rebase
git add server/store.ts server/store.test.ts
git commit -m "perf(store): shared read cache, unique tmp files, one write per key at a time"
```

---

### Task 2: Cheaper hot endpoints (status, sets, club, me) + ETags

**Files:**
- Create: `server/etag.ts`, `server/etag.test.ts`
- Modify: `server/sync.ts:47-63` (`getStatus`), `server/sync.ts:119-124` (`clubButtonAt`)
- Modify: `server/solve-run.ts:21-32` (`clubPlayers`)
- Modify: `server/index.ts:251-264` (`/api/me`), `:559-570` (`/api/meta`, `/api/club`), `:649-665` (`/api/sets`)

**Interfaces:**
- Consumes: `readShared` (Task 1).
- Produces: `etagOf(json: string): string`, `notModified(ifNoneMatch: string | string[] | undefined, etag: string): boolean`; `sendTagged(req, reply, body)` local to `index.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// server/etag.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { etagOf, notModified } from './etag.js';

test('etagOf: stable, quoted, differs per body', () => {
  assert.equal(etagOf('{"a":1}'), etagOf('{"a":1}'));
  assert.notEqual(etagOf('{"a":1}'), etagOf('{"a":2}'));
  assert.match(etagOf('x'), /^"[\w-]{22}"$/);
});

test('notModified: exact, weak, list, missing', () => {
  const tag = etagOf('x');
  assert.equal(notModified(tag, tag), true);
  assert.equal(notModified(`W/${tag}`, tag), true);
  assert.equal(notModified(`"zzz", ${tag}`, tag), true);
  assert.equal(notModified(undefined, tag), false);
  assert.equal(notModified('"other"', tag), false);
});
```

- [ ] **Step 2: Run it, expect FAIL** (`Cannot find module './etag.js'`)

Run: `node --import tsx --test server/etag.test.ts`

- [ ] **Step 3: Implement `server/etag.ts`**

```ts
// ETags for the big dashboard GETs (/api/club, /api/meta, /api/sets): the browser revalidates and an
// unchanged answer costs a 304 with no body.
import { createHash } from 'node:crypto';

export const etagOf = (json: string) => `"${createHash('sha1').update(json).digest('base64url').slice(0, 22)}"`;

export function notModified(ifNoneMatch: string | string[] | undefined, etag: string): boolean {
  const raw = Array.isArray(ifNoneMatch) ? ifNoneMatch.join(',') : ifNoneMatch ?? '';
  return raw.split(',').some((t) => t.trim().replace(/^W\//, '') === etag);
}
```

- [ ] **Step 4: Use `readShared` on read-only paths**

`server/sync.ts` `getStatus` becomes (also computes the club size always: it feeds the job view in Task 3):

```ts
export async function getStatus(acc: Account): Promise<SyncStatus> {
  const jobs = acc.clientMode ? jobStatus(acc) : null;
  const clubJob = jobs ? jobs.club : running.get(acc.id) === 'club' ? { state: 'running' as const, loaded: 0 } : null;
  const [club, unassigned, sets] = await Promise.all([
    readShared<unknown[]>(acc.key('club')),
    readShared<unknown[]>(acc.key('unassigned')),
    readShared(acc.key('sets')),
  ]);
  return {
    club: clubJob && { ...clubJob, expected: club?.data.length || null },
    ea: await acc.meter.summary(),
    clubNextAt: await clubButtonAt(acc),
    running: jobs ? jobs.running : running.get(acc.id) ?? null,
    error: jobs ? jobs.error : errors.get(acc.id) ?? null,
    errorCode: jobs ? jobs.errorCode : null,
    editedAt: edited.get(acc.id) ?? null,
    unassigned: unassigned?.data.length ?? 0,
    clubAt: club?.fetchedAt ?? null,
    sbcAt: sets?.fetchedAt ?? null,
    sbcNextAt: acc.clientMode ? await sbcNextAt(acc) : null,
  };
}
```

In `clubButtonAt`, change `readCache(acc.key('club'))` to `readShared(acc.key('club'))`. Import `readShared` from `./store.js`.

`server/solve-run.ts` `clubPlayers` (the `toPlayer` map is memoized per shared entry + meta; the arrays are fresh per call so callers may still sort / filter them):

```ts
const mapped = new WeakMap<object, { meta: object; players: Player[] }>();
function playersOf(entry: Readonly<Cached<ClubItem[]>> | null, meta: Meta, storage = false): Player[] {
  if (!entry) return [];
  const hit = mapped.get(entry);
  if (hit && hit.meta === meta) return [...hit.players];
  const players = entry.data.map((i) => (storage ? { ...toPlayer(i, meta), inStorage: true } : toPlayer(i, meta)));
  mapped.set(entry, { meta, players });
  return [...players];
}

export async function clubPlayers(acc: Account) {
  const meta = await metaFor(acc);
  const [club, storage, squad] = await Promise.all([
    readShared<ClubItem[]>(acc.key('club')),
    readShared<ClubItem[]>(acc.key('storage')),
    readShared<ActiveSquad>(acc.key('squad')),
  ]);
  return {
    fetchedAt: club?.fetchedAt ?? null,
    players: playersOf(club, meta),
    storage: playersOf(storage, meta, true),
    storageAt: storage?.fetchedAt ?? null,
    squad: squad?.data ?? null,
  };
}
```

Imports: `readShared, type Cached` from `./store.js`; `Player` = the return type of `toPlayer` (`type Player = ReturnType<typeof toPlayer>`); `Meta` = `Awaited<ReturnType<typeof metaFor>>`. Before relying on this, grep callers of `clubPlayers(` (`server/index.ts`, `solve-run.ts`, `server/discord/`, `gallery/`, `objectives/`): confirm none mutate a player object in place (`p.x =`); if one does, give that caller `structuredClone` of its players.

- [ ] **Step 5: `/api/me` in parallel, ETags, sets via `readShared`**

In `server/index.ts` add near the other helpers:

```ts
import { etagOf, notModified } from './etag.js';

/** JSON with an ETag; an unchanged answer is a 304 with no body (the browser keeps its copy). */
function sendTagged(req: FastifyRequest, reply: FastifyReply, body: unknown) {
  const json = JSON.stringify(body);
  const tag = etagOf(json);
  reply.header('ETag', tag).header('Cache-Control', 'private, no-cache').header('Vary', 'Authorization, X-Persona');
  if (notModified(req.headers['if-none-match'], tag)) return reply.code(304).send();
  return reply.type('application/json; charset=utf-8').send(json);
}
```

`/api/me`:

```ts
app.get('/api/me', async (req) => {
  const userId = await siteUser(req);
  const [[row], ids, admin, plan, prefs, billing] = await Promise.all([
    db.select({ email: users.email, onboardedAt: users.onboardedAt, linkBlockedAt: users.linkBlockedAt }).from(users).where(eq(users.id, userId)),
    personasOf(userId),
    isAdmin(userId),
    planFor(userId),
    prefsOf(userId),
    billingOf(userId),
  ]);
  const personas = ids.flatMap((id) => {
    const a = accountById(id);
    return a ? [a.toJSON()] : [];
  });
  return { user: { id: userId, email: row?.email ?? '' }, personas, admin, plan, prefs, onboarding: { done: !!row?.onboardedAt },
    billing, // Paddle subscription, null without one or while billing is off
    // an EA account of mine that another user has since proved with EA: why the setup screen is back
    takenOver: personas.length === 0 && (await takenOverFrom(userId)),
    // a link refused for the persona limit (cleared by any successful link): who to write to
    linkBlocked: row?.linkBlockedAt ? { at: row.linkBlockedAt.getTime(), limit: PERSONA_USER_LIMIT, supportEmail: process.env.SUPPORT_EMAIL ?? null } : null };
});
```

`/api/meta` → `return sendTagged(req, reply, { names: …, formations: …, rarities: …, contentBase: … })` (handler gets `(req, reply)`).
`/api/club` → `app.get('/api/club', async (req, reply) => sendTagged(req, reply, await clubPlayers(await siteAccount(req))));`
`/api/sets`: use `readShared` for both `sets` and each `challenges/<setId>`, and end with `return sendTagged(req, reply, { fetchedAt: sets?.fetchedAt ?? null, categories });`.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.
Manual: with `npm run dev` running and signed in, in DevTools Network reload the dashboard twice: the second `/api/club`, `/api/meta`, `/api/sets` show `304`. The page still shows the club and the sets.

- [ ] **Step 7: Commit**

```bash
git pull --rebase
git add server/etag.ts server/etag.test.ts server/sync.ts server/solve-run.ts server/index.ts
git commit -m "perf(api): shared cache on hot reads, parallel /api/me, ETags on club, meta and sets"
```

---

### Task 3: Job progress model

**Files:**
- Create: `server/job-view.ts`, `server/job-view.test.ts`
- Modify: `server/jobs.ts` (Job fields, `markCall`, `nextJob`, `finishJob`, new `jobList`, `tabReady`)
- Modify: `server/sync.ts` (`SyncStatus.jobs`, `SyncStatus.graceUntil`, `getStatus`)
- Modify: `web/src/api.ts:164-177` (`SyncStatus` type)

**Interfaces:**
- Produces (server + mirrored in `web/src/api.ts`):

```ts
export type JobState = 'waitingTab' | 'waitingLogin' | 'queued' | 'running' | 'paused' | 'done' | 'failed';
export interface JobView {
  id: string;
  kind: 'club' | 'sbc' | 'challenges' | 'challengeSquad' | 'academy';
  state: JobState;
  done: number;          // club: players loaded; challenges: sets read; others 0
  total: number | null;  // club: last club size (estimate); challenges: sets in the job; others null
  estimated: boolean;    // total is a guess (club)
  at: number;            // finished, else started, else queued (ms)
  error: string | null;
  notStarted: boolean;
  resumeAt: number | null; // paused: when EA's pause ends
}
// SyncStatus gains: jobs: JobView[]; graceUntil: number | null
```

- Produces: `jobList(acc: Account): Job[]` (snapshot of the queue), `tabReady(acc: Account): boolean`.

- [ ] **Step 1: Write the failing test**

```ts
// server/job-view.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jobView, jobViews, type JobLike } from './job-view.js';

const ctx = { tabOpen: true, tabReady: true, pausedUntil: null, clubExpected: 1200 };
const base: JobLike = { id: 'a', kind: 'club', status: 'queued', createdAt: 1000 };

test('queued job: waits for the tab, then for the EA login, else queued', () => {
  assert.equal(jobView(base, { ...ctx, tabOpen: false }).state, 'waitingTab');
  assert.equal(jobView(base, { ...ctx, tabReady: false }).state, 'waitingLogin');
  assert.equal(jobView(base, ctx).state, 'queued');
});

test('EA pause wins over running and carries the resume time', () => {
  const v = jobView({ ...base, status: 'running', startedAt: 2000 }, { ...ctx, pausedUntil: 9000 });
  assert.equal(v.state, 'paused');
  assert.equal(v.resumeAt, 9000);
});

test('club progress: players loaded of the last club size, estimated', () => {
  const v = jobView({ ...base, status: 'running', startedAt: 2000, clubLoaded: 455 }, ctx);
  assert.deepEqual([v.done, v.total, v.estimated], [455, 1200, true]);
});

test('challenges progress: sets read of sets asked, capped; done shows full', () => {
  const run = jobView({ ...base, kind: 'challenges', status: 'running', setIds: [1, 2, 3], calls: 5 }, ctx);
  assert.deepEqual([run.done, run.total, run.estimated], [3, 3, false]);
  const fin = jobView({ ...base, kind: 'challenges', status: 'done', setIds: [1, 2], calls: 1, finishedAt: 5000 }, ctx);
  assert.deepEqual([fin.state, fin.done, fin.at], ['done', 2, 5000]);
});

test('failed job keeps its error and notStarted', () => {
  const v = jobView({ ...base, status: 'failed', error: 'tab closed', notStarted: true, finishedAt: 7000 }, ctx);
  assert.deepEqual([v.state, v.error, v.notStarted], ['failed', 'tab closed', true]);
});

test('jobViews: active first (oldest first), then the newest finished per kind, at most 6', () => {
  const jobs: JobLike[] = [
    { ...base, id: 'old-club', status: 'done', finishedAt: 100 },
    { ...base, id: 'new-club', status: 'done', finishedAt: 200 },
    { ...base, id: 'sbc', kind: 'sbc', status: 'running', createdAt: 50, startedAt: 60 },
    { ...base, id: 'ch', kind: 'challenges', status: 'queued', createdAt: 70, setIds: [1] },
  ];
  assert.deepEqual(jobViews(jobs, ctx).map((v) => v.id), ['sbc', 'ch', 'new-club']);
});
```

- [ ] **Step 2: Run, expect FAIL** (`Cannot find module './job-view.js'`)

Run: `node --import tsx --test server/job-view.test.ts`

- [ ] **Step 3: Implement `server/job-view.ts`**

```ts
// Pure: what the site shows for each sync job (activity panel, top bar): its state and progress.
export type JobKindView = 'club' | 'sbc' | 'challenges' | 'challengeSquad' | 'academy';
export type JobState = 'waitingTab' | 'waitingLogin' | 'queued' | 'running' | 'paused' | 'done' | 'failed';

export interface JobLike {
  id: string;
  kind: JobKindView;
  status: 'queued' | 'running' | 'done' | 'failed';
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
  notStarted?: boolean;
  setIds?: number[];
  clubLoaded?: number;
  calls?: number;
}

export interface JobCtx {
  tabOpen: boolean;
  tabReady: boolean;
  pausedUntil: number | null;
  clubExpected: number | null;
}

export interface JobView {
  id: string;
  kind: JobKindView;
  state: JobState;
  done: number;
  total: number | null;
  estimated: boolean;
  at: number;
  error: string | null;
  notStarted: boolean;
  resumeAt: number | null;
}

export function jobView(j: JobLike, ctx: JobCtx): JobView {
  const active = j.status === 'queued' || j.status === 'running';
  const state: JobState =
    !active ? j.status === 'done' ? 'done' : 'failed'
    : ctx.pausedUntil ? 'paused'
    : j.status === 'running' ? 'running'
    : !ctx.tabOpen ? 'waitingTab'
    : !ctx.tabReady ? 'waitingLogin'
    : 'queued';
  const total = j.kind === 'challenges' ? j.setIds?.length ?? null : j.kind === 'club' ? ctx.clubExpected : null;
  const done =
    j.kind === 'club' ? j.clubLoaded ?? 0
    : j.kind === 'challenges' ? state === 'done' ? total ?? 0 : Math.min(j.calls ?? 0, total ?? 0)
    : 0;
  return {
    id: j.id,
    kind: j.kind,
    state,
    done,
    total,
    estimated: j.kind === 'club' && total !== null,
    at: j.finishedAt ?? j.startedAt ?? j.createdAt,
    error: state === 'failed' ? j.error ?? null : null,
    notStarted: !!j.notStarted,
    resumeAt: state === 'paused' ? ctx.pausedUntil : null,
  };
}

/** Active jobs first (oldest first), then the newest finished job of each kind; at most 6 rows. */
export function jobViews(jobs: JobLike[], ctx: JobCtx): JobView[] {
  const active = jobs.filter((j) => j.status === 'queued' || j.status === 'running').sort((a, b) => a.createdAt - b.createdAt);
  const finished = new Map<JobKindView, JobLike>();
  for (const j of jobs) {
    if (j.status !== 'done' && j.status !== 'failed') continue;
    const prev = finished.get(j.kind);
    if (!prev || (j.finishedAt ?? 0) > (prev.finishedAt ?? 0)) finished.set(j.kind, j);
  }
  const done = [...finished.values()].filter((j) => !active.some((a) => a.kind === j.kind)).sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0));
  return [...active, ...done].slice(0, 6).map((j) => jobView(j, ctx));
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `node --import tsx --test server/job-view.test.ts`

- [ ] **Step 5: Feed it from `jobs.ts` and `getStatus`**

`server/jobs.ts`:
- `Job` gets `finishedAt?: number;` and `calls?: number; // EA requests the page made for this job (challenges: one per set)`.
- New map `const lastReady = new Map<number, boolean>();`. In `nextJob(acc, canRun)`, right after `lastPoll.set(...)`, add `lastReady.set(acc.id, canRun);`.
- Export `export const tabReady = (acc: Account) => lastReady.get(acc.id) ?? true;` and `export const jobList = (acc: Account): Job[] => [...queueOf(acc)];`.
- `markCall` becomes:

```ts
export function markCall(acc: Account, job: Job) {
  job.calls = (job.calls ?? 0) + 1;
  if (job.calledAt) return;
  job.calledAt = Date.now();
  if (job.kind === 'club') lastClubCall.set(acc.id, job.calledAt);
}
```

- In `finishJob`, next to `job.status = ok ? 'done' : 'failed';` add `job.finishedAt = Date.now();`. In `queueOf` where an expired job is failed, add `j.finishedAt = now;`.

`server/sync.ts`:
- `SyncStatus` gets `jobs: JobView[];` and `graceUntil: number | null; // a fresh web app session: the first syncs wait for it to finish loading`.
- In `getStatus`, after the `Promise.all`, compute:

```ts
  const ea = await acc.meter.summary();
  const graceEnd = acc.info.sidUpdatedAt + SESSION_GRACE_MS;
  const jobViewsNow = acc.clientMode
    ? jobViews(jobList(acc), { tabOpen: webAppOpen(acc), tabReady: tabReady(acc), pausedUntil: ea.pausedUntil, clubExpected: club?.data.length || null })
    : [];
```

and return `ea`, `jobs: jobViewsNow`, `graceUntil: acc.clientMode && graceEnd > Date.now() ? graceEnd : null`. Move `const SESSION_GRACE_MS = 20 * 1000;` above `getStatus` (it is used lower in the file too). Imports: `jobViews, type JobView` from `./job-view.js`; `jobList, tabReady` from `./jobs.js`.

`web/src/api.ts`: add the `JobState`, `JobView` types (copy of the server ones, as above) and add to `SyncStatus`: `jobs: JobView[]; graceUntil: number | null;`.

- [ ] **Step 6: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git pull --rebase
git add server/job-view.ts server/job-view.test.ts server/jobs.ts server/sync.ts web/src/api.ts
git commit -m "feat(sync): per-job state and progress in the sync status"
```

---

### Task 4: Live bus and `GET /api/stream`

**Files:**
- Create: `server/live.ts`, `server/live.test.ts`
- Modify: `server/jobs.ts` (notify), `server/sync.ts` (`markEdited` notifies), `server/events.ts:83` (notify), `server/index.ts` (route, meter pause notify)

**Interfaces:**
- Produces: `subscribe(personaId: number, fn: (keys: string[]) => void): () => void`, `notify(personaId: number, keys?: string[]): void`, `keyOwner(key: string): { personaId: number; name: string } | null`, `sseFrame(event: string, data: unknown): string`, `takeStream(userId: string): boolean`, `dropStream(userId: string): void`, `MAX_STREAMS = 3`.
- Wire format (`text/event-stream`): `event: status` + `data: {"account":…,"sync":SyncStatus,"extension":…}` (same body as `GET /api/status`); `event: changed` + `data: {"keys":["club","challenges/123"]}`; `: ping` comment every 25 s.

- [ ] **Step 1: Write the failing test**

```ts
// server/live.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keyOwner, sseFrame, subscribe, notify, takeStream, dropStream, MAX_STREAMS } from './live.js';

test('keyOwner: account keys only', () => {
  assert.deepEqual(keyOwner('accounts/42/club'), { personaId: 42, name: 'club' });
  assert.deepEqual(keyOwner('accounts/42/challenges/9001'), { personaId: 42, name: 'challenges/9001' });
  assert.equal(keyOwner('meta/global'), null);
  assert.equal(keyOwner('accounts/x/club'), null);
});

test('sseFrame: event + one data line', () => {
  assert.equal(sseFrame('changed', { keys: ['club'] }), 'event: changed\ndata: {"keys":["club"]}\n\n');
});

test('notify reaches only that persona, unsubscribe stops it', () => {
  const got: string[][] = [];
  const off = subscribe(1, (k) => got.push(k));
  subscribe(2, () => assert.fail('wrong persona'));
  notify(1, ['club']);
  off();
  notify(1, ['sets']);
  assert.deepEqual(got, [['club']]);
});

test('stream slots: at most MAX_STREAMS per user', () => {
  for (let i = 0; i < MAX_STREAMS; i++) assert.equal(takeStream('u'), true);
  assert.equal(takeStream('u'), false);
  dropStream('u');
  assert.equal(takeStream('u'), true);
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `node --import tsx --test server/live.test.ts`

- [ ] **Step 3: Implement `server/live.ts`**

```ts
// Live updates for the site: a persona's cache or jobs changed, pushed to its open dashboards over
// GET /api/stream (server-sent events). In memory only: a restart drops the streams and the site reconnects.
import { onCacheWrite } from './store.js';

type Listener = (keys: string[]) => void;
const subs = new Map<number, Set<Listener>>();

export function subscribe(personaId: number, fn: Listener): () => void {
  let set = subs.get(personaId);
  if (!set) subs.set(personaId, (set = new Set()));
  set.add(fn);
  return () => {
    set!.delete(fn);
    if (!set!.size) subs.delete(personaId);
  };
}

/** Something about this persona changed; `keys` are cache keys under accounts/<id>/ (empty: only the status). */
export function notify(personaId: number, keys: string[] = []) {
  for (const fn of subs.get(personaId) ?? []) fn(keys);
}

export function keyOwner(key: string): { personaId: number; name: string } | null {
  const m = /^accounts\/(\d+)\/(.+)$/.exec(key);
  return m ? { personaId: Number(m[1]), name: m[2] } : null;
}

export const sseFrame = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

export const MAX_STREAMS = 3;
const open = new Map<string, number>();
export function takeStream(userId: string): boolean {
  const n = open.get(userId) ?? 0;
  if (n >= MAX_STREAMS) return false;
  open.set(userId, n + 1);
  return true;
}
export function dropStream(userId: string) {
  const n = (open.get(userId) ?? 1) - 1;
  if (n > 0) open.set(userId, n);
  else open.delete(userId);
}

onCacheWrite((key) => {
  const o = keyOwner(key);
  if (o) notify(o.personaId, [o.name]);
});
```

- [ ] **Step 4: Run, expect PASS**

Run: `node --import tsx --test server/live.test.ts`

- [ ] **Step 5: Notify on job and edit changes**

Add `import { notify } from './live.js';` and call `notify(acc.id)`:
- `server/jobs.ts`: at the end of `enqueue` (after `q.push(job)`), in `nextJob` when a job is handed out (inside `if (job) { … }`), at the end of `markCall`, in `finishJob` right after `job.finishedAt = Date.now();`.
- `server/sync.ts` `markEdited`: after `edited.set(...)`, `notify(acc.id, ['edited']);`.
- `server/events.ts:83`: after `job.clubLoaded = loadedPlayers(job.clubPages);`, `notify(acc.id);`.
- `server/index.ts` `/api/jobs/:id/call`: after `if (THROTTLE_CODES.includes(status ?? 0)) acc.meter.pause();` make it `{ acc.meter.pause(); notify(acc.id); }`.

- [ ] **Step 6: The route**

In `server/index.ts` (next to `/api/status`):

```ts
/** Live dashboard updates (server-sent events): the status on change, which cache keys changed, a heartbeat. */
app.get('/api/stream', async (req, reply) => {
  const { userId, acc } = await siteContext(req);
  if (!takeStream(userId)) throw new SessionError('Too many open FC Solver tabs.', 429, 'tooManyStreams');
  reply.hijack();
  const res = reply.raw;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no', // nginx: pass every event through at once
    'X-Content-Type-Options': 'nosniff',
  });
  let last = '';
  let pending = new Set<string>();
  let timer: NodeJS.Timeout | null = null;
  const push = async () => {
    timer = null;
    const keys = [...pending];
    pending = new Set();
    if (keys.length) res.write(sseFrame('changed', { keys }));
    const body = JSON.stringify({ account: acc, sync: await getStatus(acc), extension: await latestExtension() });
    if (body !== last) {
      last = body;
      res.write(`event: status\ndata: ${body}\n\n`);
    }
  };
  // a burst of writes (a club page, its unassigned fix-up, the job progress) goes out as one update
  const schedule = (keys: string[]) => {
    for (const k of keys) pending.add(k);
    timer ??= setTimeout(() => void push().catch(() => {}), 300);
  };
  const off = subscribe(acc.id, schedule);
  const beat = setInterval(() => res.write(': ping\n\n'), 25_000); // Cloudflare drops idle streams after 100 s
  const tick = setInterval(() => schedule([]), 15_000); // jobs time out and cooldowns end without a write
  const end = setTimeout(() => res.end(), 5 * 60_000); // the site reconnects with a fresh Clerk token
  req.raw.on('close', () => {
    off();
    clearInterval(beat);
    clearInterval(tick);
    clearTimeout(end);
    if (timer) clearTimeout(timer);
    dropStream(userId);
  });
  void push().catch(() => {});
});
```

Imports: `subscribe, sseFrame, takeStream, dropStream, notify` from `./live.js`; `siteContext` from `./auth.js` if not already imported.

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test`
Expected: PASS.
Manual (dev running, signed in): in the DevTools console of the dashboard:

```js
const t = await window.Clerk.session.getToken();
const r = await fetch('/api/stream', { headers: { Authorization: `Bearer ${t}`, 'X-Persona': localStorage.getItem('sbc-active') } });
const rd = r.body.getReader(); for (let i = 0; i < 2; i++) console.log(new TextDecoder().decode((await rd.read()).value));
```

Expected: an `event: status` frame at once. (If `sbc-active` is not the key name, read the `ACTIVE` constant at the top of `App.tsx`.)

- [ ] **Step 8: Commit**

```bash
git pull --rebase
git add server/live.ts server/live.test.ts server/jobs.ts server/sync.ts server/events.ts server/index.ts
git commit -m "feat(api): live dashboard stream with status and changed cache keys"
```

---

### Task 5: Jobs go out at once (order fix + long-poll) and extension 1.0.3

**Files:**
- Modify: `server/jobs.ts` (`markPoll`, `wake`, `waitForWork`, `restLeft`; wake in `enqueue` / `finishJob`)
- Modify: `server/index.ts:478-497` (`/api/jobs/next`)
- Modify: `extension/bridge.js:20-45`, `extension/background.js:207-224,327-341`, `extension/manifest.json:4`, `extension/release.json`

**Interfaces:**
- Produces: `markPoll(acc)`, `wake(acc)`, `waitForWork(acc, ms): Promise<void>`, `restLeft(acc): number`.
- `/api/jobs/next` gains query `wait=1` and answers `{ job, again }` (`again`: ms the extension waits before its next poll).

- [ ] **Step 1: Wait / wake in `jobs.ts`**

```ts
const waiters = new Map<number, Set<() => void>>();

/** A job may be ready: answer the extension's held /api/jobs/next now. */
export function wake(acc: Account) {
  const w = waiters.get(acc.id);
  if (!w) return;
  waiters.delete(acc.id);
  for (const f of w) f();
}

/** Resolves on wake() or after `ms`. */
export function waitForWork(acc: Account, ms: number): Promise<void> {
  return new Promise((resolve) => {
    let set = waiters.get(acc.id);
    if (!set) waiters.set(acc.id, (set = new Set()));
    const done = () => {
      clearTimeout(t);
      set!.delete(done);
      resolve();
    };
    const t = setTimeout(done, Math.max(0, ms));
    set.add(done);
  });
}

/** The tab polled: it counts as open from now (before a visit queues anything). */
export const markPoll = (acc: Account) => lastPoll.set(acc.id, Date.now());

/** How long the breather after the last job still runs (0: none). */
export const restLeft = (acc: Account) => Math.max(0, REST_BETWEEN_JOBS - (Date.now() - (lastFinished.get(acc.id) ?? 0)));
```

Call `wake(acc)` at the end of `enqueue` (after `q.push(job)`), and in `finishJob` after `lastFinished.set(...)`: `setTimeout(() => wake(acc), REST_BETWEEN_JOBS + 50);`.

- [ ] **Step 2: The route**

```ts
const LONG_POLL_MS = 25_000; // under nginx's 60 s proxy timeout and the extension's 30 s live window

/** Next sync job for the web app tab (null when idle). Polling also marks the tab as open. */
app.get('/api/jobs/next', async (req) => {
  const acc = account(req);
  if (!acc.clientMode) return { job: null, again: 5000 };
  try {
    await acc.meter.check();
  } catch {
    return { job: null, again: 5000 }; // over budget or paused: the queue waits
  }
  const { visible, ready, wait } = req.query as { visible?: string; ready?: string; wait?: string };
  // the extension's own poll after /api/hello (also sent on an FC Solver site visit, with no web
  // app tab open): not a tab, so it takes no job and does not mark the web app as open
  if (!isTabPoll(acc.info.extVersion, ready)) return { job: null, again: 5000 };
  const returned = webAppReturned(acc, visible === undefined ? undefined : visible === '1');
  markPoll(acc); // open from now, so the visit below may queue
  // came (back) to the web app: SBCs done elsewhere in the meantime show up, handed out in this same answer
  if (returned) await refreshOnVisit(acc);
  const canRun = ready !== '0'; // extension 0.8.8+: a web app tab not logged in to EA gets no job
  // extension 1.0.3+: hold the request until a job is ready (or 25 s), so a queued sync starts at once
  const hold = wait === '1' && canRun;
  const gone = () => req.raw.socket?.destroyed ?? false;
  const until = Date.now() + LONG_POLL_MS;
  let job = nextJob(acc, canRun);
  while (!job && hold && Date.now() < until && !gone()) {
    await waitForWork(acc, Math.min(until - Date.now(), restLeft(acc) || LONG_POLL_MS));
    if (gone()) break;
    try {
      await acc.meter.check();
    } catch {
      break;
    }
    job = nextJob(acc, canRun);
  }
  return { job: job && { id: job.id, kind: job.kind, setIds: job.setIds, challengeId: job.challengeId }, again: hold ? 1000 : 5000 };
});
```

Imports from `./jobs.js`: `markPoll, waitForWork, restLeft`.

- [ ] **Step 3: Extension**

`extension/background.js` `pollJobs(tabId, visible, ready)` → `pollJobs(tabId, visible, ready, wait)`; add after the `ready` line: `if (wait) q.set('wait', '1'); // 1.0.3+: the server holds the poll until a job is ready`. In the `poll` message handler pass `msg.wait === true && !syncPaused` as the fourth argument.

`extension/bridge.js` — replace `askForJob` and `poll`:

```js
function askForJob(done) {
  chrome.runtime.sendMessage({ type: 'poll', visible: !document.hidden, ready, wait: !document.hidden && ready }, (res) => {
    const r = chrome.runtime.lastError ? null : res;
    done?.(r);
    if (!r) return;
    if (r.needIdentity) window.postMessage({ source: 'fcs-bridge', kind: 'identify' }, window.location.origin);
    else if (r.job) {
      window.postMessage({ source: 'fcs-bridge', kind: 'job', job: r.job }, window.location.origin);
      syncStarted(r.job.kind);
    }
  });
}
// the next poll goes out once the answer is in: a held poll (1.0.3+) answers as soon as a job is ready
function poll() {
  try {
    askForJob((res) => setTimeout(poll, document.hidden ? 15000 : res?.again ?? 5000));
  } catch {
    /* the extension was reloaded or removed: this old copy stops until the page reloads */
  }
}
```

`extension/manifest.json`: `"version": "1.0.3"`. `extension/release.json`: add at the top `"1.0.3": ["Syncs start as soon as FC Solver asks for them, no more waiting for the next check"],`.

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test`
Manual: load the unpacked extension (1.0.3) with dev running and the EA web app open. In the dashboard press Club: the extension's "Syncing your club…" notice shows within ~1 s (was up to 5-10 s). In the server log no job is marked running without EA calls following (no "did not start the sync" errors). Reload the web app tab mid-idle: no error, polling resumes.

- [ ] **Step 5: Commit**

```bash
git pull --rebase
git add server/jobs.ts server/index.ts extension/bridge.js extension/background.js extension/manifest.json extension/release.json
git commit -m "feat(extension): sync jobs start at once (held poll, visit queues before handing out), 1.0.3"
```

---

### Task 6: Boot: App prefetch, skeleton, lighter first chunk

**Files:**
- Create: `web/src/components/BootSkeleton.tsx`
- Modify: `web/src/Root.tsx`, `web/src/i18n.tsx`, `web/src/styles.css`

**Interfaces:**
- Produces: `<BootSkeleton />` (no props), used as every `fallback` and the `!isLoaded` screen in `Root.tsx`.
- Produces: `I18nProvider` renders `<BootSkeleton />` until the active language's messages are loaded (English is always loaded).

- [ ] **Step 1: Skeleton component**

```tsx
// The app's shape while Clerk and the app code load: top bar, sidebar, a few set cards. No text, no spinner.
export function BootSkeleton() {
  return (
    <div className="boot boot-skeleton" aria-busy="true">
      <div className="sk-top" />
      <div className="sk-body">
        <div className="sk-side" />
        <div className="sk-grid">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="sk-card" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

CSS in `web/src/styles.css` next to `.boot`:

```css
.boot-skeleton { display: flex; flex-direction: column; gap: 16px; padding: 16px; min-height: 100dvh; }
.sk-top { height: 56px; border-radius: 14px; background: var(--panel); }
.sk-body { display: flex; gap: 16px; flex: 1; }
.sk-side { width: 240px; border-radius: 14px; background: var(--panel); }
.sk-grid { flex: 1; display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; align-content: start; }
.sk-card { height: 132px; border-radius: 14px; background: var(--panel); animation: sk-pulse 1.4s ease-in-out infinite; }
@keyframes sk-pulse { 50% { opacity: 0.55; } }
@media (max-width: 860px) { .sk-side { display: none; } }
@media (prefers-reduced-motion: reduce) { .sk-card { animation: none; } }
```

Use the existing panel/surface token name from `styles.css` (`grep -n "^  --" web/src/styles.css`); `--panel` above is a stand-in for it.

- [ ] **Step 2: Root**

In `web/src/Root.tsx`:
- Prefetch: replace `const App = lazy(() => import('./App'));` with

```tsx
const loadApp = () => import('./App');
// the dashboard's code downloads while Clerk loads, not after
if (window.location.pathname.startsWith('/dashboard')) void loadApp();
const App = lazy(loadApp);
```

- Make the signed-out / public extras lazy: `LegalPage` (keep `LegalLinks` eager only if it does not import `docs.ts`; check `web/src/legal/LegalPage.tsx` imports, else split `LegalLinks` into its own file `web/src/legal/LegalLinks.tsx`), `ChangelogPage`, `Guide`, `SetupGuide` via `lazy(() => import(...).then((m) => ({ default: m.X })))`, wrapped in `<Suspense fallback={<BootSkeleton />}>` where they render.
- Replace every `<div className="boot" aria-busy="true" />` with `<BootSkeleton />` (keep the ssoCallback one as is: it has content).

- [ ] **Step 3: Locales on demand**

`web/src/i18n.tsx`: keep `import { en } from './locales/en';`, remove the static `ro` / `it` imports, and:

```tsx
const loaders: Record<Exclude<Lang, 'en'>, () => Promise<Record<string, string>>> = {
  ro: () => import('./locales/ro').then((m) => m.ro),
  it: () => import('./locales/it').then((m) => m.it),
};
const dicts: Partial<Record<Lang, Record<string, string>>> = { en };
function loadLang(l: Lang): Promise<void> {
  if (dicts[l]) return Promise.resolve();
  return loaders[l as Exclude<Lang, 'en'>]().then((d) => void (dicts[l] = d));
}
// start fetching the saved language with the first script, in parallel with everything else
const first = initialLang();
void loadLang(first).catch(() => {});
```

`translate` uses `const d = dicts[lang] ?? dicts.en!;` and `dicts.en!` for fallbacks. `I18nProvider`:

```tsx
  const [lang, setLangState] = useState<Lang>(first);
  const [ready, setReady] = useState(() => !!dicts[first]);
  const setLang = useCallback((l: Lang) => {
    void loadLang(l).then(() => {
      setLangState(l);
      try {
        localStorage.setItem(STORE, l);
      } catch {
        /* keep it for this tab only */
      }
    });
  }, []);
  useEffect(() => {
    if (ready) return;
    void loadLang(lang).then(() => setReady(true), () => setReady(true)); // offline: English
  }, [lang, ready]);
  …
  if (!ready) return <BootSkeleton />;
```

`scripts/i18n-check.ts` imports the locale files directly; confirm it still runs (`npm run i18n:check`).

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test && npm run build && npm run i18n:check`
Expected: PASS; in the build output the `index-*.js` chunk is clearly smaller than 700 kB (note the number in the commit message body). Browser: hard reload `/dashboard` with Network throttled to "Fast 4G": skeleton instead of a blank screen; App chunk request starts before Clerk's `clerk.browser.js` finishes. Switch language ro → it → en: text switches without errors. Landing `/` and `/daily` still load.

- [ ] **Step 5: Commit**

```bash
git pull --rebase
git add web/src/components/BootSkeleton.tsx web/src/Root.tsx web/src/i18n.tsx web/src/styles.css web/src/legal
git commit -m "perf(web): skeleton boot, app code loads with Clerk, locales and legal pages on demand"
```

---

### Task 7: Last known state in the browser + parallel boot

**Files:**
- Create: `web/src/cache.ts`, `web/src/cache.test.ts`
- Modify: `web/src/Root.tsx` (clear on sign-out, pass `userId`), `web/src/App.tsx:92-98,199-275` (boot), `web/src/components/SetList.tsx:130`, locales

**Interfaces:**
- Produces:

```ts
export type CacheName = 'me' | 'data';
export const cacheKey: (userId: string, persona: number | null, name: CacheName) => string;
export const ownedBy: (key: string, userId: string) => boolean;
export function cacheGet<T>(key: string): Promise<T | undefined>;
export function cacheSet(key: string, value: unknown): void;           // fire and forget
export function cacheKeep(userId: string): Promise<void>;               // drop every other user's keys
export function cacheClear(): Promise<void>;
export interface AccountData { meta: Meta; club: ClubResponse; sets: SetsResponse; status: StatusResponse }
```

(`ClubResponse` / `SetsResponse` / `StatusResponse` = `Awaited<ReturnType<typeof api.club>>` etc.)
- `App` gets a new prop `userId: string`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/cache.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cacheKey, ownedBy } from './cache';

test('cacheKey: per user and persona', () => {
  assert.equal(cacheKey('user_1', 42, 'data'), 'user_1:42:data');
  assert.equal(cacheKey('user_1', null, 'me'), 'user_1:0:me');
});

test('ownedBy: only that user, never a prefix of another id', () => {
  assert.equal(ownedBy('user_1:42:data', 'user_1'), true);
  assert.equal(ownedBy('user_10:42:data', 'user_1'), false);
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `node --import tsx --test web/src/cache.test.ts`

- [ ] **Step 3: Implement `web/src/cache.ts`**

```ts
// Last known dashboard data per signed-in user and EA account (IndexedDB): drawn at once on open,
// then replaced by the network answer. Cleared on sign-out; another user's data is dropped on sign-in.
import type { api, Meta } from './api';

export type CacheName = 'me' | 'data';
export interface AccountData {
  meta: Meta;
  club: Awaited<ReturnType<typeof api.club>>;
  sets: Awaited<ReturnType<typeof api.sets>>;
  status: Awaited<ReturnType<typeof api.status>>;
}

export const cacheKey = (userId: string, persona: number | null, name: CacheName) => `${userId}:${persona ?? 0}:${name}`;
export const ownedBy = (key: string, userId: string) => key.startsWith(`${userId}:`);

const STORE = 'kv';
let db: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  db ??= new Promise((resolve) => {
    try {
      const r = indexedDB.open('fcs-cache', 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => resolve(r.result);
      r.onerror = r.onblocked = () => resolve(null);
    } catch {
      resolve(null); // private window / blocked storage: no cache, the app still works
    }
  });
  return db;
}

function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return open().then(
    (d) =>
      new Promise((resolve) => {
        if (!d) return resolve(undefined);
        try {
          const r = fn(d.transaction(STORE, mode).objectStore(STORE));
          r.onsuccess = () => resolve(r.result);
          r.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export const cacheGet = <T>(key: string) => run<T>('readonly', (s) => s.get(key) as IDBRequest<T>);
export function cacheSet(key: string, value: unknown) {
  void run('readwrite', (s) => s.put(value, key));
}
export async function cacheKeep(userId: string) {
  const keys = (await run<IDBValidKey[]>('readonly', (s) => s.getAllKeys())) ?? [];
  for (const k of keys) if (typeof k === 'string' && !ownedBy(k, userId)) void run('readwrite', (s) => s.delete(k));
}
export async function cacheClear() {
  await run('readwrite', (s) => s.clear());
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `node --import tsx --test web/src/cache.test.ts`

- [ ] **Step 5: Root wiring**

In `Root.tsx`: `const { isLoaded, isSignedIn, getToken, userId } = useAuth();` and

```tsx
  // a shared PC: nothing of the last user stays in this browser
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) void cacheClear();
    else if (userId) void cacheKeep(userId);
  }, [isLoaded, isSignedIn, userId]);
```

Render `<App route={route} navigate={navigate} userId={userId!} />`.

- [ ] **Step 6: App boot from cache, network in parallel**

In `App.tsx`:
1. Add prop `userId: string`; state `const [fresh, setFresh] = useState(false); // false: showing the cached copy, the network answer is on its way`.
2. Split `loadAccountData` into `applyData(d: AccountData)` (the existing setters) and:

```ts
  const loadAccountData = useCallback(async () => {
    const id = activeIdRef.current;
    const [meta, club, sets, status] = await Promise.all([api.meta(), api.club(), api.sets(), api.status()]);
    const d = { meta, club, sets, status };
    if (activeIdRef.current !== id) return; // the user switched account meanwhile
    applyData(d);
    setFresh(true);
    cacheSet(cacheKey(userId, id, 'data'), d);
  }, [applyData, userId]);
```

3. Split `loadMe` the same way: `applyMe(m: MeResponse)` holds everything from `setBilling(b)` to `setLinked(personas)` (the reward / plan logic included); `loadMe` = `const m = await api.me(); cacheSet(cacheKey(userId, null, 'me'), m); applyMe(m);` then the existing persona pick + `selectAccount`. `type MeResponse = Awaited<ReturnType<typeof api.me>>`.
4. In `selectAccount`, after the `readLocal` setters and before `await loadAccountData()`: `const cached = await cacheGet<AccountData>(cacheKey(userId, id, 'data')); if (cached && activeIdRef.current === id) applyData(cached);` and `setFresh(false)` at its start.
5. The boot effect becomes:

```ts
  useEffect(() => {
    let cancelled = false; // StrictMode runs this twice; only the live run may select
    const last = readLocal<number | null>(ACTIVE, null);
    void (async () => {
      // the last known state first, then the network for real
      const [me, data] = await Promise.all([
        cacheGet<MeResponse>(cacheKey(userId, null, 'me')),
        last ? cacheGet<AccountData>(cacheKey(userId, last, 'data')) : undefined,
      ]);
      if (cancelled) return;
      if (me) applyMe(me);
      if (me && data && last && me.personas.some((p) => p.personaId === last)) {
        setPersona(last);
        setActiveId(last);
        activeIdRef.current = last;
        applyData(data);
      }
    })();
    migrateLegacyKeys()
      .then(async () => {
        if (!cancelled) await loadMe();
      })
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [loadMe, applyMe, applyData, userId]);
```

`loadMe`'s persona pick compares `pick.personaId !== activeIdRef.current` before calling `selectAccount`; with the cached persona already active it must still fetch the data, so change that branch to: `else if (pick.personaId !== activeIdRef.current || !fresh) await selectAccount(pick.personaId);` (read `fresh` through a ref, `freshRef`, to keep `loadMe` stable).
`migrateLegacyKeys` (`web/src/legacy.ts:16-24`) already skips its POST when no old keys exist; leave it.
6. Top bar: next to the sync buttons, while `account && !fresh`, render `<small className="updating" aria-live="polite">{t('top.updating')}</small>`. Keys: en `'top.updating': 'Updating…'`, ro `'Se actualizează…'`, it `'Aggiornamento…'`.

- [ ] **Step 7: No false "No SBCs yet"**

`SetList.tsx` gets prop `loading: boolean` (App passes `!fresh`). Replace line 130 with:

```tsx
      {categories.length === 0 && loading && (
        <div className="set-grid" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="sk-card" />)}
        </div>
      )}
      {categories.length === 0 && !loading && <p className="muted">{t('sets.empty')}</p>}
```

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npm test && npm run build && npm run i18n:check`
Browser (dev): open `/dashboard`, wait for data, reload: SBCs, club count and status appear immediately with "Updating…", which disappears within ~1 s. DevTools → Application → IndexedDB → `fcs-cache` holds `<userId>:0:me` and `<userId>:<persona>:data`. Sign out: the store is empty. First visit in a private window: skeleton cards, never "No SBCs yet" before the answer.

- [ ] **Step 9: Commit**

```bash
git pull --rebase
git add web/src/cache.ts web/src/cache.test.ts web/src/Root.tsx web/src/App.tsx web/src/components/SetList.tsx web/src/locales
git commit -m "perf(web): show the last known dashboard at once, refresh in the background"
```

---

### Task 8: Live stream on the site, polling only as fallback

**Files:**
- Create: `web/src/sse.ts`, `web/src/sse.test.ts`, `web/src/useLive.ts`
- Modify: `web/src/api.ts` (`openStream`), `web/src/App.tsx:301-340` (poll + reload effects)

**Interfaces:**
- Consumes: `/api/stream` wire format (Task 4).
- Produces: `parseSse(buf: string): { events: { event: string; data: string }[]; rest: string }`; `refetchPlan(keys: string[], openSetId: number | null): { club: boolean; sets: boolean; challenges: boolean; other: boolean }`; `useLive(persona: number | null, on: { status(s: StatusResponse): void; changed(keys: string[]): void }): boolean` (true while the stream is up); `openStream(signal: AbortSignal): Promise<Response>`.

- [ ] **Step 1: Write the failing test**

```ts
// web/src/sse.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSse, refetchPlan } from './sse';

test('parseSse: whole events out, partial kept, comments skipped', () => {
  const r = parseSse(': ping\n\nevent: status\ndata: {"a":1}\n\nevent: changed\ndata: {"ke');
  assert.deepEqual(r.events, [{ event: 'status', data: '{"a":1}' }]);
  assert.equal(r.rest, 'event: changed\ndata: {"ke');
  assert.deepEqual(parseSse(r.rest + 'ys":[]}\n\n').events, [{ event: 'changed', data: '{"keys":[]}' }]);
});

test('refetchPlan: only what changed', () => {
  assert.deepEqual(refetchPlan(['club'], null), { club: true, sets: false, challenges: false, other: false });
  assert.deepEqual(refetchPlan(['storage', 'squad'], null), { club: true, sets: false, challenges: false, other: false });
  assert.deepEqual(refetchPlan(['sets'], 7), { club: false, sets: true, challenges: false, other: false });
  assert.deepEqual(refetchPlan(['challenges/7'], 7), { club: false, sets: true, challenges: true, other: false });
  assert.deepEqual(refetchPlan(['challenges/8'], 7), { club: false, sets: true, challenges: false, other: false });
  assert.deepEqual(refetchPlan(['academy', 'edited'], null), { club: false, sets: false, challenges: false, other: true });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `node --import tsx --test web/src/sse.test.ts`

- [ ] **Step 3: Implement `web/src/sse.ts`**

```ts
// Pure helpers for the live stream (/api/stream): split server-sent events, and which data to reload.
export interface SseEvent {
  event: string;
  data: string;
}

export function parseSse(buf: string): { events: SseEvent[]; rest: string } {
  const parts = buf.replace(/\r\n/g, '\n').split('\n\n');
  const rest = parts.pop() ?? '';
  const events: SseEvent[] = [];
  for (const part of parts) {
    let event = 'message';
    const data: string[] = [];
    for (const line of part.split('\n')) {
      if (line.startsWith(':')) continue; // heartbeat
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (data.length) events.push({ event, data: data.join('\n') });
  }
  return { events, rest };
}

const CLUB_KEYS = new Set(['club', 'storage', 'squad', 'unassigned', 'chemProfiles']);

/** Changed cache keys (accounts/<id>/<key>) → what the dashboard reloads. */
export function refetchPlan(keys: string[], openSetId: number | null) {
  const plan = { club: false, sets: false, challenges: false, other: false };
  for (const k of keys) {
    if (CLUB_KEYS.has(k)) plan.club = true;
    else if (k === 'sets') plan.sets = true;
    else if (k.startsWith('challenges/')) {
      plan.sets = true; // a points target on a tile comes from the challenges
      if (openSetId !== null && k === `challenges/${openSetId}`) plan.challenges = true;
    } else plan.other = true; // evolutions, gallery ledger, objectives, a web app edit
  }
  return plan;
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `node --import tsx --test web/src/sse.test.ts`

- [ ] **Step 5: `openStream` + `useLive`**

`web/src/api.ts`, after `req`:

```ts
/** The live stream (/api/stream): a streaming fetch, so the Clerk token and the persona go along. */
export async function openStream(signal: AbortSignal): Promise<Response> {
  const token = tokenFn ? await tokenFn(false) : null;
  return fetch('/api/stream', {
    headers: { Accept: 'text/event-stream', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(persona ? { 'X-Persona': String(persona) } : {}) },
    signal,
    cache: 'no-store',
  });
}
```

`web/src/useLive.ts`:

```ts
// Keeps /api/stream open while the tab is visible and hands its events to the dashboard. Returns
// whether it is up: when it is not, the dashboard polls /api/status as before.
import { useEffect, useRef, useState } from 'react';
import { openStream, type api } from './api';
import { parseSse } from './sse';

type StatusResponse = Awaited<ReturnType<typeof api.status>>;
const BACKOFF = [1000, 3000, 10_000, 30_000, 60_000];

export function useLive(persona: number | null, on: { status: (s: StatusResponse) => void; changed: (keys: string[]) => void }): boolean {
  const [up, setUp] = useState(false);
  const handlers = useRef(on);
  handlers.current = on;
  useEffect(() => {
    if (!persona) return;
    let stop = false;
    let ctl: AbortController | null = null;
    let fails = 0;
    const loop = async () => {
      while (!stop) {
        if (document.hidden) return; // back in front starts it again
        ctl = new AbortController();
        try {
          const res = await openStream(ctl.signal);
          if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
          fails = 0;
          setUp(true);
          const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
          let buf = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break; // the server closes every 5 min: reconnect with a fresh token
            const r = parseSse(buf + value);
            buf = r.rest;
            for (const e of r.events) {
              if (e.event === 'status') handlers.current.status(JSON.parse(e.data));
              else if (e.event === 'changed') handlers.current.changed((JSON.parse(e.data) as { keys: string[] }).keys);
            }
          }
        } catch {
          if (stop) return;
          setUp(false);
          await new Promise((r) => setTimeout(r, BACKOFF[Math.min(fails++, BACKOFF.length - 1)]));
        }
      }
    };
    const onVisible = () => {
      if (document.hidden) {
        ctl?.abort();
        setUp(false);
      } else void loop();
    };
    document.addEventListener('visibilitychange', onVisible);
    void loop();
    return () => {
      stop = true;
      ctl?.abort();
      document.removeEventListener('visibilitychange', onVisible);
      setUp(false);
    };
  }, [persona]);
  return up;
}
```

Guard against two loops after a fast hidden→visible: keep a `running` flag in the effect (`if (running) return; running = true; … finally running = false`) around `loop`.

- [ ] **Step 6: App wiring**

In `App.tsx`:
1. A status setter that only updates on a real change (no whole-App re-render per tick):

```ts
  const applyStatus = useCallback((st: Awaited<ReturnType<typeof api.status>>) => {
    setStatus((prev) => (prev && JSON.stringify(prev) === JSON.stringify(st.sync) ? prev : st.sync));
    if (st.account)
      setLinked((prev) => {
        const cur = prev?.find((a) => a.personaId === st.account!.personaId);
        return !prev || (cur && JSON.stringify(cur) === JSON.stringify(st.account)) ? prev : prev.map((a) => (a.personaId === st.account!.personaId ? st.account! : a));
      });
    setLatestExt((prev) => (JSON.stringify(prev) === JSON.stringify(st.extension) ? prev : st.extension));
  }, []);
```

2. Targeted reloads:

```ts
  const onChanged = useCallback(
    (keys: string[]) => {
      const p = refetchPlan(keys, setId);
      if (p.club) void api.club().then((c) => { setClub(c.players); setStorage(c.storage ?? []); setSquad(c.squad); }, () => {});
      if (p.sets) void api.sets().then((s) => setCategories(s.categories), () => {});
      if (p.challenges && setId) void api.challenges(setId).then((r) => setChallenges(r.challenges), () => {});
      if (p.other || p.club) setDataVersion((v) => v + 1);
      if (p.other && view === 'gallery' && premium) void api.gallery().then(setGallery, () => {});
    },
    [setId, view, premium],
  );
  const live = useLive(activeId, { status: applyStatus, changed: onChanged });
```

(After each reload also refresh the IndexedDB copy: call a small `saveData()` that writes `{ meta, club, sets, status }` from current state to `cacheKey(userId, activeId, 'data')`, debounced 2 s.)
3. The polling effect (`App.tsx:305-320`) runs only when `!live`: add `if (!activeId || live) return;` and use `applyStatus(st)` instead of the two setters.
4. The reload effect (`App.tsx:325-340`): keep the `sync_done` tracking; keep the full `loadAccountData()` reload only when `!live` (in live mode `changed` events already reloaded exactly what changed).

- [ ] **Step 7: Verify**

Run: `npm run typecheck && npm test && npm run build`
Browser (dev, EA web app open with extension 1.0.3): Network shows one long `/api/stream` request and no `/api/status` every 5 s. Open an SBC in the EA web app: the dashboard's set tile updates within ~1 s and only `/api/sets` (+ that set's challenges if it is open) is refetched. DevTools → Network → block `/api/stream` and reload: `/api/status` polling every 5 s comes back and data still updates. Switch tab away for 30 s and back: stream reconnects.

- [ ] **Step 8: Commit**

```bash
git pull --rebase
git add web/src/sse.ts web/src/sse.test.ts web/src/useLive.ts web/src/api.ts web/src/App.tsx
git commit -m "feat(web): live dashboard over /api/stream, reload only what changed, polling as fallback"
```

---

### Task 9: Activity indicator, panel, non-blocking club sync

**Files:**
- Create: `web/src/activity.ts`, `web/src/activity.test.ts`, `web/src/components/Activity.tsx`
- Delete: `web/src/components/ClubSyncModal.tsx`
- Modify: `web/src/App.tsx` (top bar `.sync` block ~line 673-700, `ClubSyncModal` at :742, `clubSyncing`), `web/src/components/Pitch.tsx:99-125`, `web/src/components/PointsArea.tsx`, `web/src/styles.css`, locales, `shared/changelog.ts`

**Interfaces:**
- Consumes: `JobView`, `SyncStatus.jobs`, `SyncStatus.graceUntil` (Task 3).
- Produces (pure, `web/src/activity.ts`):

```ts
export function mainJob(jobs: JobView[]): JobView | null;              // first active job, else null
export function pct(v: JobView): number | null;                         // 0-100; null = indeterminate; never 100 while active
export function finishedNow(prev: JobView[], next: JobView[]): JobView[]; // jobs that turned done/failed between two statuses
export function solveWait(jobs: JobView[]): JobView | null;              // a club job queued or running: solve waits
```

- `PitchCorners` / `Pitch` / `PointsArea` get prop `syncWait: string | null` (text shown on the disabled Solve button's title + under it).

- [ ] **Step 1: Write the failing test**

```ts
// web/src/activity.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mainJob, pct, finishedNow, solveWait } from './activity';
import type { JobView } from './api';

const v = (o: Partial<JobView>): JobView => ({ id: 'a', kind: 'club', state: 'running', done: 0, total: null, estimated: false, at: 0, error: null, notStarted: false, resumeAt: null, ...o });

test('mainJob: first active one', () => {
  assert.equal(mainJob([v({ id: 'x', state: 'done' }), v({ id: 'y', state: 'queued' })])?.id, 'y');
  assert.equal(mainJob([v({ state: 'done' })]), null);
});

test('pct: unknown total is indeterminate, active never shows 100', () => {
  assert.equal(pct(v({ total: null })), null);
  assert.equal(pct(v({ done: 50, total: 200 })), 25);
  assert.equal(pct(v({ done: 300, total: 200 })), 99);
  assert.equal(pct(v({ state: 'done', done: 200, total: 200 })), 100);
});

test('finishedNow: only jobs that were active before', () => {
  const before = [v({ id: 'a', state: 'running' }), v({ id: 'b', state: 'done' })];
  const after = [v({ id: 'a', state: 'done' }), v({ id: 'b', state: 'done' })];
  assert.deepEqual(finishedNow(before, after).map((j) => j.id), ['a']);
});

test('solveWait: a club job queued or running', () => {
  assert.equal(solveWait([v({ kind: 'sbc' })]), null);
  assert.equal(solveWait([v({ kind: 'club', state: 'queued' })])?.kind, 'club');
  assert.equal(solveWait([v({ kind: 'club', state: 'waitingTab' })]), null); // not open: solve the cached club
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `node --import tsx --test web/src/activity.test.ts`

- [ ] **Step 3: Implement `web/src/activity.ts`**

```ts
// Pure rules for the activity indicator and panel (sync jobs running in the EA web app tab).
import type { JobView } from './api';

const ACTIVE = new Set<JobView['state']>(['waitingTab', 'waitingLogin', 'queued', 'running', 'paused']);
export const isActive = (j: JobView) => ACTIVE.has(j.state);

export const mainJob = (jobs: JobView[]) => jobs.find(isActive) ?? null;

export function pct(v: JobView): number | null {
  if (v.state === 'done') return 100;
  if (!v.total) return null;
  return Math.min(99, Math.round((v.done / v.total) * 100));
}

export function finishedNow(prev: JobView[], next: JobView[]): JobView[] {
  const wasActive = new Set(prev.filter(isActive).map((j) => j.id));
  return next.filter((j) => wasActive.has(j.id) && (j.state === 'done' || j.state === 'failed'));
}

/** Solve waits for a club sync that is queued or running in an open tab, never for one that waits for the tab. */
export const solveWait = (jobs: JobView[]) => jobs.find((j) => j.kind === 'club' && (j.state === 'queued' || j.state === 'running')) ?? null;
```

- [ ] **Step 4: Run, expect PASS**

Run: `node --import tsx --test web/src/activity.test.ts`

- [ ] **Step 5: `Activity.tsx`**

One component file with three exports:
- `ActivityButton({ status, onOpen })`: replaces the top bar `.sync` block's look. Shows a 20px SVG progress ring (determinate when `pct` is a number, a rotating arc otherwise, static under reduced motion) + text of `mainJob`: `t('activity.kind.<kind>')` + `t('activity.progress', { done, total })` (`"12/~55"` uses `activity.progressEst`), or when idle the existing "Club 5m ago · SBCs …" text. It is a `<button aria-haspopup="dialog" aria-expanded>`.
- `ActivityPanel({ status, club, onClose, onSyncClub, clubWait })`: a non-modal popover (`role="dialog"`, `aria-label={t('activity.title')}`, closes on Esc / outside click), 14px radius. One row per `status.jobs` item, plus a `graceUntil` row (`t('activity.grace')`) when set. Each row: Phosphor icon per state (`HourglassMedium` waiting, `Queue` queued, `ArrowsClockwise` running, `PauseCircle` paused, `CheckCircle` done, `WarningCircle` failed), the kind label, the state text (`t('activity.state.<state>')`, paused with `{time}` from `resumeAt`, failed with the error: `notStarted` uses the existing `clubSync.notStartedBody`), a `role="progressbar"` bar with `aria-valuenow` when determinate, and `ago(at)` for finished rows. The existing Club button (cooldown title `top.clubWait`) and the SBC next-refresh text move into the panel footer.
- `ActivityToast({ jobs })`: watches `finishedNow(prev, jobs)` (keep `prev` in a ref); for a done club job shows `t('activity.toast.club', { count: players })` (players = `club.length` passed in), for a done sbc job `t('activity.toast.sbc')`, for failed `t('activity.toast.failed')`; `role="status"` + `aria-live="polite"`, 6 s, bottom-right (bottom-center under 860px), dismiss button.

CSS (`styles.css`): `.activity-btn`, `.activity-ring` (stroke `var(--go)` only when state is done; running uses the normal accent/text colour), `.activity-panel` (radius 14px, max-width 360px, under 860px full width below the top bar), `.activity-row`, `.activity-bar` (reuse `.club-sync-bar` rules, rename), `.activity-toast`; `@media (prefers-reduced-motion: reduce)` stops the ring rotation and bar animation.

- [ ] **Step 6: Wire it in `App.tsx`**

- Remove the `ClubSyncModal` import and `<ClubSyncModal … />` (line ~742); delete `web/src/components/ClubSyncModal.tsx`.
- Replace the `.sync` block in `controls` with `<ActivityButton …/>` + `{activityOpen && <ActivityPanel … />}`; keep `doSync('club')` and `clubWait` logic, passed to the panel.
- Add `<ActivityToast jobs={status?.jobs ?? []} players={club.length} />` once, next to where the modal was.
- `const wait = solveWait(status?.jobs ?? []); const syncWait = wait ? t('activity.solveWait', { done: wait.done, total: wait.total ?? '?' }) : null;` and pass `syncWait` to `Pitch` / `PointsArea`.
- `runSolve` returns early when `syncWait`.
- `clubSyncing` (used for the fallback poll interval) becomes `!!wait && wait.state === 'running'`; keep `web/src/club-sync.ts` only if still imported elsewhere (`grep -rn club-sync web/src`), else delete it too.

`Pitch.tsx` `PitchCorners`: add `syncWait: string | null` to props; both solve buttons: `disabled={solving || outOfSolves || !!syncWait}` and `title={syncWait ?? …existing title}`; under the buttons `{syncWait && <p className="solve-wait">{syncWait}</p>}`. Thread the prop through `Pitch` and `PointsArea` the same way `outOfSolves` is threaded.

- [ ] **Step 7: Strings (en / ro / it) and changelog**

Add to `web/src/locales/en.ts`, `ro.ts`, `it.ts` (Romanian with `_one`/`_few`/`_other` where `count` is used, Italian `_one`/`_other`):

| key | en |
|---|---|
| `activity.title` | Activity |
| `activity.kind.club` | Club |
| `activity.kind.sbc` | SBC list |
| `activity.kind.challenges` | SBC challenges |
| `activity.kind.challengeSquad` | SBC squad |
| `activity.kind.academy` | Evolutions |
| `activity.progress` | {done}/{total} |
| `activity.progressEst` | {done}/~{total} |
| `activity.state.waitingTab` | Open the FC web app to start |
| `activity.state.waitingLogin` | Log in to EA in the web app to start |
| `activity.state.queued` | Starting… |
| `activity.state.running` | Running |
| `activity.state.paused` | EA asked for a pause, resuming at {time} |
| `activity.state.done` | Done |
| `activity.state.failed` | Did not finish |
| `activity.grace` | Waiting for the web app to finish loading |
| `activity.idle` | Nothing running |
| `activity.toast.club_one` / `_other` | Club updated: {count} player / Club updated: {count} players |
| `activity.toast.sbc` | SBC list updated |
| `activity.toast.failed` | A sync did not finish. Open the activity panel for why. |
| `activity.solveWait` | Club syncing ({done}/~{total}), solve when it is done |
| `top.updating` | Updating… (if not added in Task 7) |

Write ro and it yourself (not machine-translated), e.g. ro `activity.state.waitingTab`: "Deschide web app-ul FC ca să pornească", it: "Apri la web app FC per iniziare". Remove the `clubSync.*` keys no longer used (keep `clubSync.notStartedBody` if the panel uses it).

`shared/changelog.ts`: add (or extend) today's entry `2026-10-13` with one item per language, e.g. en: "Faster dashboard: your SBCs and club show up at once when you open FC Solver, and syncs show their progress live in the new activity panel without blocking the page"; ro and it written in their own words. Also: "Extension 1.0.3: syncs start right away".

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npm test && npm run build && npm run i18n:check`
Browser (dev, desktop and 390px):
- Club sync from the panel: the ring + "Club 120/~1200" counts up; you can open sets and Daily meanwhile; the Solve button is disabled with the wait text; at the end a toast "Club updated: N players" and Solve enables itself.
- Close the EA web app tab with a job queued: the row says "Open the FC web app to start".
- Reduced motion (DevTools rendering emulation): no rotation, no pulsing.
- Keyboard: Tab to the activity button, Enter opens, Esc closes, focus returns to the button. Screen reader text: states are words, not colours.

- [ ] **Step 9: Commit**

```bash
git pull --rebase
git add -A web/src shared/changelog.ts
git commit -m "feat(web): live activity panel, club sync no longer blocks the page"
```

---

### Task 10: Docs and end-to-end check

**Files:**
- Modify: `docs/api.md`, `docs/architecture.md`, `docs/deploy.md`

- [ ] **Step 1: Docs**

- `docs/api.md`: `GET /api/stream` (auth, events `status` / `changed` / `: ping`, 5 min lifetime, max 3 per user → 429 `tooManyStreams`); `GET /api/jobs/next` `wait=1` + `again` in the answer; ETag / 304 on `/api/club`, `/api/meta`, `/api/sets`; `SyncStatus.jobs` (`JobView`) and `graceUntil`.
- `docs/architecture.md`: the read-through shared cache (`readShared`, never mutate), the live bus (`server/live.ts`, cache write listener + job notifies), the site's last-known-state cache (IndexedDB `fcs-cache`, cleared on sign-out).
- `docs/deploy.md`: nginx needs nothing extra for `/api/stream` (the app sends `X-Accel-Buffering: no`; `proxy_read_timeout` must stay ≥ 60 s, the stream pings every 25 s); check `snippets/proxy.conf` on the server does not set `proxy_buffering on` with `proxy_ignore_headers X-Accel-Buffering`.

- [ ] **Step 2: Full verification**

Run: `npm run typecheck && npm test && npm run build && npm run i18n:check`
Expected: all PASS. Browser checklist on dev (`npm run dev`, real data in `data/`): cold open (private window), warm open, EA tab sync with live progress, hidden tab and back, stream blocked → polling, sign out → IndexedDB empty, 390px.

- [ ] **Step 3: Commit**

```bash
git pull --rebase
git add docs/api.md docs/architecture.md docs/deploy.md
git commit -m "docs: live stream, held job poll, ETags, shared cache"
```

- [ ] **Step 4: Hand off**

Use superpowers:finishing-a-development-branch. Do not push or deploy without the owner's go-ahead; after deploy to dev (`sbc-builder.mario-theodor.ro`) repeat the stream check through Cloudflare (events arrive one by one, not in a burst after 60-100 s).
