# Evolution Training Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track timed EA Evolution training (Training Camp) per EA persona, email Premium owners when a training is over, and show the tracked evolutions on a new Evolutions screen.

**Architecture:** Academy responses reach the server through the existing extension relay (`server/events.ts`) and a new read-only daily job recipe (`academy`). A pure parser (`server/evos.ts`) turns them into training rows stored in Postgres (`evo_trainings`). A 60 s ticker (`server/evo-alerts.ts`) emails due rows through Resend (`server/mail.ts`, plain `fetch`). The site reads `GET /api/evos` and shows a new `/dashboard/evolutions` view.

**Tech Stack:** Fastify 5 + TS (tsx), Drizzle + Postgres, node:test, React 19 + Vite, plain CSS, Phosphor icons, Chrome MV3 extension, Resend HTTP API.

**Spec:** `docs/superpowers/specs/2026-10-01-evo-training-alerts-design.md`

## Global Constraints

- Read-only toward EA: the `academy` recipe only does `GET /academy/hub/v2?offset=0&count=20&sortOrder=asc&slotStatus=STARTED`; never claim / start / slot.
- No EA call on page load, set open or solve. The academy job runs only with the scheduled daily sync, and only for personas whose owner is Premium.
- Times: EA values are unix **seconds** UTC. Server stores `timestamptz`, compares epoch ms; only the browser formats times (local zone).
- Only `timed: true` slots are tracked.
- One email per `(persona_id, slot_id, level)`; never for a training that ended more than 24 h ago; max 3 send tries.
- Emails only to Premium (`planFor(userId).tier === 'premium'`, admins count), with `evo_emails` on and a non-empty email.
- Env: `RESEND_API_KEY`, `EMAIL_FROM` (e.g. `FC Solver <noreply@mario-theodor.ro>`), `EMAIL_SECRET` (falls back to `CLERK_SECRET_KEY`), links built from `SITE_URL` (fallback `http://localhost:5173`). Never print or commit keys.
- Every site string through `t()`, keys in `web/src/locales/en.ts`, `ro.ts`, `it.ts`; `npm run i18n:check` passes. EA texts (evolution names, player names) stay as EA sends them.
- UI: EA web app look, `--go` only for "Ready to claim", state never by color alone, 8px controls / 14px containers, `prefers-reduced-motion`, check 390 px.
- Extension change → bump `extension/manifest.json` to `0.8.9` + entry in `extension/release.json`. Zip folder name unchanged.
- New endpoints → `docs/api.md`. New env → `.env.example` + `docs/deploy.md`.
- Commits: `type(scope): subject`, end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push.

## Review Focus

1. A training seen only after it finished (first response shape: objective `COMPLETED`, `currentProgress === multiplier`) must not be emailed and must not wipe the `ends_at` of a row we saw running → Task 1 test "ready row has no times" + Task 3 upsert keeps `ends_at` (coalesce).
2. Server restart / downtime: on start, rows that ended > 24 h ago must not email → Task 2 `isDue` test.
3. A user who lost Premium (or turned emails off) between start and end gets no email, and the row is closed (not retried every minute) → Task 5 `decide` test.
4. Partial academy responses (claim response, other filters) must not delete other tracked slots; only `hub/v2` + `slotStatus=STARTED` + `offset=0` + fewer slots than `count` replaces → Task 1 `isFullList` tests.
5. Clock skew / garbage: `currentProgress` in the future, small counters (`43200`), huge durations → Task 1 sanity tests.

---

## File Structure

- Create `server/evos.ts` — pure academy parsing (`parseAcademy`, `isFullList`, types).
- Create `server/evos.test.ts`.
- Create `server/evo-rules.ts` — pure alert rules (`isDue`, `decide`), email text (`evoMail`), unsubscribe token (`unsubToken`, `checkUnsub`).
- Create `server/evo-rules.test.ts`.
- Create `server/db/evos.ts` — DB access for `evo_trainings` + user prefs.
- Modify `server/db/schema.ts` — `evoTrainings` table, `users.lang`, `users.evoEmails`; new migration in `server/db/migrations/`.
- Create `server/mail.ts` — Resend sender.
- Create `server/evo-alerts.ts` — the ticker.
- Modify `server/events.ts` — watch + apply academy responses.
- Modify `server/jobs.ts` — `JobKind` gains `'academy'`.
- Modify `server/sync.ts` — enqueue `academy` with the scheduled daily sync for Premium owners.
- Modify `server/index.ts` — `GET /api/evos`, `PUT /api/me/prefs`, `GET|POST /api/evos/unsubscribe`, `/api/me` returns prefs, ticker.
- Modify `extension/hook.js`, `extension/manifest.json`, `extension/release.json`.
- Modify `web/src/route.ts`, `web/src/api.ts`, `web/src/App.tsx`, `web/src/i18n.tsx` (or `Root.tsx`, wherever language is set), `web/src/styles.css`, locales.
- Create `web/src/components/EvosView.tsx`, `web/src/evos.ts` (+ `web/src/evos.test.ts`) — pure countdown formatting.
- Modify `docs/api.md`, `docs/architecture.md` (one paragraph), `docs/extension.md` (recipe list), `docs/deploy.md`, `.env.example`.

---

### Task 1: Academy parser (pure)

**Files:**
- Create: `server/evos.ts`
- Test: `server/evos.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface EvoTraining {
    slotId: number; level: number; levelCount: number; slotName: string;
    itemId: number | null; player: Record<string, unknown> | null; // EA item as sent (slot.player), for toPlayer()
    startedAt: number | null; endsAt: number | null; // unix seconds; null when only seen ready
    ready: boolean; slotEndsAt: number | null;
  }
  export function parseAcademy(response: unknown, nowSec: number): EvoTraining[];
  export function isFullList(path: string, query: string, slotCount: number): boolean;
  ```

- [ ] **Step 1: Write the failing tests** (`server/evos.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isFullList, parseAcademy } from './evos.js';

const NOW = 1790853100; // 2 min after the observed start
const objective = (o: Record<string, unknown>) => ({ objectiveId: 1, name: 'Send your Player to Training Camp.', multiplier: 43200, ...o });
const slot = (levels: unknown[], extra: Record<string, unknown> = {}) => ({
  id: 2736, slotName: 'Trust the Keeper', endTime: 1792256400, timed: true, realPlayerId: 943569136395,
  player: { id: 943569136395, assetId: 86320, rating: 54, itemType: 'player' }, levels, ...extra,
});
const running = slot([
  { level: 0, levelState: 'COMPLETED' },
  { level: 1, levelState: 'COMPLETED', objectives: [objective({ state: 'COMPLETED', currentProgress: 43200 })] },
  { level: 2, levelState: 'IN_PROGRESS', objectives: [objective({ state: 'IN_PROGRESS', currentProgress: 1790852979 })] },
]);
const readyFirst = slot([
  { level: 0, levelState: 'COMPLETED' },
  { level: 1, levelState: 'IN_PROGRESS', objectives: [objective({ state: 'COMPLETED', currentProgress: 43200 })] },
  { level: 2, levelState: 'NOT_STARTED', objectives: [objective({})] },
]);

test('running training: start + duration, in unix seconds', () => {
  const [t] = parseAcademy({ slots: [running] }, NOW);
  assert.deepEqual(
    { slotId: t.slotId, level: t.level, levelCount: t.levelCount, startedAt: t.startedAt, endsAt: t.endsAt, ready: t.ready, itemId: t.itemId },
    { slotId: 2736, level: 2, levelCount: 2, startedAt: 1790852979, endsAt: 1790852979 + 43200, ready: false, itemId: 943569136395 },
  );
  assert.equal(t.slotName, 'Trust the Keeper');
  assert.equal((t.player as { assetId: number }).assetId, 86320);
});

test('ready row (seen only after it finished) has no times', () => {
  const list = parseAcademy({ slots: [readyFirst], rewardReadySlotIds: [2736] }, NOW);
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].level, list[0].ready, list[0].startedAt, list[0].endsAt], [1, true, null, null]);
});

test('untimed slots are ignored', () => {
  assert.deepEqual(parseAcademy({ slots: [{ ...running, timed: false }] }, NOW), []);
});

test('sanity: future start, counters, long durations, past slot end', () => {
  const lvl = (o: Record<string, unknown>) => slot([{ level: 1, levelState: 'IN_PROGRESS', objectives: [objective({ state: 'IN_PROGRESS', ...o })] }]);
  assert.deepEqual(parseAcademy({ slots: [lvl({ currentProgress: NOW + 301 })] }, NOW), []); // > 5 min in the future
  assert.equal(parseAcademy({ slots: [lvl({ currentProgress: NOW + 299 })] }, NOW).length, 1); // small clock skew is fine
  assert.deepEqual(parseAcademy({ slots: [lvl({ currentProgress: 3000 })] }, NOW), []); // a counter, not a time
  assert.deepEqual(parseAcademy({ slots: [lvl({ currentProgress: NOW, multiplier: 8 * 86400 })] }, NOW), []); // > 7 days
  assert.deepEqual(parseAcademy({ slots: [lvl({ currentProgress: NOW, multiplier: 0 })] }, NOW), []);
  assert.deepEqual(parseAcademy({ slots: [{ ...lvl({ currentProgress: NOW }), endTime: NOW + 60 }] }, NOW), []); // ends after the evolution
});

test('unknown shapes never throw', () => {
  for (const r of [null, 1, 'x', {}, { slots: 'no' }, { slots: [null, 1, { levels: 'x' }] }]) assert.deepEqual(parseAcademy(r, NOW), []);
});

test('isFullList: only the unfiltered first page of started slots', () => {
  const q = 'offset=0&count=20&sortOrder=asc&slotStatus=STARTED';
  assert.equal(isFullList('/academy/hub/v2', q, 1), true);
  assert.equal(isFullList('/academy/hub/v2', q, 20), false); // a full page: there may be more
  assert.equal(isFullList('/academy/hub/v2', q.replace('offset=0', 'offset=20'), 1), false);
  assert.equal(isFullList('/academy/hub/v2', 'offset=0&count=20', 1), false);
  assert.equal(isFullList('/academy/slot/2736/claim', q, 1), false);
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --import tsx --test server/evos.test.ts` → cannot find module `./evos.js`.

- [ ] **Step 3: Implement `server/evos.ts`**

```ts
// Timed EA Evolutions ("Academy" in the API): which players are in Training Camp and until when.
// A timed level's objective carries the training start in `currentProgress` (unix seconds, UTC)
// and its length in `multiplier` (seconds); once over, `currentProgress === multiplier` and the
// level waits for a claim in the web app. Pure: the caller stores what this returns.

export interface EvoTraining {
  slotId: number;
  level: number;
  levelCount: number;
  slotName: string;
  itemId: number | null;
  player: Record<string, unknown> | null; // EA item as sent (slot.player), for toPlayer()
  startedAt: number | null; // unix seconds; null when only seen ready
  endsAt: number | null;
  ready: boolean;
  slotEndsAt: number | null;
}

const SKEW = 300; // device clocks drift: a start up to 5 min "in the future" is still fine
const MAX_TRAINING = 7 * 86400;
const MIN_EPOCH = 1_000_000_000; // below this `currentProgress` is a counter, not a time

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const int = (v: unknown): number | null => (Number.isInteger(v) ? (v as number) : null);

export function parseAcademy(response: unknown, nowSec: number): EvoTraining[] {
  const res = obj(response);
  if (!res || !Array.isArray(res.slots)) return [];
  const readyIds = new Set(Array.isArray(res.rewardReadySlotIds) ? res.rewardReadySlotIds : []);
  const out: EvoTraining[] = [];
  for (const raw of res.slots) {
    const s = obj(raw);
    const slotId = int(s?.id);
    if (!s || slotId === null || s.timed !== true || !Array.isArray(s.levels)) continue;
    const levels = s.levels.map(obj).filter((l): l is Record<string, unknown> => !!l && int(l.level) !== null);
    const levelCount = Math.max(0, ...levels.map((l) => l.level as number));
    const slotEndsAt = int(s.endTime) || null;
    const base = {
      slotId, levelCount, slotEndsAt,
      slotName: typeof s.slotName === 'string' ? s.slotName : '',
      itemId: int(s.realPlayerId),
      player: obj(s.player),
    };
    for (const l of levels) {
      if (l.levelState !== 'IN_PROGRESS') continue;
      const timed = (Array.isArray(l.objectives) ? l.objectives : []).map(obj).find((o) => (int(o?.multiplier) ?? 0) > 0);
      if (!timed) continue;
      const duration = timed.multiplier as number;
      const progress = int(timed.currentProgress);
      if (timed.state === 'COMPLETED' || (readyIds.has(slotId) && timed.state !== 'IN_PROGRESS')) {
        out.push({ ...base, level: l.level as number, startedAt: null, endsAt: null, ready: true });
        continue;
      }
      if (timed.state !== 'IN_PROGRESS' || progress === null || progress < MIN_EPOCH) continue;
      if (progress > nowSec + SKEW || duration > MAX_TRAINING) continue;
      const endsAt = progress + duration;
      if (slotEndsAt && endsAt > slotEndsAt) continue;
      out.push({ ...base, level: l.level as number, startedAt: progress, endsAt, ready: false });
    }
  }
  return out;
}

/** The web app's own Evolutions list: every started slot, so a slot missing from it was claimed or expired. */
export function isFullList(path: string, query: string, slotCount: number): boolean {
  if (path !== '/academy/hub/v2') return false;
  const q = new URLSearchParams(query);
  const count = Number(q.get('count'));
  return q.get('slotStatus') === 'STARTED' && q.get('offset') === '0' && count > 0 && slotCount < count;
}
```

- [ ] **Step 4: Run, expect PASS** — `node --import tsx --test server/evos.test.ts`.
- [ ] **Step 5: Commit** — `git add server/evos.ts server/evos.test.ts && git commit -m "feat(evos): parse timed evolution training from academy responses"` (+ Co-Authored-By line).

---

### Task 2: Alert rules, email text, unsubscribe token (pure)

**Files:**
- Create: `server/evo-rules.ts`
- Test: `server/evo-rules.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1 at runtime.
- Produces:
  ```ts
  export type MailLang = 'en' | 'ro' | 'it';
  export const STALE_MS = 24 * 3600 * 1000;
  export const MAX_TRIES = 3;
  export interface DueRow { endsAt: Date | null; notifiedAt: Date | null; tries: number; ready: boolean }
  export function isDue(row: DueRow, nowMs: number): boolean;
  export type Decision = 'send' | 'skip';
  export function decide(owner: { tier: 'free' | 'premium'; evoEmails: boolean; email: string } | null): Decision;
  export function asLang(v: unknown): MailLang;
  export function evoMail(lang: MailLang, d: { player: string; evo: string; level: number; levelCount: number; evosUrl: string; unsubUrl: string }): { subject: string; text: string; html: string };
  export function unsubToken(userId: string, secret: string): string;
  export function checkUnsub(userId: string, token: string, secret: string): boolean;
  ```

- [ ] **Step 1: Write the failing tests** (`server/evo-rules.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asLang, checkUnsub, decide, evoMail, isDue, unsubToken } from './evo-rules.js';

const NOW = Date.UTC(2026, 9, 2, 8);
const row = (o: Partial<Parameters<typeof isDue>[0]> = {}) => ({ endsAt: new Date(NOW - 1000), notifiedAt: null, tries: 0, ready: false, ...o });

test('isDue', () => {
  assert.equal(isDue(row(), NOW), true);
  assert.equal(isDue(row({ endsAt: new Date(NOW + 1000) }), NOW), false); // still training
  assert.equal(isDue(row({ endsAt: new Date(NOW - 25 * 3600e3) }), NOW), false); // ended long ago (downtime)
  assert.equal(isDue(row({ endsAt: null, ready: true }), NOW), false); // only seen ready: no "just finished" moment
  assert.equal(isDue(row({ notifiedAt: new Date(NOW) }), NOW), false);
  assert.equal(isDue(row({ tries: 3 }), NOW), false);
});

test('decide: Premium, emails on, has an address', () => {
  assert.equal(decide({ tier: 'premium', evoEmails: true, email: 'a@b.c' }), 'send');
  assert.equal(decide({ tier: 'free', evoEmails: true, email: 'a@b.c' }), 'skip');
  assert.equal(decide({ tier: 'premium', evoEmails: false, email: 'a@b.c' }), 'skip');
  assert.equal(decide({ tier: 'premium', evoEmails: true, email: '' }), 'skip');
  assert.equal(decide(null), 'skip'); // persona has no owner
});

test('asLang', () => {
  assert.equal(asLang('ro'), 'ro');
  assert.equal(asLang('it'), 'it');
  assert.equal(asLang('de'), 'en');
  assert.equal(asLang(undefined), 'en');
});

test('evoMail per language, escapes EA text in html', () => {
  const d = { player: 'Maxim <b>', evo: 'Trust the Keeper', level: 2, levelCount: 2, evosUrl: 'https://x/dashboard/evolutions', unsubUrl: 'https://x/u' };
  const en = evoMail('en', d);
  assert.match(en.subject, /Maxim/);
  assert.match(en.text, /EA web app/);
  assert.ok(!en.html.includes('<b>') && en.html.includes('&lt;b&gt;'));
  assert.ok(en.html.includes('https://x/u'));
  assert.notEqual(evoMail('ro', d).subject, en.subject);
  assert.notEqual(evoMail('it', d).subject, en.subject);
});

test('unsubscribe token', () => {
  const tok = unsubToken('user_1', 's3cret');
  assert.equal(checkUnsub('user_1', tok, 's3cret'), true);
  assert.equal(checkUnsub('user_2', tok, 's3cret'), false);
  assert.equal(checkUnsub('user_1', tok, 'other'), false);
  assert.equal(checkUnsub('user_1', 'short', 's3cret'), false);
});
```

- [ ] **Step 2: Run, expect FAIL** — `node --import tsx --test server/evo-rules.test.ts`.

- [ ] **Step 3: Implement `server/evo-rules.ts`**

```ts
// Pure rules for evolution training emails: when a row is due, who gets it, what it says,
// and the unsubscribe token. Server code (server/evo-alerts.ts) does the I/O.
import { createHmac, timingSafeEqual } from 'node:crypto';

export type MailLang = 'en' | 'ro' | 'it';
export const STALE_MS = 24 * 3600 * 1000; // after downtime, don't mail trainings that ended long ago
export const MAX_TRIES = 3;

export interface DueRow { endsAt: Date | null; notifiedAt: Date | null; tries: number; ready: boolean }

export function isDue(row: DueRow, nowMs: number): boolean {
  if (!row.endsAt || row.notifiedAt || row.tries >= MAX_TRIES) return false;
  const end = row.endsAt.getTime();
  return end <= nowMs && end > nowMs - STALE_MS;
}

export type Decision = 'send' | 'skip';
export function decide(owner: { tier: 'free' | 'premium'; evoEmails: boolean; email: string } | null): Decision {
  return owner && owner.tier === 'premium' && owner.evoEmails && owner.email.includes('@') ? 'send' : 'skip';
}

export const asLang = (v: unknown): MailLang => (v === 'ro' || v === 'it' ? v : 'en');

const EA_WEB_APP = 'https://www.ea.com/ea-sports-fc/ultimate-team/web-app/';

const TEXT: Record<MailLang, { subject: string; body: string; open: string; see: string; unsub: string }> = {
  en: {
    subject: "{player}'s evolution is ready to claim",
    body: "{player}'s training in the {evo} evolution is over (level {level} of {count}). Open the EA web app to claim it.",
    open: 'Open the EA web app',
    see: 'See your evolutions in FC Solver',
    unsub: 'Stop these emails',
  },
  ro: {
    subject: 'Evoluția lui {player} e gata de claim',
    body: 'Antrenamentul lui {player} în evoluția {evo} s-a terminat (nivelul {level} din {count}). Intră în EA web app ca să dai claim.',
    open: 'Deschide EA web app',
    see: 'Vezi evoluțiile în FC Solver',
    unsub: 'Nu mai trimite aceste emailuri',
  },
  it: {
    subject: "L'evoluzione di {player} è pronta da riscattare",
    body: "L'allenamento di {player} nell'evoluzione {evo} è finito (livello {level} di {count}). Apri la web app EA per riscattarla.",
    open: 'Apri la web app EA',
    see: 'Vedi le tue evoluzioni su FC Solver',
    unsub: 'Non inviarmi più queste email',
  },
};

const ENT: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ENT[c]);
const fill = (s: string, p: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? ''));

export function evoMail(lang: MailLang, d: { player: string; evo: string; level: number; levelCount: number; evosUrl: string; unsubUrl: string }) {
  const t = TEXT[lang];
  const p = { player: d.player, evo: d.evo, level: d.level, count: d.levelCount };
  const pHtml = { ...p, player: esc(d.player), evo: esc(d.evo) };
  const subject = fill(t.subject, p);
  const text = `${fill(t.body, p)}\n\n${t.open}: ${EA_WEB_APP}\n${t.see}: ${d.evosUrl}\n\n${t.unsub}: ${d.unsubUrl}\n`;
  const html =
    `<p>${fill(t.body, pHtml)}</p>` +
    `<p><a href="${EA_WEB_APP}">${esc(t.open)}</a> · <a href="${esc(d.evosUrl)}">${esc(t.see)}</a></p>` +
    `<p style="color:#888;font-size:12px"><a href="${esc(d.unsubUrl)}">${esc(t.unsub)}</a></p>`;
  return { subject, text, html };
}

const sign = (userId: string, secret: string) => createHmac('sha256', secret).update(`evo-unsub:${userId}`).digest('base64url');
export const unsubToken = sign;
export function checkUnsub(userId: string, token: string, secret: string): boolean {
  const want = Buffer.from(sign(userId, secret));
  const got = Buffer.from(token);
  return got.length === want.length && timingSafeEqual(got, want);
}
```

- [ ] **Step 4: Run, expect PASS** — `node --import tsx --test server/evo-rules.test.ts`.
- [ ] **Step 5: Commit** — `feat(evos): alert rules, email text and unsubscribe token`.

---

### Task 3: Database — table, user prefs, access helpers

**Files:**
- Modify: `server/db/schema.ts` (users table at `:60-73`, add new table at the end)
- Create: `server/db/evos.ts`
- Generated: `server/db/migrations/00xx_*.sql` via `npm run db:generate`

**Interfaces:**
- Consumes: `EvoTraining` (Task 1), `MailLang`, `STALE_MS`, `MAX_TRIES` (Task 2).
- Produces:
  ```ts
  export async function saveTrainings(personaId: number, list: EvoTraining[], full: boolean): Promise<void>;
  export interface TrainingRow { personaId: number; slotId: number; level: number; levelCount: number; slotName: string; itemId: number | null; player: Record<string, unknown> | null; startedAt: Date | null; endsAt: Date | null; ready: boolean; notifiedAt: Date | null; tries: number; updatedAt: Date }
  export async function trainingsOf(personaId: number): Promise<TrainingRow[]>;
  export async function dueTrainings(now: Date): Promise<TrainingRow[]>; // same rule as isDue, in SQL
  export async function markNotified(personaId: number, slotId: number, level: number): Promise<void>;
  export async function failedTry(personaId: number, slotId: number, level: number): Promise<void>;
  export async function ownerOf(personaId: number): Promise<{ userId: string; email: string; lang: MailLang; evoEmails: boolean } | null>;
  export async function prefsOf(userId: string): Promise<{ lang: MailLang; evoEmails: boolean }>;
  export async function setPrefs(userId: string, p: { lang?: MailLang; evoEmails?: boolean }): Promise<void>;
  ```

- [ ] **Step 1: Schema.** In `users` add:
  ```ts
  lang: text('lang').notNull().default('en'), // 'en' | 'ro' | 'it', for emails; the site saves it on change
  evoEmails: boolean('evo_emails').notNull().default(true), // evolution training emails (Premium)
  ```
  (import `boolean` from `drizzle-orm/pg-core`). Append:
  ```ts
  /** Timed evolution training per EA persona (server/evos.ts); one email per level (server/evo-alerts.ts). */
  export const evoTrainings = pgTable(
    'evo_trainings',
    {
      personaId: bigint('persona_id', { mode: 'number' }).notNull(),
      slotId: integer('slot_id').notNull(),
      level: integer('level').notNull(),
      levelCount: integer('level_count').notNull(),
      slotName: text('slot_name').notNull().default(''),
      itemId: bigint('item_id', { mode: 'number' }),
      player: jsonb('player').$type<Record<string, unknown>>(),
      startedAt: timestamp('started_at', { withTimezone: true }),
      endsAt: timestamp('ends_at', { withTimezone: true }),
      ready: boolean('ready').notNull().default(false),
      notifiedAt: timestamp('notified_at', { withTimezone: true }),
      tries: integer('tries').notNull().default(0),
      updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [primaryKey({ columns: [t.personaId, t.slotId, t.level] }), index('evo_trainings_due').on(t.endsAt)],
  );
  ```
- [ ] **Step 2: Migration** — `npm run db:generate`; open the new SQL file and check it only adds the two columns + the table + index. Run `npm run dev:api` once (or however migrations apply on start — see `server/db/index.ts` `initDb`) and confirm no error.
- [ ] **Step 3: `server/db/evos.ts`**

```ts
// Timed evolution training rows (server/evos.ts parses them) and the user prefs the emails need.
import { and, eq, gt, isNotNull, isNull, lt, lte, notInArray, sql } from 'drizzle-orm';
import type { EvoTraining } from '../evos.js';
import { asLang, MAX_TRIES, STALE_MS, type MailLang } from '../evo-rules.js';
import { db } from './index.js';
import { evoTrainings, personas, users } from './schema.js';

export type TrainingRow = typeof evoTrainings.$inferSelect;
const sec = (s: number | null) => (s === null ? null : new Date(s * 1000));

/** Upsert what a response showed; a full list also drops slots no longer in it (claimed / expired). */
export async function saveTrainings(personaId: number, list: EvoTraining[], full: boolean): Promise<void> {
  await db.transaction(async (tx) => {
    if (full)
      await tx.delete(evoTrainings).where(
        list.length ? and(eq(evoTrainings.personaId, personaId), notInArray(evoTrainings.slotId, [...new Set(list.map((t) => t.slotId))])) : eq(evoTrainings.personaId, personaId),
      );
    for (const t of list) {
      // a level left behind once the slot moved on (claimed) goes away
      await tx.delete(evoTrainings).where(and(eq(evoTrainings.personaId, personaId), eq(evoTrainings.slotId, t.slotId), lt(evoTrainings.level, t.level)));
      await tx
        .insert(evoTrainings)
        .values({ personaId, slotId: t.slotId, level: t.level, levelCount: t.levelCount, slotName: t.slotName, itemId: t.itemId, player: t.player, startedAt: sec(t.startedAt), endsAt: sec(t.endsAt), ready: t.ready })
        .onConflictDoUpdate({
          target: [evoTrainings.personaId, evoTrainings.slotId, evoTrainings.level],
          set: {
            levelCount: t.levelCount, slotName: t.slotName, itemId: t.itemId, player: t.player, ready: t.ready, updatedAt: sql`now()`,
            // seen running before, ready now: keep the times we saw (and with them the email)
            startedAt: sql`coalesce(excluded.started_at, ${evoTrainings.startedAt})`,
            endsAt: sql`coalesce(excluded.ends_at, ${evoTrainings.endsAt})`,
          },
        });
    }
  });
}

export const trainingsOf = (personaId: number) =>
  db.select().from(evoTrainings).where(eq(evoTrainings.personaId, personaId)).orderBy(evoTrainings.endsAt);

/** Mirrors isDue() in server/evo-rules.ts. */
export const dueTrainings = (now: Date) =>
  db.select().from(evoTrainings).where(and(
    isNotNull(evoTrainings.endsAt), lte(evoTrainings.endsAt, now), gt(evoTrainings.endsAt, new Date(now.getTime() - STALE_MS)),
    isNull(evoTrainings.notifiedAt), lt(evoTrainings.tries, MAX_TRIES),
  ));

const key = (p: number, s: number, l: number) => and(eq(evoTrainings.personaId, p), eq(evoTrainings.slotId, s), eq(evoTrainings.level, l));
export async function markNotified(p: number, s: number, l: number) { await db.update(evoTrainings).set({ notifiedAt: sql`now()` }).where(key(p, s, l)); }
export async function failedTry(p: number, s: number, l: number) { await db.update(evoTrainings).set({ tries: sql`${evoTrainings.tries} + 1` }).where(key(p, s, l)); }

export async function ownerOf(personaId: number) {
  const [r] = await db.select({ userId: users.id, email: users.email, lang: users.lang, evoEmails: users.evoEmails })
    .from(personas).innerJoin(users, eq(users.id, personas.userId)).where(eq(personas.personaId, personaId));
  return r ? { ...r, lang: asLang(r.lang) } : null;
}

export async function prefsOf(userId: string): Promise<{ lang: MailLang; evoEmails: boolean }> {
  const [r] = await db.select({ lang: users.lang, evoEmails: users.evoEmails }).from(users).where(eq(users.id, userId));
  return { lang: asLang(r?.lang), evoEmails: r?.evoEmails ?? true };
}

export async function setPrefs(userId: string, p: { lang?: MailLang; evoEmails?: boolean }) {
  const set: Partial<typeof users.$inferInsert> = {};
  if (p.lang) set.lang = p.lang;
  if (typeof p.evoEmails === 'boolean') set.evoEmails = p.evoEmails;
  if (Object.keys(set).length) await db.update(users).set(set).where(eq(users.id, userId));
}
```
(Fix imports to what is actually used; `npm run typecheck` decides.)

- [ ] **Step 4: Verify** — `npm run typecheck` passes; in `psql` on the local `fcsolver` DB (`docker exec -it postgresql psql -U … fcsolver`) `\d evo_trainings` shows the table.
- [ ] **Step 5: Commit** — `feat(db): evo_trainings table and email prefs on users`.

---

### Task 4: Sources — relay, `academy` job, extension 0.8.9

**Files:**
- Modify: `server/events.ts:25-27` (`WATCHED_PATH`), `server/events.ts` `applyLoadedData` (~`:142`), header comment
- Modify: `server/jobs.ts:15` (`JobKind`)
- Modify: `server/sync.ts` `autoSync` client-mode branch (~`:347-353`)
- Modify: `extension/hook.js:10` (`WATCH`), `extension/hook.js:184-214` (`RECIPES`), `extension/manifest.json`, `extension/release.json`
- Modify: `docs/extension.md`, `docs/architecture.md`

**Interfaces:**
- Consumes: `parseAcademy`, `isFullList` (Task 1), `saveTrainings` (Task 3), `planFor` (`server/plans.ts`), `personaRow` (`server/db/users.ts`), `readCache`/`writeCache`, `enqueue`, `hasPending`, `lastSbcDrop`.
- Produces: cache key `acc.key('academy')` (value `{ slots: number }`, its `fetchedAt` = last full list); `JobKind` `'academy'`.

- [ ] **Step 1: Watched path.** Server `WATCHED_PATH` and extension `WATCH` both get `|academy(\/[\w-]+)*` inside the group (same regex in both files). This relays the hub list and any academy response the web app gets (e.g. after a claim); the server only uses responses with a `slots` array.
- [ ] **Step 2: Apply academy responses** in `applyLoadedData`, before the final `return undefined`:

```ts
  if (ev.path.startsWith('/academy/')) {
    if (!Array.isArray(res.slots)) return null;
    const list = parseAcademy(res, Math.floor(Date.now() / 1000));
    const full = isFullList(ev.path, ev.query ?? '', res.slots.length);
    await softly('save evolutions', () => saveTrainings(acc.id, list, full));
    if (full) await writeCache(acc.key('academy'), { slots: res.slots.length });
    return list.length || full ? 'Evolutions updated from the web app' : null;
  }
```
  Add a line to the header comment: `//  - academy responses (Evolutions) -> timed training rows (server/evos.ts).`
- [ ] **Step 3: Job kind.** `export type JobKind = 'club' | 'sbc' | 'challenges' | 'challengeSquad' | 'academy';`
- [ ] **Step 4: Daily enqueue** in `autoSync`, client-mode branch, after the `requestSync` line and before `return`:

```ts
      // timed evolutions: one read a day, only where someone gets the email (Premium)
      if (!jobStatus(acc).running && !hasPending(acc, 'academy') && (await academyDue(acc))) await enqueue(acc, 'academy');
```
  and add near `autoSync`:

```ts
async function academyDue(acc: Account): Promise<boolean> {
  const last = await readCache(acc.key('academy'));
  if (last && last.fetchedAt >= lastSbcDrop()) return false;
  const owner = await softly('academy owner', () => personaRow(acc.id));
  return !!owner && (await planFor(owner.userId)).tier === 'premium';
}
```
  (`softly` returns undefined on DB error → not due.) Make sure the job only starts when the web app is open (same as other jobs: `enqueue` is fine, `nextJob` hands it out while open). If `requestSync` threw for the budget, the catch already skips this.
- [ ] **Step 5: Recipe** in `extension/hook.js` `RECIPES`:

```js
    // timed evolutions (Training Camp): the list the web app's Evolutions screen loads, read only
    async academy(c) {
      await c('GET', '/academy/hub/v2?offset=0&count=20&sortOrder=asc&slotStatus=STARTED');
    },
```
- [ ] **Step 6: Version** — `extension/manifest.json` `"version": "0.8.9"`; `extension/release.json` new first key `"0.8.9": ["Reads your Evolutions, so FC Solver Premium can email you when a player's training is over"]`.
- [ ] **Step 7: Docs** — `docs/extension.md`: add `academy` to the recipe list and the academy path to the watched paths; `docs/architecture.md`: one paragraph "Evolution training" (relay + daily job → `evo_trainings` → email ticker).
- [ ] **Step 8: Verify** — `npm run typecheck`; `npm test`; with `npm run dev` running and the unpacked extension reloaded, open Evolutions in the EA web app and check `select slot_id, level, ends_at, ready from evo_trainings;` shows the slot with `ends_at` = start + 12 h (UTC).
- [ ] **Step 9: Commit** — `feat(evos): read evolutions from the web app and a daily academy job`.

---

### Task 5: Email sender + ticker + unsubscribe

**Files:**
- Create: `server/mail.ts`, `server/evo-alerts.ts`
- Modify: `server/index.ts` (ticker next to `:625`, unsubscribe routes), `.env.example`, `docs/deploy.md:27`
- Test: extend `server/evo-rules.test.ts` only if a new pure piece appears (the I/O here is verified manually).

**Interfaces:**
- Consumes: Task 2 (`isDue`, `decide`, `evoMail`, `unsubToken`, `checkUnsub`, `asLang`), Task 3 (`dueTrainings`, `markNotified`, `failedTry`, `ownerOf`, `setPrefs`, `prefsOf`), `planFor`, `loadMeta` (`server/meta.ts`, `meta.players[assetId].name`), `readCache` (`acc.key('club')` items by `id`).
- Produces: `sendMail(m: { to: string; subject: string; text: string; html: string; headers?: Record<string, string> }): Promise<boolean>`; `checkEvoAlerts(now?: number): Promise<void>`; `siteUrl(): string`; `emailSecret(): string`.

- [ ] **Step 1: `server/mail.ts`**

```ts
// Outgoing email through Resend's HTTP API. Without RESEND_API_KEY (local dev) the mail is logged instead.
export async function sendMail(m: { to: string; subject: string; text: string; html: string; headers?: Record<string, string> }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.log(`[mail] (not sent, no RESEND_API_KEY/EMAIL_FROM) to=${m.to} subject=${m.subject}\n${m.text}`);
    return true;
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html, headers: m.headers }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) console.warn(`[mail] resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r.ok;
  } catch (e) {
    console.warn(`[mail] resend failed: ${(e as Error).message}`);
    return false;
  }
}
```
  Never log the key or the recipient list beyond `to`.
- [ ] **Step 2: `server/evo-alerts.ts`**

```ts
// Every minute: trainings that just ended -> one email to the persona's owner (Premium, emails on).
import { decide, evoMail, unsubToken } from './evo-rules.js';
import { dueTrainings, failedTry, markNotified, ownerOf } from './db/evos.js';
import { planFor } from './plans.js';
import { loadMeta } from './meta.js';
import { sendMail } from './mail.js';

export const siteUrl = () => (process.env.SITE_URL || 'http://localhost:5173').replace(/\/+$/, '');
export const emailSecret = () => process.env.EMAIL_SECRET || process.env.CLERK_SECRET_KEY || '';

let busy = false;
export async function checkEvoAlerts(now = Date.now()): Promise<void> {
  if (busy) return; // a slow Resend call must not overlap the next tick
  busy = true;
  try {
    for (const r of await dueTrainings(new Date(now))) {
      const owner = await ownerOf(r.personaId);
      const tier = owner ? (await planFor(owner.userId)).tier : 'free';
      if (!owner || decide({ tier, evoEmails: owner.evoEmails, email: owner.email }) === 'skip') {
        await markNotified(r.personaId, r.slotId, r.level); // closed: never mailed later
        continue;
      }
      const meta = await loadMeta();
      const assetId = Number((r.player as { assetId?: number } | null)?.assetId);
      const player = meta.players[String(assetId)]?.name ?? { en: 'Your player', ro: 'Jucătorul tău', it: 'Il tuo giocatore' }[owner.lang];
      const unsubUrl = `${siteUrl()}/api/evos/unsubscribe?u=${encodeURIComponent(owner.userId)}&t=${unsubToken(owner.userId, emailSecret())}`;
      const mail = evoMail(owner.lang, { player, evo: r.slotName, level: r.level, levelCount: r.levelCount, evosUrl: `${siteUrl()}/dashboard/evolutions`, unsubUrl });
      const ok = await sendMail({ to: owner.email, ...mail, headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } });
      if (ok) await markNotified(r.personaId, r.slotId, r.level);
      else await failedTry(r.personaId, r.slotId, r.level);
    }
  } catch (e) {
    console.error(`[evos] alert tick failed: ${(e as Error).message}`);
  } finally {
    busy = false;
  }
}
```
  (Check the real key type of `meta.players` — `Record<string, …>` keyed by asset id; adjust if keyed differently.)
- [ ] **Step 3: Ticker** in `server/index.ts` next to `setInterval(() => void autoSyncAll(), 60 * 1000);`:
  ```ts
  setInterval(() => void checkEvoAlerts(), 60 * 1000);
  ```
- [ ] **Step 4: Unsubscribe route** in `server/index.ts` (users section):

```ts
/** One click from an evolution email: no sign-in, the HMAC proves the link came from us. */
const unsubscribe = async (req: FastifyRequest<{ Querystring: { u?: string; t?: string } }>, reply: FastifyReply) => {
  const { u = '', t = '' } = req.query ?? {};
  if (!u || !checkUnsub(u, t, emailSecret())) return reply.code(400).type('text/plain').send('Invalid link.');
  await setPrefs(u, { evoEmails: false });
  const lang = (await prefsOf(u)).lang;
  const msg = { en: 'Done: no more evolution emails. You can turn them back on in FC Solver settings.', ro: 'Gata: nu mai primești emailuri despre evoluții. Le poți reporni din setările FC Solver.', it: 'Fatto: niente più email sulle evoluzioni. Puoi riattivarle nelle impostazioni di FC Solver.' }[lang];
  return reply.type('text/plain; charset=utf-8').send(msg);
};
app.get('/api/evos/unsubscribe', unsubscribe);
app.post('/api/evos/unsubscribe', unsubscribe); // RFC 8058 one-click
```
- [ ] **Step 5: Env + docs** — `.env.example`: `RESEND_API_KEY=`, `EMAIL_FROM="FC Solver <noreply@mario-theodor.ro>"`, `EMAIL_SECRET=` with a one-line comment each; `docs/deploy.md` env list: the same three + "domain verified in Resend (DNS records in Cloudflare, DNS only)".
- [ ] **Step 6: Verify** — with no `RESEND_API_KEY`: in psql set a row's `ends_at = now() - interval '1 minute', notified_at = null, tries = 0` for a persona owned by a Premium (or admin) user; within a minute the API log shows `[mail] (not sent…)` with the right player name and language, and `notified_at` is set. Repeat as a free user → no log, `notified_at` set. Open the unsubscribe URL from the log → message shown, `users.evo_emails = false`. Then with the real key in `.env` (owner's own address), one real email arrives. `npm run typecheck`, `npm test`.
- [ ] **Step 7: Commit** — `feat(evos): email Premium owners when a training ends`.

---

### Task 6: API for the site

**Files:**
- Modify: `server/index.ts` (`/api/me` at `:160-168`, new routes), `docs/api.md`

**Interfaces:**
- Consumes: `trainingsOf`, `prefsOf`, `setPrefs` (Task 3), `asLang` (Task 2), `toPlayer` (`server/squad.ts:46`), `metaFor(acc)`, `siteContext`, `siteUser`, `planFor`, `SessionError`.
- Produces (JSON):
  - `GET /api/me` → adds `prefs: { lang, evoEmails }`.
  - `GET /api/evos` → `{ fetchedAt: number | null, evos: { slotId, level, levelCount, slotName, player: Player | null, startedAt: number | null, endsAt: number | null, ready: boolean }[] }` (times in **ms**). 403 `msgCode: 'premiumOnly'` for free users.
  - `PUT /api/me/prefs` body `{ lang?: 'en'|'ro'|'it', evoEmails?: boolean }` → `{ ok: true }`.

- [ ] **Step 1: Routes**

```ts
app.get('/api/evos', async (req) => {
  const { userId, acc } = await siteContext(req);
  if ((await planFor(userId)).tier !== 'premium') throw new SessionError('Evolution alerts are a Premium feature.', 403, 'premiumOnly');
  const meta = await metaFor(acc);
  const last = await readCache(acc.key('academy'));
  const ms = (d: Date | null) => d?.getTime() ?? null;
  const evos = (await trainingsOf(acc.id)).map((r) => ({
    slotId: r.slotId, level: r.level, levelCount: r.levelCount, slotName: r.slotName,
    player: r.player ? toPlayer(r.player as unknown as ClubItem, meta) : null,
    startedAt: ms(r.startedAt), endsAt: ms(r.endsAt), ready: r.ready || (!!r.endsAt && r.endsAt.getTime() <= Date.now()),
  }));
  return { fetchedAt: last?.fetchedAt ?? null, evos };
});

app.put<{ Body: { lang?: unknown; evoEmails?: unknown } }>('/api/me/prefs', async (req) => {
  const userId = await siteUser(req);
  const b = req.body ?? {};
  await setPrefs(userId, {
    lang: b.lang === undefined ? undefined : asLang(b.lang),
    evoEmails: typeof b.evoEmails === 'boolean' ? b.evoEmails : undefined,
  });
  return { ok: true };
});
```
  In `/api/me` add `prefs: await prefsOf(userId)` to the returned object. Add `err.premiumOnly` to the web locales in Task 7.
- [ ] **Step 2: `docs/api.md`** — document the three endpoints + `prefs` in `/api/me` + the unsubscribe route + the new watched academy paths and `academy` job kind.
- [ ] **Step 3: Verify** — `npm run typecheck`; with the dev server and a signed-in Premium user, `GET /api/evos` in the browser network tab returns the tracked slot with `endsAt` in ms; a free user gets 403 `premiumOnly`.
- [ ] **Step 4: Commit** — `feat(api): evolutions list and email prefs`.

---

### Task 7: Evolutions screen, Settings toggle, language save

**Files:**
- Create: `web/src/evos.ts`, `web/src/evos.test.ts`, `web/src/components/EvosView.tsx`
- Modify: `web/src/route.ts` (type `Route` + `parseRoute` + path builder + header comment), `web/src/api.ts` (`api.evos`, `api.prefs`, `me` type), `web/src/App.tsx` (sidebar `:659-690`, view switch `:733-760`, title `:288`, Settings card), `web/src/i18n.tsx` or `Root.tsx` (save lang), `web/src/styles.css`, `web/src/locales/en.ts`, `ro.ts`, `it.ts`

**Interfaces:**
- Consumes: Task 6 JSON; `Card` (`web/src/components/Card.tsx`, props `player`, `meta`, `size`); `useI18n().t`; `navigate`.
- Produces: `export function timeLeft(endsAt: number, now: number): { done: boolean; days: number; hours: number; minutes: number }` in `web/src/evos.ts`.

- [ ] **Step 1: Failing test** `web/src/evos.test.ts`

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timeLeft } from './evos.js';

test('timeLeft rounds minutes up and stops at zero', () => {
  const now = Date.UTC(2026, 9, 1, 19, 51);
  assert.deepEqual(timeLeft(now + (11 * 60 + 58) * 60e3, now), { done: false, days: 0, hours: 11, minutes: 58 });
  assert.deepEqual(timeLeft(now + 30e3, now), { done: false, days: 0, hours: 0, minutes: 1 });
  assert.deepEqual(timeLeft(now + (26 * 60) * 60e3, now), { done: false, days: 1, hours: 2, minutes: 0 });
  assert.deepEqual(timeLeft(now, now), { done: true, days: 0, hours: 0, minutes: 0 });
  assert.deepEqual(timeLeft(now - 5e3, now), { done: true, days: 0, hours: 0, minutes: 0 });
});
```
  Run `node --import tsx --test web/src/evos.test.ts` → FAIL.
- [ ] **Step 2: `web/src/evos.ts`**

```ts
// Countdown for a training end time (epoch ms, from the server); the browser's clock, any time zone.
export function timeLeft(endsAt: number, now: number) {
  const ms = endsAt - now;
  if (ms <= 0) return { done: true, days: 0, hours: 0, minutes: 0 };
  const total = Math.ceil(ms / 60e3);
  return { done: false, days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}
```
  Run → PASS.
- [ ] **Step 3: Route** — `Route` gains `| { view: 'evolutions' }`; `parseRoute`: `if (x === 'evolutions') return { view: 'evolutions' };`; wherever a route becomes a path (look for the `club` → `/dashboard/club` builder) add `evolutions` → `/dashboard/evolutions`; header comment gets `/dashboard/evolutions  evolutions`. If `route.test.ts` exists, add a case.
- [ ] **Step 4: API helpers** in `web/src/api.ts`:

```ts
export interface Evo { slotId: number; level: number; levelCount: number; slotName: string; player: Player | null; startedAt: number | null; endsAt: number | null; ready: boolean }
  evos: () => req<{ fetchedAt: number | null; evos: Evo[] }>('/api/evos'),
  prefs: (p: { lang?: string; evoEmails?: boolean }) => req<{ ok: true }>('/api/me/prefs', { method: 'PUT', body: p }),
```
  and `me` gets `prefs: { lang: string; evoEmails: boolean }`.
- [ ] **Step 5: `EvosView.tsx`** — props `{ premium: boolean; meta: Meta; onUpgrade: () => void }`.
  - Free: a `settings-card locked`-style panel (reuse the existing locked pattern from Settings `App.tsx:761-767`) with `t('evos.lockedTitle')`, `t('evos.lockedBody')` and the existing upgrade button/link; **no fetch**.
  - Premium: `useEffect` → `api.evos()`; reload when the app's edit counter changes (same mechanism the club view uses to reload after `markEdited`). A `now` state updated every 30 s (`setInterval`, cleared on unmount).
  - List sorted: ready first, then by `endsAt`. Each item (`<li className="evo-card">`): `<Card player={e.player} meta={meta} size="sm" />` (skip if `player` null), `<h3>{e.slotName}</h3>` (EA text as is), `t('evos.level', { level: e.level, count: e.levelCount })`, status line with icon + text:
    - ready or `timeLeft().done` → `<CheckCircle weight="fill" />` + `t('evos.ready')`, class `evo-status ready` (uses `--go`);
    - else `<Timer />` + `t('evos.training', { left })` where `left` = `t('evos.left.dhm'|'evos.left.hm'|'evos.left.m', {…})` and a second muted line `t('evos.endsAt', { time: new Date(e.endsAt).toLocaleString(lang, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) })`;
    - status also as `aria-label` text; no color-only state.
  - Empty: `t('evos.empty')` ("Timed evolutions show up here after you open Evolutions in the EA web app, or after the daily sync.").
  - Footer muted: `t('evos.emailNote')` + link to Settings.
  - Phosphor icons: `Timer`, `CheckCircle`, `Barbell` (sidebar).
- [ ] **Step 6: App wiring** — sidebar button between Club and Settings (`<Barbell />` + `t('nav.evolutions')`, `aria-current` like the others, `go('evolutions')`); title map `view === 'evolutions' ? 'Evolutions'`; render `{!showGuide && view === 'evolutions' && meta && <EvosView premium={premium} meta={meta} onUpgrade={…same as PlanCard…} />}`. Check that `go(...)` accepts the new view and the hamburger menu (< 860 px) shows it.
- [ ] **Step 7: Settings toggle** — in the Settings view a card "Email alerts": checkbox `t('evos.emailToggle')`, `checked={prefs.evoEmails}`, disabled + locked note for free users, `onChange` → optimistic state + `api.prefs({ evoEmails })`, revert + error toast on failure. Initial value from `api.me().prefs`.
- [ ] **Step 8: Save language** — where `setLang` changes the language for a signed-in user (`web/src/i18n.tsx:56` or the `LangMenu` handlers in `Root.tsx` / `App.tsx`), also call `api.prefs({ lang })` (ignore errors; signed-out → skip). On sign-in, if `me.prefs.lang` differs from the current UI language, send the current one once (the UI language wins; it is what the user sees).
- [ ] **Step 9: i18n keys** (en / ro / it; Romanian plurals not needed — counts appear only in `level x of y` and the `d/h/m` formats, written without plural words): `nav.evolutions`, `evos.title`, `evos.level`, `evos.training`, `evos.left.dhm` (`{days}d {hours}h {minutes}m`), `evos.left.hm`, `evos.left.m`, `evos.endsAt`, `evos.ready`, `evos.empty`, `evos.emailNote`, `evos.emailToggle`, `evos.lockedTitle`, `evos.lockedBody`, `err.premiumOnly`. Example en: `'evos.training': 'In training · {left} left'`, `'evos.ready': 'Ready to claim in the EA web app'`, `'evos.level': 'Level {level} of {count}'`. Run `npm run i18n:check`.
- [ ] **Step 10: CSS** in `web/src/styles.css`: `.evo-list` grid (`repeat(auto-fill, minmax(260px, 1fr))`, gap), `.evo-card` container radius 14px, dark teal surface like other cards, `.evo-status` with icon + text, `.evo-status.ready { color: var(--go) }`; one column under 860px; no animation beyond existing tokens (`prefers-reduced-motion` respected).
- [ ] **Step 11: Verify** — `npm test`, `npm run typecheck`, `npm run build`, `npm run i18n:check`. In the browser (dev server running): Premium user sees the tracked slot with the same remaining time as the EA web app; free user sees the locked screen and no `/api/evos` request; 390 px width: menu shows Evolutions, cards one column, no horizontal scroll; switch language → `users.lang` updates in the DB; Settings toggle flips `users.evo_emails`.
- [ ] **Step 12: Commit** — `feat(web): evolutions screen and email alert toggle`.

---

### Task 8: Final verification

- [ ] `npm test && npm run typecheck && npm run build && npm run i18n:check` — all green, output pasted in the report.
- [ ] End-to-end on real data: extension 0.8.9 reloaded, open Evolutions in the EA web app → row in `evo_trainings`; set its `ends_at` to one minute ago in psql → email (logged or real) in the owner's language; the Evolutions screen shows "Ready to claim".
- [ ] `git log --oneline` shows one commit per task; `git status` clean. Do not push.
