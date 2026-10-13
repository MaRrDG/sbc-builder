# Account deletion, export, legal texts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Users export their data and delete their account from Settings (7-day undo, Paddle renewal stopped, EA-account data kept only while another user owns it); legal texts, checkout and ban FAQ tell the truth.

**Architecture:** `users.delete_at` marks a scheduled deletion. Request / cancel endpoints schedule or unschedule the Paddle cancel (server never writes subscription state). An hourly ticker purges due users through one idempotent `purgeUser()` driven by a pure `purgePlan()`. A read-only `buildExport()` assembles the JSON download. The site gets a Settings "Your data" card, a deletion banner, and updated legal docs.

**Tech Stack:** Node 24 + TS (tsx), Fastify 5, Drizzle + Postgres, Clerk backend SDK, Paddle Billing API, Resend, React 19, node:test.

**Spec:** `docs/superpowers/specs/2026-10-13-gdpr-account-design.md`

## Global Constraints

- Paddle API calls only in `server/billing/paddle.ts`; they never write `subscriptions` (state changes only from signed webhooks / admin resync). No automatic refund anywhere.
- No EA calls. No change to extension.
- Every user string via `t()` in en / ro / it (each written properly; Romanian plurals `_one`/`_few`/`_other`, Italian `_one`/`_other`); `npm run i18n:check`. Server errors to users carry `msgCode`.
- Exact values: deletion delay 7 days; confirm words `DELETE`, `ȘTERGE`, `ELIMINA` (case-insensitive, trimmed; any of the three accepted); ticker hourly + once at start; export limit 1 per minute per user; export filename `fc-solver-<YYYY-MM-DD>.json`; events kept anonymous (`user_id`/`persona_id` → null), still pruned at 180 days.
- Export never contains access keys, link tokens, SIDs, Paddle customer/subscription ids, or other users' data.
- New endpoints → `docs/api.md`; Paddle calls → `docs/billing.md`; new files → `CLAUDE.md` layout line; user-visible change → `shared/changelog.ts` (en/ro/it).
- Migrations additive. Commits `type(scope): subject` + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push. Never ssh. Never touch the owner's dev server (5173/5178).
- Verify: `npm run typecheck`, `npm test`, `npm run build`, `npm run i18n:check`.

## Review Focus

1. A persona shared with another user: deleting user A must keep the persona's cache folder and history when user B currently owns it (`personas.userId = B`), and remove only A's `persona_links` row — Task 1 `purgePlan` tests.
2. A user who is the current owner AND another user has a `persona_links` row but no ownership: data is purged (links are history, ownership is "currently uses") — Task 1 test.
3. Cancel-deletion after the Paddle subscription already ended (no scheduled change to remove) must not fail the request — Task 2 treats Paddle 4xx on the uncancel call as "nothing to undo" and still clears `delete_at`.
4. A crash half-way through `purgeUser` (e.g. Clerk down) must be safe to re-run the next hour: every step idempotent, Clerk 404 = done — Task 2 test of the step order with fakes.
5. Export of a user with a persona whose cache folder is missing (never synced) must not 500 — Task 3 test.

---

### Task 1: Schema, pure rules, purge primitives

**Files:**
- Modify: `server/db/schema.ts` (`users.deleteAt: timestamp('delete_at', { withTimezone: true })`), new migration via `npm run db:generate` (exactly one `ALTER TABLE "users" ADD COLUMN "delete_at" timestamptz`)
- Create: `server/deletion-rules.ts`, `server/deletion-rules.test.ts`
- Create: `server/db/deletion.ts` (DB reads/writes for scheduling and purging)
- Modify: `server/store.ts` (`dropKeys(prefix: string): Promise<void>` — rm `DATA_DIR/<prefix>` recursively and evict shared-cache entries starting with the prefix)
- Modify: `server/accounts.ts` (`forgetAccount(personaId: number): void` — remove from the in-memory map)

**Interfaces (produced):**
- `DELETE_DELAY_MS = 7 * 24 * 3600 * 1000`; `deleteDate(now: number): Date`; `isConfirmWord(s: unknown): boolean`.
- `purgePlan(userId: string, personas: { personaId: number; ownerId: string | null }[], links: { personaId: number; userId: string }[]): { purge: number[]; unlinkOnly: number[] }` — considers every persona the user owns or is linked to; `purge` when no OTHER user is the current owner; `unlinkOnly` otherwise.
- `server/db/deletion.ts`: `scheduleDeletion(userId, at: Date)`, `clearDeletion(userId)`, `deleteAtOf(userId): Promise<Date | null>`, `dueDeletions(now: Date): Promise<string[]>`, `personasForPurge(userId)` (rows for `purgePlan`), `purgePersonaRows(personaId)` (completion_marks, completions, evo_trainings, brick_reports, trusted_accounts, persona_links, personas), `unlinkUser(personaId, userId)` (that user's persona_links row; personas row only if owner is this user), `purgeUserRows(userId)` (link_tokens, subscriptions, daily_plays, daily_reminders, redemptions, point_ledger by userId, codes by ownerId, null-out `users.invited_by` and `point_ledger.ref` pointing at the user, then `users`), `anonymizeEvents(userId, purgedPersonas: number[])`. Each in a transaction where it touches several tables; each idempotent (deleting nothing is fine).

- [ ] **Step 1: Failing tests** `server/deletion-rules.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DELETE_DELAY_MS, deleteDate, isConfirmWord, purgePlan } from './deletion-rules.js';

test('confirm word: any language, trimmed, case-insensitive; nothing else', () => {
  for (const w of ['DELETE', 'delete', ' Delete ', 'ȘTERGE', 'șterge', 'ELIMINA', 'elimina']) assert.equal(isConfirmWord(w), true, w);
  for (const w of ['', 'DEL', 'yes', 'STERGE', null, 42]) assert.equal(isConfirmWord(w), false, String(w));
});

test('deletion date is 7 days ahead', () => {
  assert.equal(deleteDate(1000).getTime(), 1000 + DELETE_DELAY_MS);
});

test('sole owner: purge', () => {
  assert.deepEqual(purgePlan('a', [{ personaId: 1, ownerId: 'a' }], [{ personaId: 1, userId: 'a' }]), { purge: [1], unlinkOnly: [] });
});

test('another user owns it now: keep the data, drop only my link', () => {
  assert.deepEqual(purgePlan('a', [{ personaId: 1, ownerId: 'b' }], [{ personaId: 1, userId: 'a' }, { personaId: 1, userId: 'b' }]), { purge: [], unlinkOnly: [1] });
});

test('others only linked in the past (not owners): purge', () => {
  assert.deepEqual(purgePlan('a', [{ personaId: 1, ownerId: 'a' }], [{ personaId: 1, userId: 'a' }, { personaId: 1, userId: 'c' }]), { purge: [1], unlinkOnly: [] });
});

test('only a past link, persona unowned: purge', () => {
  assert.deepEqual(purgePlan('a', [{ personaId: 2, ownerId: null }], [{ personaId: 2, userId: 'a' }]), { purge: [2], unlinkOnly: [] });
});
```

- [ ] **Step 2:** run `node --import tsx --test server/deletion-rules.test.ts` → FAIL.
- [ ] **Step 3: Implement `server/deletion-rules.ts`:**

```ts
// Pure rules for deleting an account (docs/superpowers/specs/2026-10-13-gdpr-account-design.md).
export const DELETE_DELAY_MS = 7 * 24 * 3600 * 1000;
export const deleteDate = (now: number) => new Date(now + DELETE_DELAY_MS);

const WORDS = new Set(['delete', 'șterge', 'elimina']);
/** The word typed in the confirm box, in any site language. */
export const isConfirmWord = (s: unknown) => typeof s === 'string' && WORDS.has(s.trim().toLocaleLowerCase('ro'));

/**
 * Which EA accounts lose their data when `userId` goes: those no OTHER user currently owns.
 * A past link (persona_links) is history, not use; ownership (personas.userId) is.
 */
export function purgePlan(
  userId: string,
  personas: { personaId: number; ownerId: string | null }[],
  links: { personaId: number; userId: string }[],
): { purge: number[]; unlinkOnly: number[] } {
  const mine = new Set([...personas.filter((p) => p.ownerId === userId).map((p) => p.personaId), ...links.filter((l) => l.userId === userId).map((l) => l.personaId)]);
  const owner = new Map(personas.map((p) => [p.personaId, p.ownerId]));
  const purge: number[] = [];
  const unlinkOnly: number[] = [];
  for (const id of [...mine].sort((a, b) => a - b)) {
    const o = owner.get(id) ?? null;
    if (o && o !== userId) unlinkOnly.push(id);
    else purge.push(id);
  }
  return { purge, unlinkOnly };
}
```

(Check `'ȘTERGE'.toLocaleLowerCase('ro') === 'șterge'` in the test run; adjust to compare upper-case if needed.)

- [ ] **Step 4:** tests PASS. Then schema column + `npm run db:generate` (read the SQL: one ADD COLUMN only). Then `server/db/deletion.ts`, `dropKeys` in store.ts (with a test in `server/store.test.ts`: write `t/p/x`, `dropKeys('t/p')` → readShared/readCache null, folder gone), `forgetAccount` in accounts.ts.
- [ ] **Step 5:** `npm run typecheck && npm test`. Commit `feat(server): account deletion schema and purge rules`.

### Task 2: Paddle cancel calls, delete endpoints, ticker, email

**Files:**
- Modify: `server/billing/paddle.ts` (`cancelSubscription(c, id, when: 'next_billing_period' | 'immediately')`, `removeScheduledChange(c, id)`; extend `call` to support `PATCH`)
- Create: `server/deletion.ts` (`requestDeletion`, `cancelDeletion`, `purgeUser`, `runDueDeletions`, `scheduleDeletions()` ticker)
- Create: `server/deletion.test.ts` (purgeUser step order + idempotency with injected fakes)
- Modify: `server/index.ts` (`POST /api/me/delete`, `POST /api/me/delete/cancel`, `/api/me` adds `deleteAt: number | null`; start the ticker next to the other tickers)
- Modify: `server/alert.ts` (`AlertKind` adds `'deletion'`)
- Modify: `server/db/events.ts` (`EventType` adds `'account'`)
- Modify: `docs/api.md`, `docs/billing.md`

**Interfaces:**
- Consumes Task 1: `isConfirmWord`, `deleteDate`, `purgePlan`, all of `server/db/deletion.ts`, `dropKeys`, `forgetAccount`.
- `purgeUser(userId, deps = defaultDeps)` where `deps = { paddleCancelNow(subIds), clerkDelete(userId), personasForPurge, purgePersonaRows, unlinkUser, dropKeys, forgetAccount, purgeUserRows, anonymizeEvents, subsToCancel(userId) }` so the test injects fakes. Order: Paddle → Clerk (404 ok) → personas (purge: `dropKeys('accounts/<id>')` + `purgePersonaRows` + `forgetAccount`; unlinkOnly: `unlinkUser`) → `anonymizeEvents` → `purgeUserRows` (users row last, so a crash before it leaves the user due for the next run).

- [ ] **Step 1: Paddle.** `POST /subscriptions/{id}/cancel` body `{ effective_from }`; `PATCH /subscriptions/{id}` body `{ scheduled_change: null }`. Both throw on non-2xx (existing `call`); callers decide.
- [ ] **Step 2: `requestDeletion(userId, confirm)`**: `!isConfirmWord(confirm)` → `SessionError('Type the confirm word to delete your account.', 400, 'deleteConfirm')`. Keep an existing date, else `scheduleDeletion(userId, deleteDate(Date.now()))`. Billing on (`billingConfig()` not null): for each of the user's subscriptions with status `active` | `trialing` | `past_due` and no scheduled cancel → `cancelSubscription(c, id, 'next_billing_period')`; a Paddle failure → `SessionError('Could not stop the subscription renewal. Try again in a minute.', 502, 'deletePaddle')` and the date is NOT kept (clear it) so the user can retry. Send the confirmation email through `sendMails` (if Resend is configured) in the user's language: subject + text + html with the date and "sign in to FC Solver and press Cancel deletion to keep your account" (strings in a small `server/deletion-mail.ts` en/ro/it map, like the unsubscribe texts in index.ts). Log event `{ type: 'account', userId, data: { action: 'deleteRequested' } }`.
- [ ] **Step 3: `cancelDeletion(userId)`**: `clearDeletion`; for subscriptions that have a scheduled cancel (`scheduledChange`/`cancelAt` column — use whatever `subscriptions` stores; read `server/db/billing.ts`) → `removeScheduledChange`; a Paddle 4xx there = nothing to undo (log, continue); log event `deleteCancelled`.
- [ ] **Step 4: endpoints** in index.ts (both via `siteUser(req)`), `/api/me` → `deleteAt: (await deleteAtOf(userId))?.getTime() ?? null` (add to the existing Promise.all).
- [ ] **Step 5: `purgeUser` test first** (`server/deletion.test.ts`): fakes record calls; assert order; assert a throwing `clerkDelete` stops before personas and a re-run completes; assert `clerkDelete` rejecting with a 404-shaped error counts as done; assert shared persona → `unlinkUser` not `dropKeys`. RED, then implement, GREEN.
- [ ] **Step 6: ticker** `scheduleDeletions()`: run `runDueDeletions()` once at start and every hour (`setInterval(...).unref()`); per user try/catch → `alert('deletion', e)` and continue with the next user; never two runs at once (a running flag).
- [ ] **Step 7: docs** (`docs/api.md` both endpoints + `deleteAt` in `/api/me`; `docs/billing.md` the two Paddle calls and that they never write local state). `npm run typecheck && npm test`. Commit `feat(server): scheduled account deletion with Paddle renewal stop`.

### Task 3: Data export

**Files:**
- Create: `server/export.ts` (`buildExport(userId): Promise<object>`; a pure `sanitizeAccountInfo(info)` that drops `accessKey`, `sid`, and any `paddle*` ids), `server/export.test.ts`
- Modify: `server/index.ts` (`GET /api/me/export`, per-user limiter 1/min via `createLimiter` keyed by userId), `docs/api.md`

- [ ] **Step 1: tests first** for the pure parts: `sanitizeAccountInfo` removes keys/ids; the subscription mapper keeps status/interval/period/canceledAt and drops `id`/`customerId`; a missing persona cache (readCache → null) yields `club: null`, not a throw (test the assembler with injected readers).
- [ ] **Step 2: implement** per spec section 2 (contents and exclusions). Reads only (DB selects, `readCache`), no writes. Response headers: `Content-Type: application/json; charset=utf-8`, `Content-Disposition: attachment; filename="fc-solver-YYYY-MM-DD.json"`, `Cache-Control: no-store`. Over the limit → 429 `rateLimited`.
- [ ] **Step 3:** `npm run typecheck && npm test`. Commit `feat(server): download my data`.

### Task 4: Settings "Your data" card, deletion banner, changelog

**Files:**
- Modify: the Settings screen (find it: `view === 'settings'` in `web/src/App.tsx` / `web/src/components/SettingsRows.tsx`), `web/src/api.ts` (`exportData()`, `requestDelete(confirm)`, `cancelDelete()`, `Me.deleteAt`), `web/src/App.tsx` (banner), `web/src/styles.css`, locales en/ro/it, `shared/changelog.ts`

- [ ] **Step 1: api.ts** helpers; export downloads via `fetch` with the auth headers, then a Blob + temporary `<a download>` (the server's filename).
- [ ] **Step 2: Settings card "Your data"**: "Download my data" (ghost button; disabled + spinner while running; error banner via `errorText`). "Delete my account": opens an inline confirm block (not a modal) explaining what is deleted, the 7-day undo, that an active subscription stops renewing with no automatic refund (refunds on request, link `/refunds`), and an input "Type DELETE to confirm" (the localized word from `t('settings.deleteWord')`); the red-styled confirm button (`--bad` border, not `--go`) is enabled only when the input matches (`isConfirmWord`-equivalent check client-side). On success `me` is reloaded.
- [ ] **Step 3: banner** while `me.deleteAt`: top of the app, `role="status"`, text "Your account will be deleted on {date}" + button "Cancel deletion" → `cancelDelete()` then reload `me`. Visible on every dashboard screen and at 390px.
- [ ] **Step 4: strings** (en / ro / it — write them; e.g. en `settings.data.title` "Your data", `settings.export` "Download my data", `settings.delete` "Delete my account", `settings.deleteBody` (what goes, 7 days, subscription renewal stops, no automatic refund), `settings.deleteWord` "DELETE" / ro "ȘTERGE" / it "ELIMINA", `settings.deleteConfirm` "Type {word} to confirm", `settings.deleteButton` "Delete my account in 7 days", `deletion.banner` "Your account will be deleted on {date}.", `deletion.cancel` "Cancel deletion", `err.deleteConfirm`, `err.deletePaddle`).
- [ ] **Step 5: changelog** today's entry (2026-10-13 exists — add an item; en/ro/it): "Settings → Your data: download everything FC Solver keeps about you, or delete your account (7 days to change your mind)".
- [ ] **Step 6:** typecheck, test, build, i18n:check. Commit `feat(web): download my data and delete my account in Settings`.

### Task 5: Legal texts, ban FAQ, checkout links

**Files:**
- Modify: `web/src/legal/docs.ts` (en/ro/it), `web/src/locales/*.ts` (`landing.faq.ban.a`), `web/src/components/billing/UpgradePage.tsx` (Terms + Privacy links next to refunds), `web/src/legal/docs.test.ts` if section ids change (keep ids; add content)

- [ ] **Step 1:** privacy "data" / "who" / "why" / "keep" / "rights" and terms "paid" / "end" per spec section 3, in all three languages, written naturally (not word-for-word). Keep the operator block (`OPERATOR`, `CONTACT`); set `UPDATED` to `'2026-10-13'`.
- [ ] **Step 2:** ban FAQ answer per spec, three languages.
- [ ] **Step 3:** UpgradePage links: `/terms`, `/privacy` (same style as the refunds link; `t()` labels — reuse existing legal link keys if present).
- [ ] **Step 4:** typecheck, test (docs.test.ts), build, i18n:check. Commit `docs(legal): processors, legal bases, deletion and export, lifetime Premium; honest ban FAQ`.

### Task 6: Verification on dev (controller, after merge)

- [ ] Deploy dev (`deploy/release.sh /var/www/sbc-builder`); migration applied.
- [ ] Throwaway Clerk-dev account A with a linked test persona and a Paddle sandbox subscription; account B linked to the same persona as current owner for the shared-persona case (or a second persona owned only by A).
- [ ] Export as A: file downloads, no keys/ids.
- [ ] Request deletion: Paddle sandbox shows the scheduled cancel; banner shows; cancel deletion: scheduled cancel removed, banner gone; request again; set `delete_at` into the past on dev's DB for A; wait for / trigger the ticker: Clerk user gone, rows gone, sole-owned persona folder gone, shared persona kept for B, events anonymized.
- [ ] Legal pages render in en/ro/it; checkout shows the three links.
