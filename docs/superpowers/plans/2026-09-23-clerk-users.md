# Users via Clerk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sign in with Google or an emailed code (own UI on Clerk hooks); every EA persona belongs to one FC Solver user, linked automatically by the extension; the site stops using browser-held access keys.

**Architecture:** The site sends a Clerk session token + `X-Persona`; `server/auth.ts` verifies it with `@clerk/backend` and checks ownership in Postgres (`users`, `personas`, `link_tokens`, queries in `server/db/users.ts`). The extension keeps its per-persona key; a new content script `site.js` hands it a short-lived link token from the signed-in site, which `/api/hello` uses to attach the persona to the user. The web app gets a `Root` gate (Clerk loaded / signed out / signed in) in front of the existing `App`.

**Tech Stack:** Node 24 + TS via `tsx`, Fastify 5, Postgres 18 + Drizzle, `@clerk/backend` 3.x, React 19 + Vite 8, `@clerk/react` 6.x (signal API), Chrome MV3, `node:test`.

**Spec:** `docs/superpowers/specs/2026-09-23-clerk-users-design.md`

## Global Constraints

- Never add an EA request except the existing one-time `/usermassinfo` SID proof; never write to EA.
- Never print or commit keys, SIDs, `.env`, `DATABASE_URL`, `CLERK_SECRET_KEY`. `VITE_CLERK_PUBLISHABLE_KEY` is public but still lives only in `.env`.
- No Clerk UI components. Allowed from `@clerk/react`: `ClerkProvider`, `useAuth`, `useClerk`, `useSignIn`, `useSignUp`, `HandleSSOCallback` (headless).
- Every user-facing string through `t()`, keys in `web/src/locales/en.ts` + `ro.ts`; `npm run i18n:check` passes. EA-sourced text (persona names, club names) stays as EA sends it.
- UI rules (CLAUDE.md / DESIGN.md): dark teal, `--go` only for the primary action / met / selected, controls `var(--r-ctl)` (8px), containers `var(--r-box)` (14px), WCAG AA, state never by color alone, `prefers-reduced-motion` respected, phone width 390px checked, under 860px the sidebar is the hamburger menu.
- Server errors shown to users carry a `msgCode` (`SessionError(msg, status, msgCode)`); the site translates `err.<msgCode>`.
- New endpoint or payload change → `docs/api.md`. Extension change → bump `extension/manifest.json` version + `extension/release.json`.
- Extension zip folder stays `fc27-sbc-builder`; `localStorage` keys keep the `sbc-*` prefix.
- Branch `dev`; `git pull --rebase` before starting each task (on a clean tree); commit per task with `type(scope): subject` and the two attribution lines:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01L5tvz1oKUwcQvY2AfSdzJQ
  ```
  Never push. Production runs `dev`: do not deploy before Task 7 is done (Tasks 3–6 leave the site half-migrated).
- `npm run dev` may already be running; don't kill it. It needs `CLERK_SECRET_KEY` from Task 3 on.

## Prerequisite (user, before Task 3 verification)

A Clerk **development** instance: clerk.com → new application → sign-in options: **Email address** with **Email verification code**, **Google**; turn **Password** off; no required names / username. Put in the repo-root `.env` (git-ignored):
```
CLERK_SECRET_KEY=sk_test_...
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
```
If the keys are missing when a task needs them, stop and ask the user.

## File map

| File | Responsibility |
|---|---|
| `server/auth-rules.ts` (new) | pure: `linkDecision`, `newLinkToken`, `hashToken` |
| `server/auth-rules.test.ts` (new) | unit tests |
| `web/src/next.ts` (new) | pure: `safeNext` |
| `web/src/next.test.ts` (new) | unit tests |
| `server/db/schema.ts` | + `users`, `personas`, `linkTokens` |
| `server/db/migrations/0001_*.sql` (generated) | migration |
| `server/db/users.ts` (new) | user / persona / link-token queries |
| `server/auth.ts` (new) | Clerk verification, `siteUser`, `siteAccount`, `optionalSiteAccount` |
| `server/accounts.ts` | `hello()` reports `proved`; `accountById` |
| `server/index.ts` | site endpoints on Clerk auth; `/api/me`, `/api/me/legacy-keys`, `/api/link-token`, `DELETE /api/personas/:id`; `/api/hello` linking; `/api/accounts` removed; CORS |
| `extension/site.js` (new), `extension/background.js`, `extension/popup.js`, `extension/manifest.json`, `extension/release.json` | linking |
| `web/src/main.tsx`, `web/src/Root.tsx` (new) | `ClerkProvider`, auth gate, public pages |
| `web/src/components/SignIn.tsx` (new) | sign-in / sign-up screen |
| `web/src/link.ts` (new) | site ↔ extension messages |
| `web/src/legacy.ts` (new) | old-key settings migration |
| `web/src/api.ts`, `web/src/route.ts`, `web/src/App.tsx`, `web/src/styles.css`, `web/src/locales/*.ts` | auth headers, routes, persona handling, account settings |
| `vite.config.ts` | `envDir: '..'` |
| `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `.env.example` | Clerk keys in build / runtime |
| `docs/api.md`, `docs/extension.md`, `docs/architecture.md`, `docs/deploy.md`, `CLAUDE.md` | docs |

---

### Task 1: Pure rules with unit tests

**Files:**
- Create: `server/auth-rules.ts`, `server/auth-rules.test.ts`, `web/src/next.ts`, `web/src/next.test.ts`
- Modify: `package.json` (`test` script)

**Interfaces:**
- Produces:
  - `type LinkDecision = 'already' | 'link' | 'needSid' | 'takeover'`
  - `linkDecision(owner: string | null, userId: string, provedBySid: boolean): LinkDecision`
  - `newLinkToken(): string` (43 chars base64url)
  - `hashToken(token: string): string` (64 hex chars)
  - `safeNext(raw: string | null | undefined): string` (in `web/src/next.ts`)

- [ ] **Step 1: Widen the test script**

In `package.json` replace
```json
"test": "node --import tsx --test 'server/**/*.test.ts'",
```
with
```json
"test": "node --import tsx --test 'server/**/*.test.ts' 'web/src/**/*.test.ts'",
```

- [ ] **Step 2: Write the failing tests**

`server/auth-rules.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashToken, linkDecision, newLinkToken } from './auth-rules.js';

test('linkDecision', () => {
  assert.equal(linkDecision(null, 'user_a', false), 'link');
  assert.equal(linkDecision('user_a', 'user_a', false), 'already');
  assert.equal(linkDecision('user_b', 'user_a', false), 'needSid');
  assert.equal(linkDecision('user_b', 'user_a', true), 'takeover');
  assert.equal(linkDecision(null, 'user_a', true), 'link');
});

test('link tokens are random and hashed', () => {
  const a = newLinkToken(), b = newLinkToken();
  assert.notEqual(a, b);
  assert.match(a, /^[\w-]{43}$/);
  assert.match(hashToken(a), /^[0-9a-f]{64}$/);
  assert.equal(hashToken(a), hashToken(a));
  assert.notEqual(hashToken(a), hashToken(b));
});
```

`web/src/next.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { safeNext } from './next.js';

test('safeNext keeps internal paths', () => {
  assert.equal(safeNext('/sbc/16/39'), '/sbc/16/39');
  assert.equal(safeNext('/club?x=1'), '/club?x=1');
});

test('safeNext refuses anything else', () => {
  for (const bad of [null, undefined, '', 'club', '//evil.com', '/\\evil.com', 'https://evil.com', '/signin', '/signin/callback', ' /club'])
    assert.equal(safeNext(bad), '/', String(bad));
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test`
Expected: FAIL, `ERR_MODULE_NOT_FOUND` for `auth-rules.js` and `next.js`.

- [ ] **Step 4: Implement**

`server/auth-rules.ts`:
```ts
// Pure rules for linking EA personas to FC Solver users.
import { createHash, randomBytes } from 'node:crypto';

export type LinkDecision = 'already' | 'link' | 'needSid' | 'takeover';

/**
 * A persona nobody owns (or already ours) links on the key the extension holds.
 * Owned by someone else: only a fresh EA session proof (SID) moves it.
 */
export function linkDecision(owner: string | null, userId: string, provedBySid: boolean): LinkDecision {
  if (owner === userId) return 'already';
  if (owner === null) return 'link';
  return provedBySid ? 'takeover' : 'needSid';
}

export const newLinkToken = () => randomBytes(32).toString('base64url');
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');
```

`web/src/next.ts`:
```ts
/** Where to go after signing in: only a path on this site, never back to the sign-in screen. */
export function safeNext(raw: string | null | undefined): string {
  if (!raw || !/^\/(?![/\\])\S*$/.test(raw)) return '/';
  if (raw === '/signin' || raw.startsWith('/signin/') || raw.startsWith('/signin?')) return '/';
  return raw;
}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npm test && npm run typecheck`
Expected: `# fail 0`, 12 tests pass (8 existing + 4 new); typecheck exit 0.

- [ ] **Step 6: Commit**

```bash
git add package.json server/auth-rules.ts server/auth-rules.test.ts web/src/next.ts web/src/next.test.ts
git commit -m "feat(auth): link decision, link tokens, safe next path" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L5tvz1oKUwcQvY2AfSdzJQ"
```

---

### Task 2: User tables and queries

**Files:**
- Modify: `server/db/schema.ts`
- Create: `server/db/users.ts`, `server/db/migrations/0001_*.sql` (generated)

**Interfaces:**
- Consumes: `db` from `server/db/index.ts`; `newLinkToken`, `hashToken` (Task 1).
- Produces (`server/db/users.ts`):
  - `touchUser(id: string): Promise<{ email: string }>` — insert or bump `last_seen_at`; returns the stored email (`''` when unknown)
  - `setUserEmail(id: string, email: string): Promise<void>`
  - `personaRow(personaId: number): Promise<{ userId: string; previousUserId: string | null } | null>`
  - `personasOf(userId: string): Promise<number[]>`
  - `setOwner(personaId: number, userId: string): Promise<void>` — upsert; on takeover `previous_user_id` = old owner
  - `unlinkPersona(personaId: number, userId: string): Promise<boolean>`
  - `createLinkToken(userId: string): Promise<string>` — plain token, 10 min, deletes stale tokens
  - `linkTokenUser(token: string): Promise<string | null>` — user of a valid unused token
  - `consumeLinkToken(token: string): Promise<boolean>` — atomic mark-used

- [ ] **Step 1: Add the tables** — append to `server/db/schema.ts`

Change the import line to:
```ts
import { bigint, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
```
(unchanged if it already matches) and append:
```ts
/** FC Solver users, keyed by their Clerk user id. Sub-project 3 adds subscription columns here. */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Which user owns an EA persona. One owner per persona; a takeover remembers the previous one. */
export const personas = pgTable(
  'personas',
  {
    personaId: bigint('persona_id', { mode: 'number' }).primaryKey(),
    userId: text('user_id').notNull().references(() => users.id),
    previousUserId: text('previous_user_id'),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('personas_user').on(t.userId)],
);

/** Short-lived, single-use tokens the signed-in site hands the extension. Only the hash is kept. */
export const linkTokens = pgTable('link_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});
```

- [ ] **Step 2: Generate and apply the migration**

Run: `npm run db:generate`
Expected: `server/db/migrations/0001_<name>.sql` creating `users`, `personas` (FK to `users`, index `personas_user`), `link_tokens` (FK to `users`). Read the SQL and check exactly that; it must not touch the 4 tables from sub-project 1.
Apply: start the API once (`npm run dev` restarts itself; otherwise `timeout 12 npx tsx server/index.ts`), then
`docker exec postgresql psql -U postgres -d fcsolver -Atc "\dt"` → 7 tables, `select count(*) from drizzle.__drizzle_migrations` → `2`.

- [ ] **Step 3: `server/db/users.ts`**

```ts
// FC Solver users and which EA personas they own. Personas are never deleted here except by
// their own user ("Disconnect"); a takeover keeps the previous owner for the "taken over" notice.
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { hashToken, newLinkToken } from '../auth-rules.js';
import { db } from './index.js';
import { linkTokens, personas, users } from './schema.js';

const LINK_TTL_MS = 10 * 60 * 1000;

export async function touchUser(id: string): Promise<{ email: string }> {
  const [row] = await db
    .insert(users)
    .values({ id })
    .onConflictDoUpdate({ target: users.id, set: { lastSeenAt: sql`now()` } })
    .returning({ email: users.email });
  return { email: row?.email ?? '' };
}

export async function setUserEmail(id: string, email: string): Promise<void> {
  await db.update(users).set({ email }).where(eq(users.id, id));
}

export async function personaRow(personaId: number) {
  const [row] = await db
    .select({ userId: personas.userId, previousUserId: personas.previousUserId })
    .from(personas)
    .where(eq(personas.personaId, personaId));
  return row ?? null;
}

export async function personasOf(userId: string): Promise<number[]> {
  const rows = await db.select({ id: personas.personaId }).from(personas).where(eq(personas.userId, userId));
  return rows.map((r) => r.id);
}

export async function setOwner(personaId: number, userId: string): Promise<void> {
  await db
    .insert(personas)
    .values({ personaId, userId })
    .onConflictDoUpdate({
      target: personas.personaId,
      set: { previousUserId: sql`${personas.userId}`, userId, linkedAt: sql`now()` },
    });
}

export async function unlinkPersona(personaId: number, userId: string): Promise<boolean> {
  const gone = await db
    .delete(personas)
    .where(and(eq(personas.personaId, personaId), eq(personas.userId, userId)))
    .returning({ id: personas.personaId });
  return gone.length > 0;
}

export async function createLinkToken(userId: string): Promise<string> {
  // stale tokens are not history: drop them while we are here
  await db.delete(linkTokens).where(or(lt(linkTokens.expiresAt, sql`now()`), sql`${linkTokens.usedAt} is not null`));
  const token = newLinkToken();
  await db.insert(linkTokens).values({ tokenHash: hashToken(token), userId, expiresAt: new Date(Date.now() + LINK_TTL_MS) });
  return token;
}

const usable = (token: string) =>
  and(eq(linkTokens.tokenHash, hashToken(token)), isNull(linkTokens.usedAt), gt(linkTokens.expiresAt, sql`now()`));

export async function linkTokenUser(token: string): Promise<string | null> {
  const [row] = await db.select({ userId: linkTokens.userId }).from(linkTokens).where(usable(token));
  return row?.userId ?? null;
}

export async function consumeLinkToken(token: string): Promise<boolean> {
  const done = await db.update(linkTokens).set({ usedAt: sql`now()` }).where(usable(token)).returning({ u: linkTokens.userId });
  return done.length > 0;
}
```
Note on `setOwner`: in `ON CONFLICT DO UPDATE`, `${personas.userId}` renders as `"personas"."user_id"`, the existing row's value, so `previous_user_id` gets the old owner. Verified in Step 4.

- [ ] **Step 4: Verify the queries against the local DB**

```bash
node --import tsx -e "
const D = await import('./server/db/index.ts');
const U = await import('./server/db/users.ts');
await D.initDb();
await U.touchUser('user_test_a'); await U.touchUser('user_test_b');
await U.setOwner(999001, 'user_test_a');
console.log('a owns', await U.personasOf('user_test_a'), await U.personaRow(999001));
await U.setOwner(999001, 'user_test_b');
console.log('after takeover', await U.personaRow(999001));
const tok = await U.createLinkToken('user_test_a');
console.log('token user', await U.linkTokenUser(tok), 'consume', await U.consumeLinkToken(tok), 'again', await U.consumeLinkToken(tok), 'user now', await U.linkTokenUser(tok));
console.log('unlink by a', await U.unlinkPersona(999001, 'user_test_a'), 'by b', await U.unlinkPersona(999001, 'user_test_b'));
await D.closeDb();"
docker exec postgresql psql -U postgres -d fcsolver -c "delete from link_tokens where user_id like 'user_test_%'; delete from personas where user_id like 'user_test_%'; delete from users where id like 'user_test_%'"
```
Expected:
```
a owns [ 999001 ] { userId: 'user_test_a', previousUserId: null }
after takeover { userId: 'user_test_b', previousUserId: 'user_test_a' }
token user user_test_a consume true again false user now null
unlink by a false by b true
```
(Use the namespace `D.db`, not a destructured `db`: `db` is a live binding set by `initDb()`.)

- [ ] **Step 5: Typecheck, tests, commit**

Run: `npm run typecheck && npm test` → exit 0, `# fail 0`.
```bash
git add server/db/schema.ts server/db/users.ts server/db/migrations
git commit -m "feat(db): users, persona owners, link tokens" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L5tvz1oKUwcQvY2AfSdzJQ"
```

---

### Task 3: Server auth and endpoints

**Files:**
- Create: `server/auth.ts`
- Modify: `server/accounts.ts` (`hello`, new `accountById`), `server/index.ts`, `package.json` (dep), `.env.example`, `docs/api.md`

**Interfaces:**
- Consumes: Task 1 `linkDecision`; Task 2 queries; `SessionError` (`server/ea.ts`); `Account`, `accountByKey` (`server/accounts.ts`).
- Produces:
  - `initAuth(): void` — throws `Error('CLERK_SECRET_KEY is not set')`
  - `siteUser(req: FastifyRequest): Promise<string>` — Clerk user id, else `SessionError(…, 401, 'signIn')`
  - `siteAccount(req: FastifyRequest): Promise<Account>` — else 400 `noPersona` / 403 `personaNotYours` / 403 `personaTakenOver`
  - `optionalSiteAccount(req: FastifyRequest): Promise<Account | null>`
  - `accountById(id: number): Account | null` (accounts.ts)
  - `hello()` returns `{ account: Account; proved: boolean } | { needSid: true }`
  - HTTP: `GET /api/me` → `{ user: { id, email }, personas: AccountJSON[] }`; `POST /api/me/legacy-keys` `{ keys: string[] }` → `{ map: Record<string, number> }`; `POST /api/link-token` → `{ token, expiresIn: 600 }`; `DELETE /api/personas/:id` → `{ ok: true }`; `POST /api/hello` accepts `linkToken`, returns `linked: number | null`, `linkRejected: boolean`.

- [ ] **Step 1: Install**

Run: `npm install @clerk/backend@^3`
Expected: `@clerk/backend` 3.x in `dependencies`.
Check the API you are about to use exists in the installed version:
`grep -n "export declare function verifyToken" node_modules/@clerk/backend/dist/tokens/verify.d.ts` and `grep -n "createClerkClient" node_modules/@clerk/backend/dist/index.d.ts | head -3`. If either is missing, stop and ask.

- [ ] **Step 2: `server/auth.ts`**

```ts
// Who is calling from the site: a Clerk session token (Authorization: Bearer) plus the EA persona
// they are looking at (X-Persona). The extension does not come through here; it keeps its key.
import type { FastifyRequest } from 'fastify';
import { createClerkClient, verifyToken } from '@clerk/backend';
import { SessionError } from './ea.js';
import { accountById, type Account } from './accounts.js';
import { personaRow, setUserEmail, touchUser } from './db/users.js';

let secretKey = '';
let clerk: ReturnType<typeof createClerkClient> | null = null;
// tokens minted for another site must not work here
const PARTIES = (process.env.SITE_ORIGINS ??
  'http://localhost:5173,http://127.0.0.1:5173,http://localhost:5178,http://127.0.0.1:5178,https://sbc-builder.mario-theodor.ro')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/** Call after initDb() (which loads .env). */
export function initAuth(): void {
  secretKey = process.env.CLERK_SECRET_KEY ?? '';
  if (!secretKey) throw new Error('CLERK_SECRET_KEY is not set');
  clerk = createClerkClient({ secretKey });
}

const signIn = () => new SessionError('Sign in first.', 401, 'signIn');
const seenAt = new Map<string, number>();

/** Keep users.last_seen_at roughly fresh without a write per request; fetch the email once. */
async function remember(id: string) {
  if (Date.now() - (seenAt.get(id) ?? 0) < 5 * 60 * 1000) return;
  seenAt.set(id, Date.now());
  const { email } = await touchUser(id);
  if (email || !clerk) return;
  try {
    const u = await clerk.users.getUser(id);
    await setUserEmail(id, u.primaryEmailAddress?.emailAddress ?? '');
  } catch (e) {
    console.error(`[auth] email for ${id} failed: ${(e as Error).message}`);
  }
}

export async function siteUser(req: FastifyRequest): Promise<string> {
  const h = req.headers.authorization;
  const token = typeof h === 'string' && h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw signIn();
  const { data, errors } = await verifyToken(token, { secretKey, authorizedParties: PARTIES });
  if (errors || !data?.sub) throw signIn();
  await remember(data.sub);
  return data.sub;
}

export async function siteAccount(req: FastifyRequest): Promise<Account> {
  const userId = await siteUser(req);
  const raw = req.headers['x-persona'];
  const id = Number(Array.isArray(raw) ? raw[0] : raw);
  if (!Number.isInteger(id) || id <= 0) throw new SessionError('Pick an EA account first.', 400, 'noPersona');
  const row = await personaRow(id);
  const acc = accountById(id);
  if (row?.userId === userId && acc) return acc;
  if (row?.previousUserId === userId)
    throw new SessionError('This EA account is now linked to another FC Solver user.', 403, 'personaTakenOver');
  throw new SessionError('This EA account is not linked to you.', 403, 'personaNotYours');
}

/** For endpoints that also work signed out (/api/meta). */
export async function optionalSiteAccount(req: FastifyRequest): Promise<Account | null> {
  if (!req.headers.authorization || !req.headers['x-persona']) return null;
  try {
    return await siteAccount(req);
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: `server/accounts.ts`**

Add after `listAccounts()`:
```ts
export function accountById(id: number): Account | null {
  return accounts.get(id) ?? null;
}
```
In `hello()` change the return type to
```ts
Promise<{ account: Account; proved: boolean } | { needSid: true }>
```
the key branch `return { account: byKey };` to `return { account: byKey, proved: false };`, and the final `return { account };` to `return { account, proved: true };`. Update the doc comment's first line to: `Extension 0.7+: the web app told the extension who is logged in. \`proved\`: this call checked a SID with EA.`

- [ ] **Step 4: `server/index.ts` — imports, startup, CORS**

Imports: replace
```ts
import { loadAccounts, registerSession, accountByKey, hello, type Account } from './accounts.js';
```
with
```ts
import { loadAccounts, registerSession, accountByKey, accountById, hello, type Account } from './accounts.js';
import { initAuth, optionalSiteAccount, siteAccount, siteUser } from './auth.js';
import { linkDecision } from './auth-rules.js';
import { consumeLinkToken, createLinkToken, linkTokenUser, personaRow, personasOf, setOwner, unlinkPersona } from './db/users.js';
import { eq } from 'drizzle-orm';
import { db } from './db/index.js';
import { users } from './db/schema.js';
```
(`initDb` is already imported from `./db/index.js`; merge into one import: `import { db, initDb } from './db/index.js';`.)

CORS hook: replace the two header lines
```ts
    reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Account-Key');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
```
with
```ts
    reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Account-Key, Authorization, X-Persona');
    reply.header('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
```

Startup: the `try { await initDb(); } catch …` block before `app.listen` becomes
```ts
try {
  await initDb();
  initAuth();
} catch (e) {
  console.error(`[startup] cannot start: ${(e as Error).message}`);
  process.exit(1);
}
```

- [ ] **Step 5: `server/index.ts` — site endpoints on Clerk auth**

Keep `account(req)` (key-based) for extension endpoints: `/api/extension/report`, `/api/jobs/next`, `/api/jobs/:id/call`, `/api/jobs/:id/done`, `/api/sbc-submitted`, `/api/webapp-event`. Change its doc comment to `/** Extension requests: the account behind its secret access key. */`.

Switch these site endpoints from `account(req)` to `await siteAccount(req)` (make the handler `async` where it is not):
- `GET /api/status`
- `POST /api/sync`
- `POST /api/challenges/:id/read`
- `GET /api/club` → `app.get('/api/club', async (req) => clubPlayers(await siteAccount(req)));`
- `GET /api/sets` → `const sets = await readCache<SetsData>((await siteAccount(req)).key('sets'));`
- `GET /api/sets/:id/challenges`
- `POST /api/solve`

`GET /api/meta`: replace `const acc = accountByKey(keyOf(req));` with `const acc = await optionalSiteAccount(req);`.

Delete the whole `POST /api/accounts` handler (and its doc comment).

Run `grep -n "account(req)" server/index.ts` → only the six extension endpoints listed above remain.

- [ ] **Step 6: `server/index.ts` — new endpoints**

Add after the `/api/session` handler:
```ts
// ---- users (site, Clerk session) --------------------------------------------------
/** Who is signed in and which EA personas they own. */
app.get('/api/me', async (req) => {
  const userId = await siteUser(req);
  const [row] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId));
  const personas = (await personasOf(userId)).flatMap((id) => {
    const a = accountById(id);
    return a ? [a.toJSON()] : [];
  });
  return { user: { id: userId, email: row?.email ?? '' }, personas };
});

/** One-time migration of solver settings saved under old browser keys: key prefix -> persona, own personas only. */
app.post<{ Body: { keys?: string[] } }>('/api/me/legacy-keys', async (req) => {
  const userId = await siteUser(req);
  const mine = new Set(await personasOf(userId));
  const map: Record<string, number> = {};
  for (const key of (req.body?.keys ?? []).slice(0, 20)) {
    const a = typeof key === 'string' ? accountByKey(key) : null;
    if (a && mine.has(a.id)) map[key.slice(0, 8)] = a.id;
  }
  return { map };
});

/** A short-lived token the site hands the extension, so its next hello links the persona to this user. */
app.post('/api/link-token', async (req) => {
  const userId = await siteUser(req);
  return { token: await createLinkToken(userId), expiresIn: 600 };
});

app.delete<{ Params: { id: string } }>('/api/personas/:id', async (req, reply) => {
  const userId = await siteUser(req);
  const ok = await unlinkPersona(Number(req.params.id), userId);
  if (!ok) return reply.code(404).send({ error: 'not linked to you' });
  return { ok: true };
});
```

- [ ] **Step 7: `server/index.ts` — linking in `/api/hello`**

Replace the `/api/hello` handler with:
```ts
app.post<{ Body: { personaId?: number; sid?: string; contentGuid?: string; extVersion?: string; linkToken?: string } }>('/api/hello', async (req, reply) => {
  const { personaId, sid, contentGuid, extVersion, linkToken } = req.body ?? {};
  if (sid !== undefined && !/^[0-9a-f-]{36}$/i.test(sid)) return reply.code(400).send({ error: 'invalid sid' });
  const r = await hello({
    key: keyOf(req),
    personaId: Number.isInteger(personaId) ? personaId : undefined,
    sid,
    contentGuid: contentGuid && /^[0-9A-F-]{36}$/i.test(contentGuid) ? contentGuid : undefined,
    extVersion: extVersion && /^\d+(\.\d+){1,3}$/.test(extVersion) ? extVersion : undefined,
  });
  if ('needSid' in r) return reply.code(401).send({ error: 'unknown account', needSid: true });
  // a signed-in site handed the extension a link token: attach this persona to that user
  const token = typeof linkToken === 'string' && /^[\w-]{20,100}$/.test(linkToken) ? linkToken : null;
  const userId = token ? await linkTokenUser(token) : null;
  let linked: number | null = null;
  if (userId) {
    const decision = linkDecision((await personaRow(r.account.id))?.userId ?? null, userId, r.proved);
    // owned by someone else: only a fresh EA proof moves it; the token stays usable for the resend
    if (decision === 'needSid') return reply.code(401).send({ error: 'EA account linked to another user', needSid: true });
    if (decision !== 'already') await setOwner(r.account.id, userId);
    await consumeLinkToken(token!);
    linked = r.account.id;
  }
  return { ok: true, account: r.account, accessKey: r.account.info.accessKey, linked, linkRejected: !!token && !userId };
});
```

- [ ] **Step 8: `.env.example`**

Append:
```
# Clerk (clerk.com): secret key for the API, publishable key for the site (public, baked into the web build).
CLERK_SECRET_KEY=sk_test_CHANGE_ME
VITE_CLERK_PUBLISHABLE_KEY=pk_test_CHANGE_ME
```

- [ ] **Step 9: Typecheck and tests**

Run: `npm run typecheck && npm test` → exit 0, `# fail 0`.

- [ ] **Step 10: Verify on the running API**

Needs the Clerk keys in `.env` (see Prerequisite). `tsx watch` restarts the API; if it is not running, run `timeout 20 npx tsx server/index.ts` in the background.
1. Missing secret fails fast: `CLERK_SECRET_KEY= PORT=5999 node --import tsx server/index.ts; echo "exit $?"` → `[startup] cannot start: CLERK_SECRET_KEY is not set`, `exit 1`. (`process.loadEnvFile` does not override a variable that is already set, even to empty.)
2. Signed out: `curl -s http://127.0.0.1:5178/api/sets` → `{"error":"Sign in first.","code":"signIn",...}` with HTTP 401 (`-w "%{http_code}"`).
3. Garbage token: `curl -s -H 'Authorization: Bearer x.y.z' http://127.0.0.1:5178/api/me` → 401 `signIn`.
4. Extension path still works with the key (key read into a variable, never printed):
   ```bash
   K=$(node -e "console.log(JSON.parse(require('fs').readFileSync('data/accounts/1005016552645/account.json','utf8')).data.accessKey)")
   curl -s -o /dev/null -w "jobs %{http_code}\n" -H "X-Account-Key: $K" http://127.0.0.1:5178/api/jobs/next
   curl -s -X POST -H "X-Account-Key: $K" -H 'content-type: application/json' -d '{"personaId":1005016552645,"linkToken":"not-a-real-token-000000"}' http://127.0.0.1:5178/api/hello | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('ok',d.ok,'linked',d.linked,'linkRejected',d.linkRejected)"
   ```
   Expected: `jobs 200`; `ok true linked null linkRejected true`.
5. Linking with a real token (DB-side, no browser yet):
   ```bash
   T=$(node --import tsx -e "const D=await import('./server/db/index.ts');const U=await import('./server/db/users.ts');await D.initDb();await U.touchUser('user_test_link');console.log(await U.createLinkToken('user_test_link'));await D.closeDb();")
   curl -s -X POST -H "X-Account-Key: $K" -H 'content-type: application/json' -d "{\"personaId\":1005016552645,\"linkToken\":\"$T\"}" http://127.0.0.1:5178/api/hello | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log('linked',d.linked,'linkRejected',d.linkRejected)"
   docker exec postgresql psql -U postgres -d fcsolver -Atc "select persona_id, user_id, previous_user_id from personas"
   ```
   Expected: `linked 1005016552645 linkRejected false`; row `1005016552645|user_test_link|`.
   Clean up so the real user can link later: `docker exec postgresql psql -U postgres -d fcsolver -c "delete from personas where user_id='user_test_link'; delete from link_tokens where user_id='user_test_link'; delete from users where id='user_test_link'"`.

- [ ] **Step 11: `docs/api.md`**

- In the auth intro: site endpoints now take `Authorization: Bearer <Clerk session token>` and `X-Persona: <personaId>`; extension endpoints keep `X-Account-Key`; errors `signIn` (401), `noPersona` (400), `personaNotYours` / `personaTakenOver` (403).
- Remove `POST /api/accounts`.
- Add `GET /api/me`, `POST /api/me/legacy-keys`, `POST /api/link-token`, `DELETE /api/personas/:id` with the bodies from this task's Interfaces.
- `POST /api/hello`: new optional `linkToken`; response adds `linked` (persona id or `null`) and `linkRejected`; a persona owned by another user answers `401 { needSid: true }` until the request carries a SID.
- Mark each endpoint "(site)" or "(extension)".

- [ ] **Step 12: Commit**

```bash
git add server/auth.ts server/accounts.ts server/index.ts package.json package-lock.json .env.example docs/api.md
git commit -m "feat(auth): Clerk-authenticated site API, persona linking in hello" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L5tvz1oKUwcQvY2AfSdzJQ"
```

---

### Task 4: Extension 0.8.0 — link from the site

**Files:**
- Create: `extension/site.js`
- Modify: `extension/manifest.json`, `extension/background.js`, `extension/popup.js`, `extension/release.json`, `docs/extension.md`

**Interfaces:**
- Consumes: `/api/hello` `linkToken` → `linked`, `linkRejected` (Task 3).
- Produces (page messages, `window.postMessage`, same origin):
  - site → extension: `{ source: 'fcsolver-site', type: 'fcsolver:hello' | 'fcsolver:link' (token) | 'fcsolver:unlink' }`
  - extension → site: `{ source: 'fcsolver-ext', type: 'fcsolver:present' | 'fcsolver:linked' (personaId) }`
  - runtime messages: `link-token` (token), `unlink`, `linked` (personaId, to the tab)

- [ ] **Step 1: `extension/site.js`**

```js
// Isolated-world relay on FC Solver pages. The signed-in site hands over a short-lived link token;
// the background sends it with the next hello so this browser's EA persona is linked to that user.
const post = (type, extra = {}) => window.postMessage({ source: 'fcsolver-ext', type, ...extra }, window.location.origin);

window.addEventListener('message', (event) => {
  if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== 'fcsolver-site') return;
  const d = event.data;
  try {
    if (d.type === 'fcsolver:hello') post('fcsolver:present');
    else if (d.type === 'fcsolver:link' && typeof d.token === 'string' && /^[\w-]{20,100}$/.test(d.token))
      chrome.runtime.sendMessage({ type: 'link-token', token: d.token });
    else if (d.type === 'fcsolver:unlink') chrome.runtime.sendMessage({ type: 'unlink' });
  } catch {
    /* extension reloaded: this old copy is inert until the page reloads */
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'linked') post('fcsolver:linked', { personaId: msg.personaId });
});

post('fcsolver:present');
```

- [ ] **Step 2: `extension/manifest.json`**

- `"version": "0.8.0"`.
- `host_permissions`: add `"https://sbc-builder.mario-theodor.ro/*"`.
- `content_scripts`: add
  ```json
  {
    "matches": [
      "https://sbc-builder.mario-theodor.ro/*",
      "http://localhost:5173/*",
      "http://127.0.0.1:5173/*",
      "http://localhost:5178/*",
      "http://127.0.0.1:5178/*"
    ],
    "js": ["site.js"],
    "run_at": "document_idle"
  }
  ```

- [ ] **Step 3: `extension/background.js` — carry the token through hello**

In `hello(identity)`:
1. After `const { sid, helloFor } = await chrome.storage.session.get(['sid', 'helloFor']);` add
   ```js
   const { linkToken, linkTab } = await chrome.storage.session.get(['linkToken', 'linkTab']);
   await chrome.storage.session.set({ lastIdentity: identity });
   ```
2. Change the early return to `if (helloFor === marker && accessKey && !linkToken) return; // already introduced this session`.
3. In `send`, change the body to
   `JSON.stringify({ personaId: identity.personaId, contentGuid, extVersion: VERSION, ...(linkToken ? { linkToken } : {}), ...extra })`.
4. After the `await chrome.storage.local.set({ accessKey: … })` success block (before `await chrome.storage.session.set({ helloFor: marker });`) add
   ```js
   if (body.linked || body.linkRejected) {
     await chrome.storage.session.remove(['linkToken', 'linkTab']);
     if (body.linked && linkTab) chrome.tabs.sendMessage(linkTab, { type: 'linked', personaId: body.linked }).catch(() => {});
   }
   ```

In the `chrome.runtime.onMessage` listener, before the `identity` branch add:
```js
  if (msg?.type === 'link-token' && typeof msg.token === 'string') {
    (async () => {
      await chrome.storage.session.set({ linkToken: msg.token, linkTab: _sender.tab?.id ?? null });
      await chrome.storage.session.remove('helloFor');
      const { lastIdentity } = await chrome.storage.session.get('lastIdentity');
      if (lastIdentity) await hello(lastIdentity); // web app already open: link now, not on its next load
    })();
    return;
  }
  if (msg?.type === 'unlink') {
    chrome.storage.session.remove(['linkToken', 'linkTab']);
    return;
  }
```
(The listener's second parameter is already named `_sender`; it is now used.)

- [ ] **Step 4: `extension/popup.js` — no more keys in URLs**

Replace `openUrl` with
```js
/** FC Solver's own sign-in now identifies you; access keys stay inside the extension. */
const openUrl = (server) => server;
```
and in the `chrome.storage.local.get(...)` callback use `$('open').href = openUrl(s.server);` and `$('open').href = \`${s.server}/?update=1\`;`.

- [ ] **Step 5: `extension/release.json`**

Add at the top:
```json
"0.8.0": [
  "Links your EA account to your FC Solver sign-in, so you see it on any device, phone included",
  "Access keys no longer travel in the FC Solver link"
],
```

- [ ] **Step 6: `docs/extension.md`**

Add a section `## Linking to a FC Solver user (0.8+)`: `site.js` on the FC Solver origins; the message types from this task's Interfaces; the token is kept in `chrome.storage.session` until a hello uses it; takeover needs one SID proof (`needSid`); sign-out sends `fcsolver:unlink`. Note that a custom server set in the popup does not auto-link (content script matches are static).

- [ ] **Step 7: Verify**

1. `node --check extension/site.js extension/background.js extension/popup.js` → no output.
2. `node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json'));JSON.parse(require('fs').readFileSync('extension/release.json'));console.log('json ok')"` → `json ok`.
3. `curl -s -o /tmp/claude-ext.zip -w "%{http_code}\n" http://127.0.0.1:5178/api/extension.zip && unzip -l /tmp/claude-ext.zip | grep site.js` → `200` and `site.js` listed (inside `fc27-sbc-builder/`). Delete the zip afterwards.
End-to-end linking is verified in Task 6.

- [ ] **Step 8: Commit**

```bash
git add extension docs/extension.md
git commit -m "feat(extension): 0.8.0 links the EA persona to the signed-in user" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L5tvz1oKUwcQvY2AfSdzJQ"
```

---

### Task 5: Sign-in screen and auth gate (web)

**Files:**
- Create: `web/src/Root.tsx`, `web/src/components/SignIn.tsx`, `web/src/link.ts`
- Modify: `web/src/main.tsx`, `web/src/route.ts`, `web/src/api.ts`, `web/src/App.tsx` (route props only), `web/src/styles.css`, `web/src/locales/en.ts`, `web/src/locales/ro.ts`, `vite.config.ts`, `package.json`

**Interfaces:**
- Consumes: `safeNext` (Task 1); `/api/*` auth (Task 3); extension messages (Task 4).
- Produces:
  - `Route` gains `{ view: 'signin'; next: string }` and `{ view: 'ssoCallback' }`; `parseRoute(path: string, search?: string)`; `useRoute()` unchanged signature.
  - `configureAuth(getToken: ((fresh: boolean) => Promise<string | null>) | null, onSignedOut: () => void): void` and `setPersona(id: number | null): void` in `api.ts`.
  - `useExtensionLink(active: boolean, onLinked: () => void): void`, `unlinkExtension(): void` in `link.ts`.
  - `App` takes props `{ route: Route; navigate: (r: Route, replace?: boolean) => void }`.

- [ ] **Step 1: Install and wire env**

Run: `npm install @clerk/react@^6`
Check the v6 signal API is what the code below uses:
```bash
grep -n "declare const useSignIn\|declare const useSignUp\|HandleSSOCallback" node_modules/@clerk/react/dist/index.d.mts | head
grep -n "emailCode: {\|sso: (\|finalize: (" node_modules/@clerk/shared/dist/types/signInFuture.d.mts
grep -n "sendEmailCode\|verifyEmailCode\|finalize: (" node_modules/@clerk/shared/dist/types/signUpFuture.d.mts
```
All must match; if one does not, stop and ask.

`vite.config.ts`: add `envDir: '..',` after `root: 'web',` (the `.env` lives in the repo root).

Create `web/src/env.d.ts`:
```ts
interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 2: Routes** — `web/src/route.ts`

Header comment: add `//   /signin         sign in (?next=)  /signin/callback  Google redirect`.
`Route` union: add `| { view: 'signin'; next: string } | { view: 'ssoCallback' }`.
`parseRoute`:
```ts
export function parseRoute(path: string, search = ''): Route {
  const [a, b, c] = path.split('/').filter(Boolean);
  if (a === 'signin') return b === 'callback' ? { view: 'ssoCallback' } : { view: 'signin', next: new URLSearchParams(search).get('next') ?? '/' };
  if (a === 'club') return { view: 'club' };
  // ... rest unchanged
```
`routePath`:
```ts
export function routePath(r: Route): string {
  if (r.view === 'signin') return r.next && r.next !== '/' ? `/signin?next=${encodeURIComponent(r.next)}` : '/signin';
  if (r.view === 'ssoCallback') return '/signin/callback';
  if (r.view !== 'sbcs') return `/${r.view}`;
  if (r.setId === null) return '/';
  return r.challengeId === null ? `/sbc/${r.setId}` : `/sbc/${r.setId}/${r.challengeId}`;
}
```
`useRoute`: initial state and `onPop` use `parseRoute(window.location.pathname, window.location.search)`; in `navigate` compare `if (path !== window.location.pathname + window.location.search)`.

- [ ] **Step 3: `web/src/api.ts` — auth headers**

Replace the whole block from `// Access keys come from the extension` through the end of `req()` with:
```ts
// The Clerk session identifies the user; X-Persona says which of their EA accounts the call is about.
let tokenFn: ((fresh: boolean) => Promise<string | null>) | null = null;
let signedOut: () => void = () => {};
let persona: number | null = null;

/** Root calls this on every render with Clerk's getToken (null while signed out). */
export function configureAuth(getToken: typeof tokenFn, onSignedOut: () => void) {
  tokenFn = getToken;
  signedOut = onSignedOut;
}
export const setPersona = (id: number | null) => (persona = id);

async function send(path: string, init: { method?: string; body?: unknown }, fresh: boolean) {
  const token = tokenFn ? await tokenFn(fresh) : null;
  return fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(persona ? { 'X-Persona': String(persona) } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function req<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res = await send(path, init, false);
  if (res.status === 401 && tokenFn) res = await send(path, init, true); // token just expired: once more with a fresh one
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; code?: string; params?: Record<string, string | number> };
    if (d.code === 'signIn') signedOut();
    throw new ApiError(d.error ?? `HTTP ${res.status}`, d.code ?? null, d.params ?? {});
  }
  return data as T;
}
```
In `api`, replace `accounts: …` with:
```ts
  me: () => req<{ user: { id: string; email: string }; personas: Account[] }>('/api/me'),
  legacyKeys: (keys: string[]) => req<{ map: Record<string, number> }>('/api/me/legacy-keys', { method: 'POST', body: { keys } }),
  linkToken: () => req<{ token: string; expiresIn: number }>('/api/link-token', { method: 'POST' }),
  unlinkPersona: (personaId: number) => req<{ ok: true }>(`/api/personas/${personaId}`, { method: 'DELETE' }),
```
(`storedKeys`, `storeKeys`, `absorbKeysFromUrl`, `setAccountKey` are gone; Task 6 replaces their uses. Until then `App.tsx` does not typecheck — that is expected inside this task only until Step 7.)

- [ ] **Step 4: `web/src/link.ts`**

```ts
// Site <-> extension (site.js) messages. While signed in and the extension is present, keep a
// fresh link token in its hands, so opening the web app links that EA account to this user.
import { useEffect } from 'react';
import { api } from './api';

const TO_EXT = 'fcsolver-site';
const FROM_EXT = 'fcsolver-ext';
const REFRESH_MS = 9 * 60 * 1000; // tokens live 10 min

const post = (type: string, extra: Record<string, unknown> = {}) =>
  window.postMessage({ source: TO_EXT, type, ...extra }, window.location.origin);

export function useExtensionLink(active: boolean, onLinked: () => void) {
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const give = () =>
      api
        .linkToken()
        .then(({ token }) => post('fcsolver:link', { token }))
        .catch(() => {}); // offline or signed out: the next refresh tries again
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin || e.data?.source !== FROM_EXT) return;
      if (e.data.type === 'fcsolver:present' && !timer) {
        void give();
        timer = setInterval(give, REFRESH_MS);
      } else if (e.data.type === 'fcsolver:linked') onLinked();
    };
    window.addEventListener('message', onMessage);
    post('fcsolver:hello'); // the content script may have announced itself before we listened
    return () => {
      window.removeEventListener('message', onMessage);
      clearInterval(timer);
    };
  }, [active, onLinked]);
}

export const unlinkExtension = () => post('fcsolver:unlink');
```

- [ ] **Step 5: Translations** — add to `web/src/locales/en.ts` (new group `// sign in`) and the same keys to `ro.ts`

en:
```ts
  // sign in
  'auth.title': 'Sign in to FC Solver',
  'auth.lede': 'One account for all your devices. Your EA account links itself when you open the web app with the extension.',
  'auth.google': 'Continue with Google',
  'auth.or': 'or',
  'auth.email': 'Email',
  'auth.sendCode': 'Send code',
  'auth.codeSent': 'We sent a 6-digit code to {email}.',
  'auth.code': 'Code',
  'auth.verify': 'Continue',
  'auth.resend': 'Resend code',
  'auth.resendIn': 'Resend in {s}s',
  'auth.changeEmail': 'Change email',
  'auth.finishing': 'Signing you in…',
  'auth.signIn': 'Sign in',
  'auth.signOut': 'Sign out',
  'auth.codeWrong': 'That code is not right. Check the email and try again.',
  'auth.codeExpired': 'That code expired. Send a new one.',
  'auth.tooMany': 'Too many attempts. Wait a minute and try again.',
  'auth.emailInvalid': 'Enter a valid email address.',
  'auth.failed': 'Sign-in did not work. Try again.',
  'auth.publicHome': 'Back to sign in',
  // account
  'account.title': 'Account',
  'account.signedInAs': 'Signed in as {email}',
  'account.personas': 'EA accounts',
  'account.none': 'No EA account linked yet. Open the FC27 web app in this browser with the extension.',
  'account.disconnect': 'Disconnect',
  'account.disconnectAsk': 'Disconnect {name}? It links again when you open the web app with the extension.',
  'account.disconnectYes': 'Yes, disconnect',
  'account.cancel': 'Cancel',
  'notice.takenOver': 'An EA account you used here is now linked to another FC Solver user, who proved they are logged in to it with EA.',
  'err.signIn': 'Sign in to continue.',
  'err.noPersona': 'Pick an EA account first.',
  'err.personaNotYours': 'This EA account is not linked to you.',
  'err.personaTakenOver': 'This EA account is now linked to another FC Solver user.',
```
ro:
```ts
  // autentificare
  'auth.title': 'Intră în FC Solver',
  'auth.lede': 'Un singur cont pe toate dispozitivele. Contul EA se leagă singur când deschizi web app-ul cu extensia.',
  'auth.google': 'Continuă cu Google',
  'auth.or': 'sau',
  'auth.email': 'Email',
  'auth.sendCode': 'Trimite codul',
  'auth.codeSent': 'Am trimis un cod de 6 cifre la {email}.',
  'auth.code': 'Cod',
  'auth.verify': 'Continuă',
  'auth.resend': 'Retrimite codul',
  'auth.resendIn': 'Retrimite în {s}s',
  'auth.changeEmail': 'Schimbă emailul',
  'auth.finishing': 'Te conectăm…',
  'auth.signIn': 'Intră în cont',
  'auth.signOut': 'Ieși din cont',
  'auth.codeWrong': 'Codul nu e corect. Verifică emailul și încearcă din nou.',
  'auth.codeExpired': 'Codul a expirat. Cere unul nou.',
  'auth.tooMany': 'Prea multe încercări. Așteaptă un minut și încearcă din nou.',
  'auth.emailInvalid': 'Scrie o adresă de email validă.',
  'auth.failed': 'Autentificarea n-a mers. Încearcă din nou.',
  'auth.publicHome': 'Înapoi la autentificare',
  // cont
  'account.title': 'Cont',
  'account.signedInAs': 'Conectat ca {email}',
  'account.personas': 'Conturi EA',
  'account.none': 'Niciun cont EA legat încă. Deschide web app-ul FC27 în acest browser, cu extensia.',
  'account.disconnect': 'Deconectează',
  'account.disconnectAsk': 'Deconectezi {name}? Se leagă din nou când deschizi web app-ul cu extensia.',
  'account.disconnectYes': 'Da, deconectează',
  'account.cancel': 'Anulează',
  'notice.takenOver': 'Un cont EA folosit aici e acum legat de alt utilizator FC Solver, care a dovedit că e logat în el la EA.',
  'err.signIn': 'Intră în cont ca să continui.',
  'err.noPersona': 'Alege întâi un cont EA.',
  'err.personaNotYours': 'Contul EA nu e legat de tine.',
  'err.personaTakenOver': 'Contul EA e acum legat de alt utilizator FC Solver.',
```
Place the `notice.*` and `err.*` keys inside their existing groups (next to the other `notice.` / `err.` keys) rather than in the new group.

- [ ] **Step 6: `web/src/components/SignIn.tsx`**

```tsx
// Sign in or sign up in one flow, on Clerk's v6 hooks with our own UI: Google, or an emailed code.
// A new email becomes a sign-up automatically; there is no separate "create account" screen.
import { useEffect, useState } from 'react';
import { useSignIn, useSignUp } from '@clerk/react';
import { EnvelopeSimple, GoogleLogo, WarningCircle } from '@phosphor-icons/react';
import { useI18n } from '../i18n';

type ClerkErr = { code?: string; errors?: { code?: string }[] } | null | undefined;
const codeOf = (e: ClerkErr) => e?.errors?.[0]?.code ?? e?.code ?? '';

function errKey(e: ClerkErr): string {
  const c = codeOf(e);
  if (c === 'form_code_incorrect') return 'auth.codeWrong';
  if (c === 'verification_expired' || c === 'verification_failed') return 'auth.codeExpired';
  if (c === 'too_many_requests' || c.includes('rate_limit')) return 'auth.tooMany';
  if (c === 'form_param_format_invalid' || c === 'form_identifier_invalid') return 'auth.emailInvalid';
  return 'auth.failed';
}

export function SignIn({ next, onDone }: { next: string; onDone: (path: string) => void }) {
  const { t } = useI18n();
  const { signIn } = useSignIn();
  const { signUp } = useSignUp();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0); // resend cooldown, seconds

  useEffect(() => {
    if (wait <= 0) return;
    const id = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(id);
  }, [wait]);

  const fail = (e: ClerkErr) => {
    setError(t(errKey(e)));
    setBusy(false);
  };

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const address = email.trim();
    if (!address) return;
    setBusy(true);
    setError(null);
    let m: 'in' | 'up' = 'in';
    let { error } = await signIn.emailCode.sendCode({ emailAddress: address });
    if (error && codeOf(error) === 'form_identifier_not_found') {
      m = 'up'; // new here: same screens, as a sign-up
      ({ error } = await signUp.create({ emailAddress: address }));
      if (!error) ({ error } = await signUp.verifications.sendEmailCode());
    }
    if (error) return fail(error);
    setMode(m);
    setStep('code');
    setCode('');
    setWait(30);
    setBusy(false);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const go = { navigate: () => onDone(next) };
    if (mode === 'in') {
      const { error } = await signIn.emailCode.verifyCode({ code: code.trim() });
      if (error) return fail(error);
      // not complete (e.g. a second factor) makes finalize() return an error, shown as auth.failed
      const done = await signIn.finalize(go);
      if (done.error) return fail(done.error);
    } else {
      const { error } = await signUp.verifications.verifyEmailCode({ code: code.trim() });
      if (error) return fail(error);
      const done = await signUp.finalize(go);
      if (done.error) return fail(done.error);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    const { error } = await signIn.sso({
      strategy: 'oauth_google',
      redirectUrl: next,
      redirectCallbackUrl: '/signin/callback',
    });
    if (error) fail(error);
  }

  return (
    <section className="signin" aria-labelledby="signin-title">
      <h1 id="signin-title">{t('auth.title')}</h1>
      <p className="muted">{t('auth.lede')}</p>

      {step === 'email' ? (
        <div className="signin-step" key="email">
          <button type="button" className="ghost wide signin-google" onClick={google} disabled={busy}>
            <GoogleLogo weight="bold" /> {t('auth.google')}
          </button>
          <p className="signin-or" aria-hidden="true">
            <span>{t('auth.or')}</span>
          </p>
          <form onSubmit={sendCode}>
            <label className="signin-field">
              <span>{t('auth.email')}</span>
              <input type="email" autoComplete="email" inputMode="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button type="submit" className="signin-go" disabled={busy || !email.trim()}>
              <EnvelopeSimple weight="bold" /> {t('auth.sendCode')}
            </button>
          </form>
        </div>
      ) : (
        <div className="signin-step" key="code">
          <p>{t('auth.codeSent', { email: email.trim() })}</p>
          <form onSubmit={verify}>
            <label className="signin-field">
              <span>{t('auth.code')}</span>
              <input
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                autoFocus
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              />
            </label>
            <button type="submit" className="signin-go" disabled={busy || code.length !== 6}>
              {t('auth.verify')}
            </button>
          </form>
          <div className="signin-row">
            <button type="button" className="text" disabled={busy || wait > 0} onClick={() => sendCode()}>
              {wait > 0 ? t('auth.resendIn', { s: wait }) : t('auth.resend')}
            </button>
            <button type="button" className="text" disabled={busy} onClick={() => { setStep('email'); setError(null); }}>
              {t('auth.changeEmail')}
            </button>
          </div>
        </div>
      )}

      <p className="signin-error" role="alert" aria-live="assertive">
        {error && (
          <>
            <WarningCircle weight="bold" aria-hidden="true" /> {error}
          </>
        )}
      </p>
    </section>
  );
}
```
If `GoogleLogo` or `EnvelopeSimple` is missing from `@phosphor-icons/react` (`grep -c "GoogleLogo\b" node_modules/@phosphor-icons/react/dist/index.d.ts`), use `At` for email and no icon for Google.

- [ ] **Step 7: `web/src/Root.tsx` and `main.tsx`**

`web/src/Root.tsx`:
```tsx
// Auth gate in front of the app: Clerk loading, the Google redirect, signed-out pages
// (sign in, how it works, extension setup) and the signed-in app. Owns the one useRoute().
import { useEffect } from 'react';
import { HandleSSOCallback, useAuth } from '@clerk/react';
import App from './App';
import { configureAuth } from './api';
import { safeNext } from './next';
import { useRoute, type Route } from './route';
import { useI18n } from './i18n';
import { LangMenu } from './components/LangMenu';
import { SignIn } from './components/SignIn';
import { Guide } from './components/Guide';
import { SetupGuide } from './components/SetupGuide';

const here = () => window.location.pathname + window.location.search;

export default function Root() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [route, navigate] = useRoute();
  const { t, lang, setLang } = useI18n();
  const toSignIn = (next = here()): Route => ({ view: 'signin', next: safeNext(next) });

  // set during render: children's effects run before ours and already call the API
  configureAuth(isSignedIn ? (fresh) => getToken(fresh ? { skipCache: true } : undefined) : null, () =>
    navigate(toSignIn(), true),
  );

  const publicView = route.view === 'signin' || route.view === 'ssoCallback' || route.view === 'guide' || route.view === 'setup';
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn && !publicView) navigate(toSignIn(), true);
    if (isSignedIn && route.view === 'signin') window.location.replace(safeNext(route.next));
  }, [isLoaded, isSignedIn, publicView, route]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isLoaded) return <div className="boot" aria-busy="true" />;

  if (route.view === 'ssoCallback')
    return (
      <div className="boot" aria-busy="true">
        <span className="sr-only">{t('auth.finishing')}</span>
        <HandleSSOCallback
          navigateToApp={({ decorateUrl }) => {
            window.location.replace(decorateUrl('/'));
          }}
          navigateToSignIn={() => navigate(toSignIn('/'), true)}
          navigateToSignUp={() => navigate(toSignIn('/'), true)}
        />
      </div>
    );

  if (!isSignedIn) {
    const body =
      route.view === 'guide' ? <Guide clubSyncs={3} eaLimit={150} />
      : route.view === 'setup' ? <SetupGuide />
      : <SignIn next={route.view === 'signin' ? safeNext(route.next) : '/'} onDone={(p) => window.location.replace(p)} />;
    return (
      <div className="onboarding">
        <div className="brand onboarding-top">
          <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="186" height="48" />
          <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
        </div>
        {route.view !== 'signin' && (
          <p>
            <button type="button" className="text" onClick={() => navigate(toSignIn('/'))}>
              {t('auth.publicHome')}
            </button>
          </p>
        )}
        {body}
      </div>
    );
  }

  if (route.view === 'signin') return <div className="boot" aria-busy="true" />;
  return <App route={route} navigate={navigate} />;
}
```
Notes: `window.location.replace` after sign-in reloads once, so `App` boots with a live token (simplest correct handoff). If `.sr-only` does not exist in `styles.css` (`grep -n "\.sr-only" web/src/styles.css`), add it in Step 8.

`web/src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ClerkProvider } from '@clerk/react';
import Root from './Root';
import { I18nProvider } from './i18n';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
      <I18nProvider>
        <Root />
      </I18nProvider>
    </ClerkProvider>
  </StrictMode>,
);
```

`web/src/App.tsx` (route props only, the rest is Task 6):
- `export default function App() {` → `export default function App({ route, navigate }: { route: Route; navigate: (r: Route, replace?: boolean) => void }) {`
- delete `const [route, navigate] = useRoute();` and drop `useRoute` from the `./route` import (keep `canGoBack`, `type Route`).
- the tab-title effect's `view === 'setup' ? 'Setup'` chain: `view` can now also be `signin` / `ssoCallback`; no change needed (falls through to `setId`).

- [ ] **Step 8: Styles** — append to `web/src/styles.css`

```css
/* ---------- sign in ---------- */
.signin {
  max-width: 420px;
  margin: 8vh auto 0;
  padding: 28px 24px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--r-box);
}
.signin h1 { margin: 0 0 6px; font-size: 1.5rem; }
.signin form { display: grid; gap: 12px; }
.signin-step { display: grid; gap: 14px; margin-top: 18px; }
.signin-google { justify-content: center; }
.signin-or { display: flex; align-items: center; gap: 10px; margin: 0; color: var(--ink-3); font-size: 0.85rem; }
.signin-or::before, .signin-or::after { content: ''; flex: 1; border-top: 1px solid var(--line); }
.signin-field { display: grid; gap: 6px; }
.signin-field span { color: var(--ink-2); font-size: 0.9rem; }
.signin-field input { min-height: 44px; padding: 0 12px; border-radius: var(--r-ctl); }
.signin-go {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  min-height: 44px; border: 0; border-radius: var(--r-ctl);
  background: var(--go); color: var(--go-ink); font-weight: 600;
}
.signin-go:disabled { opacity: 0.55; }
.signin-row { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.signin-error { display: flex; align-items: center; gap: 6px; min-height: 1.4em; margin: 14px 0 0; color: var(--bad); }
.signin-step { animation: signin-in 180ms var(--ease); }
@keyframes signin-in { from { opacity: 0; transform: translateY(4px); } }
@media (prefers-reduced-motion: reduce) { .signin-step { animation: none; } }
@media (max-width: 480px) { .signin { margin-top: 3vh; padding: 22px 16px; } }
```
Plus, only if missing:
```css
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
```
Check `--bad` on `--surface` contrast is ≥ 4.5:1 (it is used the same way by existing error banners; if `grep -n "var(--bad)" web/src/styles.css` shows it only on backgrounds, not as text, stop and ask).

- [ ] **Step 9: Typecheck (web part will still fail in App.tsx)**

Run: `npm run typecheck 2>&1 | grep -v "web/src/App.tsx" | grep "error" ; npm run i18n:check`
Expected: no errors outside `App.tsx`; i18n ok. Do **not** commit yet: Task 6 finishes `App.tsx` and both tasks are committed together at the end of Task 6 (a reviewer can still review Task 5's files separately with `git diff -- web/src/Root.tsx web/src/components/SignIn.tsx …`).

---

### Task 6: Personas in the app, settings migration, account settings

**Files:**
- Create: `web/src/legacy.ts`
- Modify: `web/src/App.tsx`, `web/src/styles.css` (account list), `CLAUDE.md` Auth rule is in Task 7

**Interfaces:**
- Consumes: `api.me`, `api.legacyKeys`, `api.unlinkPersona`, `setPersona` (Task 5 `api.ts`); `useExtensionLink`, `unlinkExtension` (Task 5 `link.ts`); `useClerk` from `@clerk/react`.
- Produces: `migrateLegacyKeys(): Promise<void>` in `web/src/legacy.ts`.

- [ ] **Step 1: `web/src/legacy.ts`**

```ts
// Before sign-in, solver settings were stored per browser access key (sbc-options-<first 8 chars>).
// Keys now stay in the extension; this moves those settings to the persona id, once per key.
import { api } from './api';

const KEYS = 'sbc-account-keys';
const PREFIXES = ['sbc-options-', 'sbc-local-options-', 'sbc-results-'];

function read(): string[] {
  try {
    return JSON.parse(localStorage.getItem(KEYS) ?? '[]');
  } catch {
    return [];
  }
}

export async function migrateLegacyKeys(): Promise<void> {
  // old extension links still carry #keys=...: take them, then scrub the address bar
  const m = window.location.hash.match(/keys=([\w,-]+)/);
  if (m) history.replaceState(history.state, '', window.location.pathname + window.location.search);
  const keys = [...new Set([...(m ? m[1].split(',').filter(Boolean) : []), ...read()])];
  if (!keys.length) return;
  try {
    const { map } = await api.legacyKeys(keys);
    for (const [prefix, personaId] of Object.entries(map))
      for (const p of PREFIXES) {
        const old = localStorage.getItem(p + prefix);
        if (old !== null && localStorage.getItem(`${p}p${personaId}`) === null) localStorage.setItem(`${p}p${personaId}`, old);
        localStorage.removeItem(p + prefix);
      }
    // keys whose persona is not linked to this user yet stay for a later visit
    const left = keys.filter((k) => !(k.slice(0, 8) in map));
    if (left.length) localStorage.setItem(KEYS, JSON.stringify(left));
    else localStorage.removeItem(KEYS);
  } catch {
    /* offline or storage blocked: try again next load */
  }
}
```

- [ ] **Step 2: `App.tsx` — imports and storage keys**

- Import line from `./api`: remove `absorbKeysFromUrl, setAccountKey, storeKeys`, add `setPersona`.
- Add imports:
  ```ts
  import { useClerk } from '@clerk/react';
  import { migrateLegacyKeys } from './legacy';
  import { unlinkExtension, useExtensionLink } from './link';
  ```
- `const ACTIVE = 'sbc-active-key';` → `const ACTIVE = 'sbc-active-persona';`
- Replace
  ```ts
  type Linked = { key: string; account: Account };
  ```
  with nothing (delete), and the three key helpers with:
  ```ts
  const optionsKey = (id: number) => `sbc-options-p${id}`;
  const localKey = (id: number) => `sbc-local-options-p${id}`;
  const resultsKey = (id: number) => `sbc-results-p${id}`;
  ```

- [ ] **Step 3: `App.tsx` — state and boot**

- `const [linked, setLinked] = useState<Linked[] | null>(null);` → `const [linked, setLinked] = useState<Account[] | null>(null);`
- `const [activeKey, setActiveKey] = useState<string | null>(null);` → `const [activeId, setActiveId] = useState<number | null>(null);`
- add `const [me, setMe] = useState<{ id: string; email: string } | null>(null);` and `const [takenOver, setTakenOver] = useState(false);` and `const { signOut } = useClerk();`
- `const account = linked?.find((l) => l.key === activeKey)?.account ?? null;` → `const account = linked?.find((a) => a.personaId === activeId) ?? null;`
- In `loadAccountData`, the last line becomes
  `if (st.account) setLinked((prev) => prev?.map((a) => (a.personaId === st.account!.personaId ? st.account! : a)) ?? prev);`
- `selectAccount`:
  ```ts
  const selectAccount = useCallback(
    async (id: number) => {
      setPersona(id);
      setActiveId(id);
      writeLocal(ACTIVE, id);
      setOptions({ ...DEFAULT_OPTIONS, ...readLocal(optionsKey(id), {}) });
      setLocalOptions(readLocal<LocalMap>(localKey(id), {}));
      setChallenges(null);
      // solved squads survive reloads and tab switches; they are only replaced by solving again
      setResults(readLocal<Record<number, SolveResult>>(resultsKey(id), {}));
      await loadAccountData();
    },
    [loadAccountData],
  );
  ```
- Replace the boot effect (`// Boot: validate the keys this browser holds…`) with:
  ```ts
  // Boot (and after the extension links a new EA account): who am I, which personas are mine.
  const loadMe = useCallback(async () => {
    const { user, personas } = await api.me();
    setMe(user);
    setLinked(personas);
    const last = readLocal<number | null>(ACTIVE, null);
    const pick = personas.find((a) => a.personaId === (activeIdRef.current ?? last)) ?? personas[0];
    if (!pick) {
      setPersona(null);
      setActiveId(null);
      setMeta(await api.meta());
    } else if (pick.personaId !== activeIdRef.current) await selectAccount(pick.personaId);
    return personas;
  }, [selectAccount]);

  useEffect(() => {
    let cancelled = false; // StrictMode runs this twice; only the live run may select
    migrateLegacyKeys()
      .then(() => !cancelled && loadMe())
      .catch((e) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  const onLinked = useCallback(() => void migrateLegacyKeys().then(loadMe), [loadMe]);
  useExtensionLink(true, onLinked);
  ```
  All of this (and every other new hook in this task: `useRef`, `useClerk`, `onApiError`) goes with the existing hooks, **above** the early returns (`if (linked === null) return …`), or React throws on the first persona change.
  and just above `loadMe` add
  ```ts
  const activeIdRef = useRef<number | null>(null);
  activeIdRef.current = activeId;
  ```
  (add `useRef` to the `react` import).
- Everywhere else, `activeKey` → `activeId` (poll effect deps and guard, challenges effect, `updateOptions` / `updateLocal` / results writes: `writeLocal(optionsKey(activeId), …)` etc.). Run `grep -n "activeKey\|\.key\b\|l\.account" web/src/App.tsx` until only unrelated hits (`e.key` keyboard handlers) remain.
- In the poll effect replace the `setLinked(...)` line with
  `setLinked((prev) => prev?.map((a) => (a.personaId === activeId && st.account ? st.account : a)) ?? prev);`

- [ ] **Step 4: `App.tsx` — persona gone (not yours / taken over)**

Wrap the API error handling: add near the other callbacks
```ts
  // the persona was disconnected or taken over elsewhere: reload who we are
  const onApiError = useCallback(
    (e: unknown) => {
      const code = e instanceof ApiError ? e.code : null;
      if (code === 'personaTakenOver') setTakenOver(true);
      if (code === 'personaNotYours' || code === 'personaTakenOver') void loadMe();
      else setError(errorText(e, t));
    },
    [loadMe, t],
  );
```
(import `ApiError` from `./api`). Replace `.catch((e) => setError(e.message))` / `.catch((e) => setError((e as Error).message))` calls in `App.tsx` with `.catch(onApiError)`; in `try/catch` blocks around `api.*` calls (solve, sync) call `onApiError(e)` instead of `setError(...)`. Keep the poll effect's silent catch.

Under the existing notices add:
```tsx
      {takenOver && (
        <div className="notice" role="status">
          {t('notice.takenOver')}{' '}
          <button type="button" className="text" onClick={() => setTakenOver(false)}>
            {t('account.cancel')}
          </button>
        </div>
      )}
```

- [ ] **Step 5: `App.tsx` — picker, onboarding, account settings**

Picker `<select>`:
```tsx
            <select
              value={activeId ?? ''}
              onChange={(e) => {
                navigate({ view: 'sbcs', setId: null, challengeId: null });
                void selectAccount(Number(e.target.value));
              }}
              aria-label={t('top.account')}
            >
              {linked.map((a) => (
                <option key={a.personaId} value={a.personaId}>
                  {a.personaName} · {a.clubName}
                </option>
              ))}
            </select>
```
Sign-out helper (near `go`):
```ts
  const doSignOut = async () => {
    unlinkExtension();
    setPersona(null);
    await signOut({ redirectUrl: '/signin' });
  };
```
Onboarding: `if (linked.length === 0) return <Onboarding error={error} lang={lang} setLang={setLang} email={me?.email ?? ''} onSignOut={doSignOut} />;` and extend the component:
```tsx
function Onboarding({ error, lang, setLang, email, onSignOut }: { error: string | null; lang: Lang; setLang: (l: Lang) => void; email: string; onSignOut: () => void }) {
  const { t } = useI18n();
  return (
    <div className="onboarding">
      <div className="brand onboarding-top">
        <img src="/brand/logo-on-dark.svg" alt="FC Solver" width="186" height="48" />
        <LangMenu lang={lang} setLang={setLang} label={t('top.language')} />
      </div>
      <p className="muted">
        {email && t('account.signedInAs', { email })}{' '}
        <button type="button" className="text" onClick={onSignOut}>{t('auth.signOut')}</button>
      </p>
      <h1>{t('onb.title')}</h1>
      <p className="lede">{t('onb.lede')}</p>
      <SetupGuide />
      {error && <p className="banner">{error}</p>}
    </div>
  );
}
```
Settings: inside `<div className="settings-side">`, first child, add `<AccountCard email={me?.email ?? ''} personas={linked} onUnlink={unlink} onSignOut={doSignOut} />` with, near `doSignOut`:
```ts
  const unlink = async (id: number) => {
    await api.unlinkPersona(id).catch(onApiError);
    await loadMe();
  };
```
and at the bottom of the file:
```tsx
function AccountCard({ email, personas, onUnlink, onSignOut }: {
  email: string; personas: Account[]; onUnlink: (id: number) => void; onSignOut: () => void;
}) {
  const { t } = useI18n();
  const [asking, setAsking] = useState<number | null>(null);
  return (
    <aside className="settings-card account-card">
      <h2>{t('account.title')}</h2>
      {email && <p className="muted">{t('account.signedInAs', { email })}</p>}
      <h3>{t('account.personas')}</h3>
      {personas.length === 0 ? (
        <p className="muted">{t('account.none')}</p>
      ) : (
        <ul className="local-list">
          {personas.map((a) => (
            <li key={a.personaId}>
              <span>{a.personaName} · {a.clubName}</span>
              {asking === a.personaId ? (
                <span className="account-ask" role="group" aria-label={t('account.disconnectAsk', { name: a.personaName })}>
                  <span>{t('account.disconnectAsk', { name: a.personaName })}</span>
                  <button type="button" className="ghost" onClick={() => { setAsking(null); onUnlink(a.personaId); }}>{t('account.disconnectYes')}</button>
                  <button type="button" className="ghost" onClick={() => setAsking(null)}>{t('account.cancel')}</button>
                </span>
              ) : (
                <button type="button" className="ghost" onClick={() => setAsking(a.personaId)}>{t('account.disconnect')}</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="ghost wide" onClick={onSignOut}>{t('auth.signOut')}</button>
    </aside>
  );
}
```
Mobile menu: the hamburger menu (`id="mobile-menu"`) gets a last item `<button type="button" className="nav-item" onClick={doSignOut}>{t('auth.signOut')}</button>`; the desktop top bar shows the email's first letter in a round badge next to the account picker: `<span className="avatar" title={me?.email} aria-label={me?.email}>{(me?.email ?? '?').slice(0, 1).toUpperCase()}</span>`.

CSS (append):
```css
.account-card h3 { margin: 14px 0 6px; font-size: 0.95rem; color: var(--ink-2); }
.account-ask { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.avatar {
  display: inline-grid; place-items: center; width: 30px; height: 30px; border-radius: 50%;
  background: var(--surface-3); color: var(--ink); font-weight: 600; font-size: 0.85rem;
}
@media (max-width: 860px) { .top-controls .avatar { display: none; } }
```

Check the sign-out signature before relying on `redirectUrl`: `grep -n "SignOutOptions" -A6 node_modules/@clerk/shared/dist/types/clerk.d.mts | head -12` must show `redirectUrl`. If not, call `await signOut()` and then `window.location.replace('/signin')`.

- [ ] **Step 6: Typecheck, tests, build, i18n**

Run: `npm run typecheck && npm test && npm run build && npm run i18n:check`
Expected: all exit 0.

- [ ] **Step 7: Verify in the browser (Clerk dev instance, extension 0.8 loaded unpacked from `extension/`)**

Use the `claude-in-chrome` skill (or ask the user to click where Chrome automation cannot, e.g. the Google consent screen).
1. `http://localhost:5173/sbc/16` signed out → redirected to `/signin?next=%2Fsbc%2F16`.
2. Email code: enter an email → code screen → wrong code shows `auth.codeWrong` text with the icon → right code → lands on `/sbc/16`.
3. With the FC27 web app open in the same browser: within a few seconds the persona appears (no `#keys=` in any URL); `docker exec postgresql psql -U postgres -d fcsolver -Atc "select persona_id, user_id from personas"` shows it.
4. Old settings: before step 2, in DevTools set `localStorage['sbc-account-keys']` to the old key and an `sbc-options-<first 8>` value; after linking, `sbc-options-p<personaId>` exists with the same value and `sbc-account-keys` is gone. (Do not print the key in the transcript; read it into a variable.)
5. Solve an SBC; SBC list, club and settings load.
6. Settings → Account: email shown; Disconnect with inline confirm; after it, onboarding shows; reopening the web app links it again.
7. Takeover: second Chrome profile, other email, same EA web app login → the persona moves (`previous_user_id` set); the first profile shows the `notice.takenOver` banner on its next request.
8. Google sign-in round trip via `/signin/callback`.
9. Phone width 390px (DevTools device toolbar): sign-in screen fits without horizontal scroll, sign-out in the hamburger menu, persona visible.
10. Sign out → back to `/signin`; `/guide` and `/setup` open signed out.
Report each item's result; if any fails, fix before committing (stop and ask if the fix changes the design).

- [ ] **Step 8: Commit (Tasks 5 and 6)**

```bash
git pull --rebase   # stash first if needed: git stash && git pull --rebase && git stash pop
git add package.json package-lock.json vite.config.ts web/src
git commit -m "feat(web): sign in with Clerk, personas from the signed-in user" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L5tvz1oKUwcQvY2AfSdzJQ"
```

---

### Task 7: Deploy config and docs

**Files:**
- Modify: `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `docs/deploy.md`, `docs/architecture.md`, `CLAUDE.md`

- [ ] **Step 1: `.dockerignore`**

Append `.env` (the build context must never carry secrets; the image copies explicit folders anyway).

- [ ] **Step 2: `Dockerfile`** — web stage

After `WORKDIR /app` in the `web` stage add:
```dockerfile
ARG VITE_CLERK_PUBLISHABLE_KEY
ENV VITE_CLERK_PUBLISHABLE_KEY=$VITE_CLERK_PUBLISHABLE_KEY
```

- [ ] **Step 3: `docker-compose.yml`** — `app`

Replace `build: .` with
```yaml
    build:
      context: .
      args:
        VITE_CLERK_PUBLISHABLE_KEY: ${VITE_CLERK_PUBLISHABLE_KEY:?set VITE_CLERK_PUBLISHABLE_KEY in .env}
```
and add to `environment`:
```yaml
      CLERK_SECRET_KEY: ${CLERK_SECRET_KEY:?set CLERK_SECRET_KEY in .env}
```

- [ ] **Step 4: Validate**

`DB_PASSWORD=x CLERK_SECRET_KEY=x VITE_CLERK_PUBLISHABLE_KEY=x docker compose config >/dev/null && echo ok` → `ok`.
`env -u CLERK_SECRET_KEY DB_PASSWORD=x VITE_CLERK_PUBLISHABLE_KEY=x docker compose --env-file /dev/null config 2>&1 | head -1` → error naming `CLERK_SECRET_KEY`.
`docker build --build-arg VITE_CLERK_PUBLISHABLE_KEY=pk_test_x -t sbc-builder-test . && docker rmi sbc-builder-test` → builds.

- [ ] **Step 5: Docs**

`docs/deploy.md`:
- `.env` next to `docker-compose.yml` now also holds `CLERK_SECRET_KEY` and `VITE_CLERK_PUBLISHABLE_KEY` (production instance keys); compose refuses to start without them; the publishable key is baked into the web build (`build.args`), so changing it needs `--build`.
- Env var list: `CLERK_SECRET_KEY` (required), `SITE_ORIGINS` (comma list of origins whose Clerk tokens are accepted; default localhost + production domain).
- New `## Clerk` section: production instance on `sbc-builder.mario-theodor.ro` (DNS records Clerk asks for go in Cloudflare, DNS only / grey cloud), Google OAuth with our own Google Cloud credentials (redirect URI from the Clerk dashboard), email verification code on, password off, no required names.
- First-time setup block: add the two Clerk lines to the `.env` creation.

`docs/architecture.md`: new section `## Users and EA accounts` after `## Shared data (Postgres)`: Clerk session on the site vs per-persona key in the extension; `users` / `personas` / `link_tokens`; linking flow (site.js → link token → hello → owner), takeover needs a SID proof, `previous_user_id` for the notice; keys never reach the browser; old keys only migrate settings once.

`CLAUDE.md`:
- Layout: `server/` add `auth.ts` Clerk session → user + persona, `auth-rules.ts`, `db/users.ts`; `web/src/` add `Root.tsx` auth gate, `components/SignIn.tsx`, `link.ts` site ↔ extension.
- Replace the **Auth** rule with: "Auth: the site signs in with Clerk (own UI on `@clerk/react` v6 hooks, no Clerk components) and sends `Authorization: Bearer` + `X-Persona`; `server/auth.ts` checks the persona belongs to the user (`personas` table). The extension keeps a per-persona key (`X-Account-Key`) that never reaches the browser; extension 0.8+ links the persona to the signed-in user via `site.js` + a link token in `/api/hello`; taking over another user's persona needs a fresh SID proof. Client mode (extension 0.7+): every EA request runs in the web app tab (`extension/hook.js` recipes, `server/jobs.ts` queue); the server keeps no SID and only calls EA once to prove an account. Legacy mode (old extensions) still syncs server-side; remove it once all accounts run 0.7. Never add a job recipe that writes to EA."
- Commands: note `CLERK_SECRET_KEY` + `VITE_CLERK_PUBLISHABLE_KEY` in `.env` (Clerk dev instance for local).

- [ ] **Step 6: Final verification**

Run: `npm test && npm run typecheck && npm run build && npm run i18n:check` → all exit 0.
Browser: signed-in SBC list, a set, solve, club, settings still work (quick pass of Task 6 Step 7 items 5 and 10).

- [ ] **Step 7: Commit**

```bash
git pull --rebase
git add Dockerfile docker-compose.yml .dockerignore docs/deploy.md docs/architecture.md CLAUDE.md
git commit -m "chore(deploy): Clerk keys in build and runtime, auth docs" -m "Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01L5tvz1oKUwcQvY2AfSdzJQ"
```
Do not push; ask the user. Before the first production deploy: Clerk production instance set up (docs/deploy.md `## Clerk`), `.env` on the server updated, extension 0.8.0 zip shared with the friends.
