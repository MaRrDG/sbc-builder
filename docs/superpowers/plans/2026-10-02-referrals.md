# Invites, Points and Codes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every user gets an invite code and link. An invitee gets 7 days Premium, or lifetime as a Founding-50 founder. The inviter earns points that buy Premium or gift codes. Admins create promo codes.

**Architecture:** Pure rules go in `server/referrals.ts` (unit tested). Three new Postgres tables (`codes`, `redemptions`, `point_ledger`) are added through Drizzle, with transactional DB code in `server/db/referrals.ts`. The invite reward fires on the same EA-link hook as Founding 50 (`/api/hello`, right after `grantFounderSpot`). The web side gets a shared `CodeInput` used by onboarding and Settings, an "Invite friends" Settings card, Founder badges, and an admin "Codes" tab.

**Tech Stack:** Fastify 5 + Drizzle 0.45 + Postgres, node:test via `tsx`, React 19 + Vite, plain CSS (OKLCH tokens), Phosphor icons, i18n en/ro/it.

**Spec:** `docs/superpowers/specs/2026-10-02-referrals-design.md`

## Global Constraints

- Prices: **7 days = 2 points, 14 days = 3, 30 days = 5**. The invitee reward is **7 days**. The inviter reward is **+1 point**, at most **one per EA persona**, ever.
- A user can use **one invite code for the lifetime of their account**. There is no time window, and old users can enter one too.
- Each promo code can be used once per user. A gift code can be used once in total. Nobody can use their own invite or gift code.
- Days are added from `max(now, premiumUntil)`. When a user has lifetime Premium (`plan='premium' && premiumUntil === null`), days add nothing.
- A Founding-50 founder is always shown as **"Premium for life · Founder"**, never as "+7 days".
- Code alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (no 0 O 1 I). Invite and gift codes are 6 characters. Admin promo codes are 4–20 characters from `[A-Z0-9]`.
- Nothing here talks to EA. Never write to EA.
- Every user-facing string goes through `t()`, with keys in `web/src/locales/en.ts`, `ro.ts` and `it.ts`. Romanian plurals use `_one/_few/_other`, Italian `_one/_other`. Run `npm run i18n:check`.
- Server errors shown to users are sent as `{ error, code, params }`. The web shows them with `errorText()` → `t('err.<code>')`.
- UI: `--go` green only for the primary action, controls 8px radius, containers 14px, check at 390px, WCAG AA, `prefers-reduced-motion`.
- Every new endpoint goes into `docs/api.md`.
- `localStorage` keys keep the `sbc-*` prefix (`sbc-ref`), and every access is wrapped in try/catch.
- Commits: `git pull --rebase`, then `type(scope): subject`, ending with the Co-Authored-By trailer. Never push without asking.

## Review Focus

1. **Double submit / two tabs**: the same user redeems twice at once, or double-clicks "Spend". Expected: one grant, one ledger debit. Pinned by the transaction + advisory lock in Task 3, and by the unique indexes in Task 2.
2. **Code typed sloppily** (`" k7m2qx "`, `K7M2-QX`, a lowercase promo): expected to be accepted after normalising. Pinned by the `normalizeCode` tests in Task 1.
3. **Invitee becomes a founder on the link that grants the invite**: expected to show lifetime, while the inviter still gets the point. Pinned by the Task 1 `extendPremium` lifetime case and by the order in the Task 4 hook (founder first).
4. **Same EA persona linked by a second Clerk account with another invite code**: the invitee still gets 7 days, but no second point goes to anyone. Pinned by the unique `(persona_id) where reason='invite'` index + `onConflictDoNothing` in Task 3.
5. **`?ref=` on a signed-in user who already used an invite**: expected that the banner never shows and the key gets cleared. Pinned by `shouldOfferRef` in Task 6.

---

## File Structure

| File | Responsibility |
|---|---|
| `server/referrals.ts` (new) | Pure rules: alphabet, generate/normalize codes, redeem checks, premium extension, prices, spend checks |
| `server/referrals.test.ts` (new) | Unit tests for the above |
| `server/db/schema.ts` (modify) | `codes`, `redemptions`, `pointLedger` tables, `users.invitedBy` |
| `server/db/migrations/0008_*.sql` (generated) | Migration |
| `server/db/referrals.ts` (new) | Transactions: own code, redeem, pending invite grant, spend, summary, admin listing |
| `server/plan.ts`, `server/plans.ts`, `server/db/users.ts` (modify) | `founder` on `PlanInfo` |
| `server/index.ts` (modify) | User routes, redeem limiter, link hook, onboarding `code` |
| `server/admin/codes.ts` (new), `server/admin/routes.ts`, `server/admin/users.ts` (modify) | Admin codes API + referral info on user detail |
| `web/src/api.ts` (modify) | Types + helpers |
| `web/src/ref.ts` + `ref.test.ts` (new) | `?ref=` capture/storage rules |
| `web/src/components/CodeInput.tsx` (new) | Shared "enter a code" field with inline result |
| `web/src/components/OnboardingModal.tsx` (modify) | Optional code field |
| `web/src/components/InviteCard.tsx` (new) | Settings card |
| `web/src/components/PlanCard.tsx`, `AccountMenu.tsx`, `web/src/App.tsx` (modify) | Founder badge, ref banner, reward notice, card wiring |
| `web/src/components/admin/CodesTable.tsx` (new), `UserDetail.tsx`, `web/src/route.ts` (modify) | Admin Codes tab |
| `web/src/locales/{en,ro,it}.ts`, `web/src/styles.css`, `web/src/landing/*` | Text, styles, FAQ line |
| `docs/api.md` | Endpoints |

---

### Task 1: Pure referral rules

**Files:**
- Create: `server/referrals.ts`
- Test: `server/referrals.test.ts`

**Interfaces:**
- Produces (used by Tasks 3, 4, 5):
  - `CODE_ALPHABET: string`, `INVITE_DAYS = 7`, `PRICES: Record<SpendDays, number>`, `type SpendDays = 7 | 14 | 30`, `type CodeKind = 'invite' | 'promo' | 'gift'`
  - `generateCode(len?: number, rand?: (n: number) => number): string`
  - `normalizeCode(raw: unknown): string | null`
  - `interface CodeRow { code: string; kind: CodeKind; ownerId: string | null; days: number | null; maxUses: number | null; uses: number; expiresAt: Date | null; disabled: boolean }`
  - `type RedeemError = 'codeUnknown' | 'codeDisabled' | 'codeExpired' | 'codeFull' | 'codeOwn' | 'inviteUsed' | 'codeUsed'`
  - `checkRedeem(code: CodeRow | null, ctx: { userId: string; usedInvite: boolean; usedThis: boolean; now: number }): RedeemError | null`
  - `rewardDays(code: CodeRow): number | null` (null = lifetime)
  - `isLifetime(row: { plan: string; premiumUntil: Date | null }): boolean`
  - `extendPremium(row: { plan: string; premiumUntil: Date | null }, days: number | null, now: number): { plan: 'premium'; premiumUntil: Date | null } | null` (null = no change)
  - `parseSpend(body: unknown): { days: SpendDays; gift: boolean } | null`
  - `checkSpend(balance: number, days: SpendDays, gift: boolean, lifetime: boolean): 'pointsLow' | 'pointsLifetime' | null`
  - `parsePromo(body: unknown): { code: string | null; days: number | null; maxUses: number | null; expiresAt: Date | null; note: string } | null`

- [ ] **Step 1: Write the failing tests**

`server/referrals.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CODE_ALPHABET, PRICES, checkRedeem, checkSpend, extendPremium, generateCode, isLifetime,
  normalizeCode, parsePromo, parseSpend, rewardDays, type CodeRow,
} from './referrals.js';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 2);
const code = (o: Partial<CodeRow> = {}): CodeRow => ({
  code: 'K7M2QX', kind: 'invite', ownerId: 'u_owner', days: null, maxUses: null, uses: 0, expiresAt: null, disabled: false, ...o,
});
const ctx = { userId: 'u_me', usedInvite: false, usedThis: false, now: NOW };

test('generateCode uses the alphabet only', () => {
  let i = 0;
  const c = generateCode(6, (n) => i++ % n);
  assert.equal(c.length, 6);
  for (const ch of c) assert.ok(CODE_ALPHABET.includes(ch));
  assert.ok(!/[01OI]/.test(CODE_ALPHABET));
});

test('normalizeCode', () => {
  assert.equal(normalizeCode(' k7m2qx '), 'K7M2QX');
  assert.equal(normalizeCode('K7M2-QX'), 'K7M2QX');
  assert.equal(normalizeCode('k7m2 qx'), 'K7M2QX');
  assert.equal(normalizeCode('SUMMER2026'), 'SUMMER2026');
  assert.equal(normalizeCode('abc'), null); // too short
  assert.equal(normalizeCode('A'.repeat(21)), null); // too long
  assert.equal(normalizeCode('K7M2Q!'), null);
  assert.equal(normalizeCode(42), null);
  assert.equal(normalizeCode(undefined), null);
});

test('checkRedeem: refusals', () => {
  assert.equal(checkRedeem(null, ctx), 'codeUnknown');
  assert.equal(checkRedeem(code({ disabled: true }), ctx), 'codeDisabled');
  assert.equal(checkRedeem(code({ kind: 'promo', ownerId: null, expiresAt: new Date(NOW - 1) }), ctx), 'codeExpired');
  assert.equal(checkRedeem(code({ kind: 'promo', ownerId: null, maxUses: 3, uses: 3 }), ctx), 'codeFull');
  assert.equal(checkRedeem(code({ ownerId: 'u_me' }), ctx), 'codeOwn');
  assert.equal(checkRedeem(code({ kind: 'gift', ownerId: 'u_me', days: 7, maxUses: 1 }), ctx), 'codeOwn');
  assert.equal(checkRedeem(code(), { ...ctx, usedInvite: true }), 'inviteUsed');
  assert.equal(checkRedeem(code({ kind: 'promo', ownerId: null }), { ...ctx, usedThis: true }), 'codeUsed');
  assert.equal(checkRedeem(code({ kind: 'gift', days: 7, maxUses: 1, uses: 1 }), ctx), 'codeFull');
});

test('checkRedeem: accepted', () => {
  assert.equal(checkRedeem(code(), ctx), null);
  assert.equal(checkRedeem(code({ kind: 'promo', ownerId: null, maxUses: 3, uses: 2, expiresAt: new Date(NOW + DAY) }), ctx), null);
  // a used invite does not block a promo
  assert.equal(checkRedeem(code({ kind: 'promo', ownerId: null }), { ...ctx, usedInvite: true }), null);
});

test('rewardDays', () => {
  assert.equal(rewardDays(code()), 7);
  assert.equal(rewardDays(code({ kind: 'gift', days: 30 })), 30);
  assert.equal(rewardDays(code({ kind: 'promo', days: null })), null); // lifetime promo
  assert.equal(rewardDays(code({ kind: 'promo', days: 14 })), 14);
});

test('isLifetime + extendPremium', () => {
  assert.equal(isLifetime({ plan: 'premium', premiumUntil: null }), true);
  assert.equal(isLifetime({ plan: 'premium', premiumUntil: new Date(NOW + DAY) }), false);
  assert.equal(isLifetime({ plan: 'free', premiumUntil: null }), false);
  // free → 7 days from now
  assert.deepEqual(extendPremium({ plan: 'free', premiumUntil: null }, 7, NOW), { plan: 'premium', premiumUntil: new Date(NOW + 7 * DAY) });
  // expired premium → counted from now, not from the old end
  assert.deepEqual(extendPremium({ plan: 'premium', premiumUntil: new Date(NOW - 3 * DAY) }, 7, NOW), { plan: 'premium', premiumUntil: new Date(NOW + 7 * DAY) });
  // running premium → stacked on its end
  assert.deepEqual(extendPremium({ plan: 'premium', premiumUntil: new Date(NOW + 2 * DAY) }, 14, NOW), { plan: 'premium', premiumUntil: new Date(NOW + 16 * DAY) });
  // lifetime (founder or admin-set) → no change
  assert.equal(extendPremium({ plan: 'premium', premiumUntil: null }, 7, NOW), null);
  // a lifetime promo turns anyone lifetime
  assert.deepEqual(extendPremium({ plan: 'free', premiumUntil: null }, null, NOW), { plan: 'premium', premiumUntil: null });
});

test('prices + parseSpend + checkSpend', () => {
  assert.deepEqual(PRICES, { 7: 2, 14: 3, 30: 5 });
  assert.deepEqual(parseSpend({ days: 14, gift: true }), { days: 14, gift: true });
  assert.deepEqual(parseSpend({ days: 7 }), { days: 7, gift: false });
  assert.equal(parseSpend({ days: 10 }), null);
  assert.equal(parseSpend(null), null);
  assert.equal(checkSpend(5, 30, false, false), null);
  assert.equal(checkSpend(4, 30, true, false), 'pointsLow');
  assert.equal(checkSpend(9, 7, false, true), 'pointsLifetime'); // nothing to extend
  assert.equal(checkSpend(9, 7, true, true), null); // gifts are always allowed
});

test('parsePromo', () => {
  assert.deepEqual(parsePromo({ days: 30, maxUses: 100, expiresAt: '2026-12-31T00:00:00Z', note: 'tiktok' }), {
    code: null, days: 30, maxUses: 100, expiresAt: new Date('2026-12-31T00:00:00Z'), note: 'tiktok',
  });
  assert.deepEqual(parsePromo({ code: ' summer26 ', days: null }), { code: 'SUMMER26', days: null, maxUses: null, expiresAt: null, note: '' });
  assert.equal(parsePromo({ days: 0 }), null);
  assert.equal(parsePromo({ days: 7, maxUses: -1 }), null);
  assert.equal(parsePromo({ days: 7, expiresAt: 'nope' }), null);
  assert.equal(parsePromo({ code: 'x!', days: 7 }), null);
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `node --import tsx --test server/referrals.test.ts`
Expected: FAIL, `Cannot find module './referrals.js'`.

- [ ] **Step 3: Implement `server/referrals.ts`**

```ts
// Invites, points and codes: pure rules. Rows and transactions live in server/db/referrals.ts.
import { randomInt } from 'node:crypto';

export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0 O 1 I
export const INVITE_DAYS = 7;
export type SpendDays = 7 | 14 | 30;
export const PRICES: Record<SpendDays, number> = { 7: 2, 14: 3, 30: 5 };
export type CodeKind = 'invite' | 'promo' | 'gift';

export interface CodeRow {
  code: string;
  kind: CodeKind;
  ownerId: string | null;
  days: number | null; // invite: unused (INVITE_DAYS); promo: null = lifetime
  maxUses: number | null;
  uses: number;
  expiresAt: Date | null;
  disabled: boolean;
}

export type RedeemError = 'codeUnknown' | 'codeDisabled' | 'codeExpired' | 'codeFull' | 'codeOwn' | 'inviteUsed' | 'codeUsed';

export function generateCode(len = 6, rand: (n: number) => number = randomInt): string {
  let s = '';
  for (let i = 0; i < len; i++) s += CODE_ALPHABET[rand(CODE_ALPHABET.length)];
  return s;
}

/** What the user typed, as stored: upper case, spaces and dashes dropped; null when it cannot be a code. */
export function normalizeCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const c = raw.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{4,20}$/.test(c) ? c : null;
}

/** Why this user cannot use this code now, or null when they can. */
export function checkRedeem(code: CodeRow | null, ctx: { userId: string; usedInvite: boolean; usedThis: boolean; now: number }): RedeemError | null {
  if (!code) return 'codeUnknown';
  if (code.disabled) return 'codeDisabled';
  if (code.expiresAt && code.expiresAt.getTime() <= ctx.now) return 'codeExpired';
  if (code.ownerId === ctx.userId) return 'codeOwn';
  if (code.kind === 'invite' && ctx.usedInvite) return 'inviteUsed';
  if (ctx.usedThis) return 'codeUsed';
  if (code.maxUses !== null && code.uses >= code.maxUses) return 'codeFull';
  return null;
}

/** Days of Premium the code gives; null = for life. */
export const rewardDays = (code: CodeRow): number | null => (code.kind === 'invite' ? INVITE_DAYS : code.days);

export const isLifetime = (row: { plan: string; premiumUntil: Date | null }) => row.plan === 'premium' && row.premiumUntil === null;

/** The plan after adding `days` (null = for life); null when nothing changes (already for life). */
export function extendPremium(row: { plan: string; premiumUntil: Date | null }, days: number | null, now: number): { plan: 'premium'; premiumUntil: Date | null } | null {
  if (isLifetime(row)) return null;
  if (days === null) return { plan: 'premium', premiumUntil: null };
  const from = row.plan === 'premium' && row.premiumUntil ? Math.max(now, row.premiumUntil.getTime()) : now;
  return { plan: 'premium', premiumUntil: new Date(from + days * 86_400_000) };
}

export function parseSpend(body: unknown): { days: SpendDays; gift: boolean } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  if (b.days !== 7 && b.days !== 14 && b.days !== 30) return null;
  return { days: b.days, gift: b.gift === true };
}

export function checkSpend(balance: number, days: SpendDays, gift: boolean, lifetime: boolean): 'pointsLow' | 'pointsLifetime' | null {
  if (!gift && lifetime) return 'pointsLifetime';
  return balance < PRICES[days] ? 'pointsLow' : null;
}

/** An admin's new promo code; null when any field is malformed. */
export function parsePromo(body: unknown): { code: string | null; days: number | null; maxUses: number | null; expiresAt: Date | null; note: string } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;
  const code = b.code === undefined || b.code === '' ? null : normalizeCode(b.code);
  if (b.code !== undefined && b.code !== '' && !code) return null;
  const days = b.days === null || b.days === undefined ? null : b.days;
  if (days !== null && !(Number.isInteger(days) && (days as number) > 0 && (days as number) <= 3650)) return null;
  const maxUses = b.maxUses === null || b.maxUses === undefined || b.maxUses === '' ? null : b.maxUses;
  if (maxUses !== null && !(Number.isInteger(maxUses) && (maxUses as number) > 0)) return null;
  const expiresAt = b.expiresAt ? new Date(String(b.expiresAt)) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return null;
  return { code, days: days as number | null, maxUses: maxUses as number | null, expiresAt, note: typeof b.note === 'string' ? b.note.slice(0, 200) : '' };
}
```

- [ ] **Step 4: Run the tests**

Run: `node --import tsx --test server/referrals.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add server/referrals.ts server/referrals.test.ts
git commit -m "feat(referrals): pure rules for codes, rewards and points"
```

---

### Task 2: Schema + migration

**Files:**
- Modify: `server/db/schema.ts` (users table at lines 59-79, plus new tables after `users`)
- Create: `server/db/migrations/0008_*.sql` (via `npm run db:generate`)

**Interfaces:**
- Produces: Drizzle tables `codes`, `redemptions`, `pointLedger`, and column `users.invitedBy`.

- [ ] **Step 1: Add the column + tables**

In `users`, after `onboardedAt`:
```ts
  invitedBy: text('invited_by'), // userId whose invite code this user used (once per account)
```

After the `users` table:
```ts
/** Invite (one per user), promo (admin) and gift (bought with points) codes; server/referrals.ts. */
export const codes = pgTable(
  'codes',
  {
    code: text('code').primaryKey(),
    kind: text('kind').notNull(), // 'invite' | 'promo' | 'gift'
    ownerId: text('owner_id'), // invite / gift: the user who owns it
    days: integer('days'), // promo / gift; promo null = for life; invite unused
    maxUses: integer('max_uses'), // null: no limit; gift: 1
    uses: integer('uses').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    disabled: boolean('disabled').notNull().default(false),
    note: text('note').notNull().default(''),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('codes_one_invite').on(t.ownerId).where(sql`kind = 'invite'`), index('codes_owner').on(t.ownerId)],
);

/** Who used which code. An invite waits ('pending') until the user links an EA account. */
export const redemptions = pgTable(
  'redemptions',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull(),
    kind: text('kind').notNull(), // copied from the code: the one-invite-per-user index needs it
    userId: text('user_id').notNull(),
    status: text('status').notNull(), // 'pending' | 'granted'
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    grantedAt: timestamp('granted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('redemptions_code_user').on(t.code, t.userId),
    uniqueIndex('redemptions_one_invite').on(t.userId).where(sql`kind = 'invite'`),
    index('redemptions_code').on(t.code),
  ],
);

/** Points: one row per change; the balance is the sum. One invite point per EA persona, ever. */
export const pointLedger = pgTable(
  'point_ledger',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').notNull(),
    delta: integer('delta').notNull(),
    reason: text('reason').notNull(), // 'invite' | 'spend' | 'gift' | 'admin'
    ref: text('ref').notNull().default(''), // invitee userId / days / gift code
    personaId: bigint('persona_id', { mode: 'number' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('point_ledger_user').on(t.userId), uniqueIndex('point_ledger_invite_persona').on(t.personaId).where(sql`reason = 'invite'`)],
);
```
Add `sql` to the `drizzle-orm` import at the top of `schema.ts` if it is not there yet.

- [ ] **Step 2: Generate the migration**

Run: `npm run db:generate`
Expected: a new `server/db/migrations/0008_*.sql` with `CREATE TABLE "codes"`, `"redemptions"`, `"point_ledger"`, `ALTER TABLE "users" ADD COLUMN "invited_by"`, and the three partial unique indexes containing `WHERE kind = 'invite'` / `reason = 'invite'`. Open the file and check that the `WHERE` clauses are there.

- [ ] **Step 3: Apply and typecheck**

Run `npm run dev:api`. Migrations run on startup (`initDb`). Check the log for errors, then stop it. Run `npm run typecheck`. Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add server/db/schema.ts server/db/migrations
git commit -m "feat(referrals): codes, redemptions and point ledger tables"
```

---

### Task 3: DB layer + `founder` on PlanInfo

**Files:**
- Create: `server/db/referrals.ts`
- Modify: `server/plan.ts` (`PlanRow`), `server/plans.ts` (`PlanInfo`, `planInfo`), `server/db/users.ts` (`planCols`), `web/src/api.ts:220` (`PlanInfo`)

**Interfaces:**
- Consumes: everything from Task 1; the tables from Task 2; `personasOf(userId)` (already used in `server/index.ts`).
- Produces (used by Tasks 4, 5):
  - `ownInviteCode(userId: string): Promise<string>` (creates on first call, retries on collision)
  - `redeem(userId: string, raw: string): Promise<{ ok: true; kind: CodeKind; days: number | null; pending: boolean; founder: boolean } | { ok: false; code: RedeemError }>`
  - `grantPendingInvite(userId: string, personaId: number): Promise<boolean>` (true when something was granted)
  - `spendPoints(userId: string, days: SpendDays, gift: boolean): Promise<{ ok: true; premiumUntil: number | null } | { ok: true; giftCode: string } | { ok: false; code: 'pointsLow' | 'pointsLifetime' }>`
  - `referralSummary(userId: string): Promise<ReferralSummary>` with
    `interface ReferralSummary { code: string; points: number; invited: number; pendingInvites: number; usedInvite: boolean; gifts: { code: string; days: number; usedAt: number | null }[]; ledger: { delta: number; reason: string; at: number }[] }`
  - `PlanInfo` gains `founder: boolean`.

- [ ] **Step 1: `founder` on PlanInfo**

`server/plan.ts`: add `founderAt?: Date | null;` to `PlanRow`.
`server/db/users.ts`: add `founderAt: users.founderAt` to `planCols`, and add `founderAt: users.founderAt` to the `.returning(...)` of `countSolve` if it uses `planCols` there.
`server/plans.ts`:
```ts
export interface PlanInfo {
  tier: Tier;
  premiumUntil: number | null;
  quota: Quota | null; // null: Premium, no limit
  founder: boolean; // Founding 50: Premium for life
}

export function planInfo(row: PlanRow, admin: boolean, now: number): PlanInfo {
  const tier = effectivePlan(row, admin, now);
  return { tier, premiumUntil: row.premiumUntil?.getTime() ?? null, quota: tier === 'free' ? quotaState(row, limit(), now) : null, founder: !!row.founderAt };
}
```
The `planFor` fallback row needs `founderAt: null`. `web/src/api.ts` `PlanInfo`: add `founder: boolean;`.
Run `npm run typecheck`. Fix every place that builds a `PlanInfo` literal (grep `quota:` in `web/src`, e.g. `premiumDemo.ts`) by adding `founder: false`.

- [ ] **Step 2: Write `server/db/referrals.ts`**

```ts
// Invites, promo and gift codes, points. Every write runs in a transaction: a code row is locked
// FOR UPDATE while it is used, and a user's points under a per-user advisory lock.
import { and, desc, eq, sql } from 'drizzle-orm';
import { checkRedeem, checkSpend, extendPremium, generateCode, INVITE_DAYS, isLifetime, normalizeCode, PRICES, rewardDays,
  type CodeKind, type CodeRow, type RedeemError, type SpendDays } from '../referrals.js';
import { db } from './index.js';
import { codes, personas, pointLedger, redemptions, users } from './schema.js';

const POINTS_LOCK = 4151; // per user: (POINTS_LOCK, hashtext(userId))
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function freshCode(tx: Tx | typeof db): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const c = generateCode();
    const [hit] = await tx.select({ code: codes.code }).from(codes).where(eq(codes.code, c));
    if (!hit) return c;
  }
  throw new Error('no free code after 8 tries');
}

export async function ownInviteCode(userId: string): Promise<string> {
  const [have] = await db.select({ code: codes.code }).from(codes).where(and(eq(codes.ownerId, userId), eq(codes.kind, 'invite')));
  if (have) return have.code;
  const code = await freshCode(db);
  await db.insert(codes).values({ code, kind: 'invite', ownerId: userId }).onConflictDoNothing();
  const [row] = await db.select({ code: codes.code }).from(codes).where(and(eq(codes.ownerId, userId), eq(codes.kind, 'invite')));
  return row!.code; // a parallel call may have won: either way there is exactly one
}

/** Adds `days` (null = for life) to a user's Premium inside `tx`; false when nothing changed. */
async function addPremium(tx: Tx, userId: string, days: number | null): Promise<boolean> {
  const [u] = await tx.select({ plan: users.plan, premiumUntil: users.premiumUntil }).from(users).where(eq(users.id, userId)).for('update');
  if (!u) return false;
  const next = extendPremium(u, days, Date.now());
  if (!next) return false;
  await tx.update(users).set(next).where(eq(users.id, userId));
  return true;
}

const isFounder = async (userId: string) =>
  !!(await db.select({ f: users.founderAt }).from(users).where(eq(users.id, userId)))[0]?.f;

export async function redeem(userId: string, raw: string) {
  const c = normalizeCode(raw);
  const result = await db.transaction(async (tx) => {
    const [row] = c ? await tx.select().from(codes).where(eq(codes.code, c)).for('update') : [];
    const [inv] = await tx.select({ id: redemptions.id }).from(redemptions).where(and(eq(redemptions.userId, userId), eq(redemptions.kind, 'invite')));
    const [mine] = c ? await tx.select({ id: redemptions.id }).from(redemptions).where(and(eq(redemptions.userId, userId), eq(redemptions.code, c))) : [];
    const err = checkRedeem((row as CodeRow | undefined) ?? null, { userId, usedInvite: !!inv, usedThis: !!mine, now: Date.now() });
    if (err) return { ok: false as const, code: err };
    const code = row as CodeRow;
    await tx.update(codes).set({ uses: sql`${codes.uses} + 1` }).where(eq(codes.code, code.code));
    if (code.kind === 'invite') {
      await tx.insert(redemptions).values({ code: code.code, kind: 'invite', userId, status: 'pending' });
      await tx.update(users).set({ invitedBy: code.ownerId }).where(eq(users.id, userId));
      return { ok: true as const, kind: code.kind, days: INVITE_DAYS };
    }
    await tx.insert(redemptions).values({ code: code.code, kind: code.kind, userId, status: 'granted', grantedAt: new Date() });
    await addPremium(tx, userId, rewardDays(code));
    return { ok: true as const, kind: code.kind as CodeKind, days: rewardDays(code) };
  });
  if (!result.ok) return result;
  let pending = false;
  if (result.kind === 'invite') {
    const [p] = await db.select({ id: personas.personaId }).from(personas).where(eq(personas.userId, userId)).limit(1);
    pending = !(p && (await grantPendingInvite(userId, p.id)));
  }
  return { ...result, pending, founder: await isFounder(userId) };
}

/** On an EA link: the 7 days for a pending invite, and the inviter's point (one per persona, ever). */
export async function grantPendingInvite(userId: string, personaId: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [r] = await tx.select().from(redemptions)
      .where(and(eq(redemptions.userId, userId), eq(redemptions.kind, 'invite'), eq(redemptions.status, 'pending'))).for('update');
    if (!r) return false;
    const [code] = await tx.select({ ownerId: codes.ownerId }).from(codes).where(eq(codes.code, r.code));
    await tx.update(redemptions).set({ status: 'granted', grantedAt: new Date() }).where(eq(redemptions.id, r.id));
    await addPremium(tx, userId, INVITE_DAYS); // a founder is for life already: no change
    if (code?.ownerId)
      await tx.insert(pointLedger).values({ userId: code.ownerId, delta: 1, reason: 'invite', ref: userId, personaId }).onConflictDoNothing();
    return true;
  });
}

const balanceIn = async (tx: Tx | typeof db, userId: string) =>
  (await tx.select({ n: sql<number>`coalesce(sum(${pointLedger.delta}), 0)::int` }).from(pointLedger).where(eq(pointLedger.userId, userId)))[0]?.n ?? 0;

export async function spendPoints(userId: string, days: SpendDays, gift: boolean) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${POINTS_LOCK}, hashtext(${userId}))`);
    const [u] = await tx.select({ plan: users.plan, premiumUntil: users.premiumUntil }).from(users).where(eq(users.id, userId));
    const err = checkSpend(await balanceIn(tx, userId), days, gift, !!u && isLifetime(u));
    if (err) return { ok: false as const, code: err };
    if (gift) {
      const giftCode = await freshCode(tx);
      await tx.insert(codes).values({ code: giftCode, kind: 'gift', ownerId: userId, days, maxUses: 1 });
      await tx.insert(pointLedger).values({ userId, delta: -PRICES[days], reason: 'gift', ref: giftCode });
      return { ok: true as const, giftCode };
    }
    await addPremium(tx, userId, days);
    await tx.insert(pointLedger).values({ userId, delta: -PRICES[days], reason: 'spend', ref: String(days) });
    const [after] = await tx.select({ premiumUntil: users.premiumUntil }).from(users).where(eq(users.id, userId));
    return { ok: true as const, premiumUntil: after?.premiumUntil?.getTime() ?? null };
  });
}

export interface ReferralSummary {
  code: string;
  points: number;
  invited: number;
  pendingInvites: number;
  usedInvite: boolean;
  gifts: { code: string; days: number; usedAt: number | null }[];
  ledger: { delta: number; reason: string; at: number }[];
}

export async function referralSummary(userId: string): Promise<ReferralSummary> {
  const code = await ownInviteCode(userId);
  const [counts] = await db.select({
    invited: sql<number>`count(*) filter (where ${redemptions.status} = 'granted')::int`,
    pending: sql<number>`count(*) filter (where ${redemptions.status} = 'pending')::int`,
  }).from(redemptions).where(eq(redemptions.code, code));
  const [used] = await db.select({ id: redemptions.id }).from(redemptions).where(and(eq(redemptions.userId, userId), eq(redemptions.kind, 'invite')));
  const gifts = await db.select({ code: codes.code, days: codes.days, usedAt: redemptions.at }).from(codes)
    .leftJoin(redemptions, eq(redemptions.code, codes.code))
    .where(and(eq(codes.ownerId, userId), eq(codes.kind, 'gift'))).orderBy(desc(codes.createdAt));
  const ledger = await db.select({ delta: pointLedger.delta, reason: pointLedger.reason, at: pointLedger.at }).from(pointLedger)
    .where(eq(pointLedger.userId, userId)).orderBy(desc(pointLedger.at)).limit(20);
  return {
    code,
    points: await balanceIn(db, userId),
    invited: counts?.invited ?? 0,
    pendingInvites: counts?.pending ?? 0,
    usedInvite: !!used,
    gifts: gifts.map((g) => ({ code: g.code, days: g.days ?? 0, usedAt: g.usedAt?.getTime() ?? null })),
    ledger: ledger.map((l) => ({ delta: l.delta, reason: l.reason, at: l.at.getTime() })),
  };
}

export type { RedeemError };
```
The redeem flow differs a little from the spec wording, with the same effect: an invite is always inserted as `pending` first, and `grantPendingInvite` runs right away when the user already has a persona. That gives one code path for both cases.

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`. Expected: clean. If `.for('update')` does not type on a select in drizzle 0.45, use `.for('update')` on the query builder before `.where` per the drizzle docs, or fall back to `tx.execute(sql\`select ... for update\`)`.

- [ ] **Step 4: Run the existing tests**

Run: `npm test`. Expected: all PASS (the `PlanInfo` change compiles everywhere).

- [ ] **Step 5: Commit**

```bash
git add server/db/referrals.ts server/plan.ts server/plans.ts server/db/users.ts web/src/api.ts web/src/components/premiumDemo.ts
git commit -m "feat(referrals): db transactions for redeem, invite grant and points"
```

---

### Task 4: User API, link hook, onboarding code, docs

**Files:**
- Modify: `server/index.ts` (limiters ~line 59, `/api/me` ~212, `/api/me/onboarding` ~223, `/api/hello` link block ~376), `server/plans.ts`, `docs/api.md`

**Interfaces:**
- Consumes: Task 3 functions.
- Produces (HTTP, used by Task 6):
  - `GET /api/referral` → `ReferralSummary & { link: string }`
  - `POST /api/redeem { code }` → `{ kind, days, pending, founder }` | 400 `{ error, code: RedeemError, params: {} }` | 429 `rateLimited` (the existing `tooMany()`)
  - `POST /api/points/spend { days, gift }` → `{ premiumUntil }` | `{ giftCode }` | 400 `{ code: 'pointsLow' | 'pointsLifetime' }`
  - `PUT /api/me/onboarding` accepts an extra optional `code`; the response becomes `{ ok: true, redeem?: <redeem result or { error code }> }`

- [ ] **Step 1: Safe link hook in `server/plans.ts`**

```ts
import { grantPendingInvite } from './db/referrals.js';

/** A pending invite's 7 days + the inviter's point, on an EA link. Never throws, like the founders grant. */
export async function grantInviteOnLink(userId: string, personaId: number): Promise<void> {
  try {
    await grantPendingInvite(userId, personaId);
  } catch (e) {
    console.error(`[invite] grant for ${userId} failed: ${(e as Error).message}`);
  }
}
```
In `server/index.ts` `/api/hello`, right after `await grantFounderSpot(userId, r.account.id);`:
```ts
    await grantInviteOnLink(userId, r.account.id); // after the founders grant: a founder stays for life
```

- [ ] **Step 2: Routes**

Next to the other limiters: `const redeemLimit = createLimiter({ windowMs: 60_000, max: 10 }); // codes cannot be guessed by trying`.

```ts
/** My invite code and link, points, invites, gift codes. */
app.get('/api/referral', async (req) => {
  const userId = await siteUser(req);
  const s = await referralSummary(userId);
  return { ...s, link: `${publicOrigin(requestOrigin(req.headers, req.protocol))}/?ref=${s.code}` };
});

/** Use an invite, promo or gift code. */
app.post<{ Body: { code?: unknown } }>('/api/redeem', async (req, reply) => {
  const userId = await siteUser(req);
  if (!redeemLimit(req.ip)) throw tooMany(); // existing helper: 429, code 'rateLimited' (already translated)
  const r = await redeem(userId, typeof req.body?.code === 'string' ? req.body.code : '');
  if (!r.ok) return reply.code(400).send({ error: r.code, code: r.code, params: {} });
  return { kind: r.kind, days: r.days, pending: r.pending, founder: r.founder };
});

/** Points → Premium for me, or a gift code. */
app.post('/api/points/spend', async (req, reply) => {
  const userId = await siteUser(req);
  const s = parseSpend(req.body);
  if (!s) return reply.code(400).send({ error: 'invalid spend' });
  const r = await spendPoints(userId, s.days, s.gift);
  if (!r.ok) return reply.code(400).send({ error: r.code, code: r.code, params: {} });
  return 'giftCode' in r ? { giftCode: r.giftCode } : { premiumUntil: r.premiumUntil };
});
```
The IP key is `req.ip`, the same as `proofLimit`. `publicOrigin(requestOrigin(...))` is the same pattern as the extension zip route (`server/index.ts:454`).

Onboarding: the survey answer is saved first, and a bad code never blocks it:
```ts
app.put<{ Body: Record<string, unknown> }>('/api/me/onboarding', async (req, reply) => {
  const userId = await siteUser(req);
  const answer = parseOnboarding(req.body);
  if (!answer) return reply.code(400).send({ error: 'invalid answer' });
  await saveOnboarding(userId, answer);
  const raw = req.body?.code;
  if (typeof raw !== 'string' || !raw.trim() || !redeemLimit(req.ip)) return { ok: true };
  const r = await redeem(userId, raw);
  return { ok: true, redeem: r.ok ? { kind: r.kind, days: r.days, pending: r.pending, founder: r.founder } : { error: r.code } };
});
```

- [ ] **Step 3: `docs/api.md`**

Add a "Referrals" section with the 3 endpoints, the onboarding `code` field, the error codes (`codeUnknown`, `codeDisabled`, `codeExpired`, `codeFull`, `codeOwn`, `inviteUsed`, `codeUsed`, `pointsLow`, `pointsLifetime`, plus the existing `rateLimited`), and `plan.founder` in `/api/me`. Say that the invite reward fires on the `/api/hello` link.

- [ ] **Step 4: Manual check against the local DB**

Run `npm run dev` (keep it running). With two signed-in browser profiles A and B (Clerk dev), or with curl using their bearer tokens from devtools:
1. A: `GET /api/referral` → note `code`, `points: 0`.
2. B: `POST /api/redeem {code: A's code}` → `pending: true` if B has no persona, otherwise `pending: false`.
3. B again with A's code → 400 `codeUsed`. B with A's code typed lowercase with a dash → the same `codeUsed`, which proves normalising works.
4. A with A's code → 400 `codeOwn`.
5. Link an EA persona for B, or, if B already has one, step 2 already granted it: A's `points` is 1, and B's `/api/me` `plan.premiumUntil` is about now+7d (or `founder: true`).
6. 11 quick redeems → the 11th is 429.
Then `npm run typecheck`.

- [ ] **Step 5: Commit**

```bash
git add server/index.ts server/plans.ts docs/api.md
git commit -m "feat(referrals): redeem, points and referral endpoints, invite grant on link"
```

---

### Task 5: Admin codes API + referral info on user detail

**Files:**
- Create: `server/admin/codes.ts`
- Modify: `server/admin/routes.ts`, `server/admin/users.ts:109-129` (`userDetail`), `web/src/api.ts` (admin types), `docs/api.md`

**Interfaces:**
- Consumes: `parsePromo`, `generateCode` (Task 1); tables (Task 2).
- Produces:
  - `GET /api/admin/codes?page=&kind=promo|gift` → `Paged<AdminCodeRow>`, where `AdminCodeRow = { code, kind, ownerEmail: string | null, days: number | null, maxUses: number | null, uses: number, expiresAt: number | null, disabled: boolean, note: string, createdAt: number }`
  - `POST /api/admin/codes` body from `parsePromo` → `AdminCodeRow` | 400 `{ code: 'codeTaken' | 'invalid' }`
  - `PATCH /api/admin/codes/:code { disabled: boolean }` → `{ ok: true }`
  - `GET /api/admin/codes/:code` → `{ code: AdminCodeRow; uses: { userId, email, status, at }[] }`
  - `userDetail(...)` gains `referral: { points: number; invitedBy: { id: string; email: string } | null; invited: number; inviteCode: string | null }`

- [ ] **Step 1: `server/admin/codes.ts`**

```ts
// Admin: promo codes (created here) and gift codes (bought by users), with who used them.
import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { codes, pointLedger, redemptions, users } from '../db/schema.js';
import { generateCode, type parsePromo } from '../referrals.js';
import { PAGE_SIZE } from './query.js';

const row = (c: typeof codes.$inferSelect, ownerEmail: string | null) => ({
  code: c.code, kind: c.kind, ownerEmail, days: c.days, maxUses: c.maxUses, uses: c.uses,
  expiresAt: c.expiresAt?.getTime() ?? null, disabled: c.disabled, note: c.note, createdAt: c.createdAt.getTime(),
});
export type AdminCodeRow = ReturnType<typeof row>;

export async function listCodes(kind: 'promo' | 'gift', page: number) {
  const where = eq(codes.kind, kind);
  const [{ n }] = await db.select({ n: count() }).from(codes).where(where);
  const rows = await db.select({ c: codes, email: users.email }).from(codes).leftJoin(users, eq(users.id, codes.ownerId))
    .where(where).orderBy(desc(codes.createdAt)).limit(PAGE_SIZE).offset((page - 1) * PAGE_SIZE);
  return { rows: rows.map((r) => row(r.c, r.email)), total: n, page, pageSize: PAGE_SIZE };
}

export async function createPromo(p: NonNullable<ReturnType<typeof parsePromo>>): Promise<AdminCodeRow | 'codeTaken'> {
  const code = p.code ?? generateCode(8);
  const [c] = await db.insert(codes).values({ code, kind: 'promo', days: p.days, maxUses: p.maxUses, expiresAt: p.expiresAt, note: p.note })
    .onConflictDoNothing().returning();
  return c ? row(c, null) : 'codeTaken';
}

export async function setDisabled(code: string, disabled: boolean): Promise<boolean> {
  return (await db.update(codes).set({ disabled }).where(eq(codes.code, code)).returning({ c: codes.code })).length > 0;
}

export async function codeDetail(code: string) {
  const [c] = await db.select({ c: codes, email: users.email }).from(codes).leftJoin(users, eq(users.id, codes.ownerId)).where(eq(codes.code, code));
  if (!c) return null;
  const uses = await db.select({ userId: redemptions.userId, email: users.email, status: redemptions.status, at: redemptions.at })
    .from(redemptions).leftJoin(users, eq(users.id, redemptions.userId)).where(eq(redemptions.code, code)).orderBy(desc(redemptions.at));
  return { code: row(c.c, c.email), uses: uses.map((u) => ({ ...u, email: u.email ?? '', at: u.at.getTime() })) };
}

/** Points, inviter and invite count for the admin user screen. */
export async function referralOf(userId: string, invitedBy: string | null) {
  const [p] = await db.select({ n: sql<number>`coalesce(sum(${pointLedger.delta}),0)::int` }).from(pointLedger).where(eq(pointLedger.userId, userId));
  const [inv] = await db.select({ code: codes.code }).from(codes).where(and(eq(codes.ownerId, userId), eq(codes.kind, 'invite')));
  const [{ n }] = inv ? await db.select({ n: count() }).from(redemptions).where(and(eq(redemptions.code, inv.code), eq(redemptions.status, 'granted'))) : [{ n: 0 }];
  const [by] = invitedBy ? await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, invitedBy)) : [];
  return { points: p?.n ?? 0, invitedBy: by ?? null, invited: n, inviteCode: inv?.code ?? null };
}
```

- [ ] **Step 2: Routes in `server/admin/routes.ts`** (same `requireAdmin` pattern as the existing ones)

```ts
  app.get<Q>('/api/admin/codes', async (req) => {
    await requireAdmin(req);
    return listCodes(req.query.kind === 'gift' ? 'gift' : 'promo', parsePage(req.query.page));
  });
  app.post('/api/admin/codes', async (req, reply) => {
    await requireAdmin(req);
    const p = parsePromo(req.body);
    if (!p) return reply.code(400).send({ error: 'invalid code', code: 'invalid', params: {} });
    const r = await createPromo(p);
    return r === 'codeTaken' ? reply.code(400).send({ error: 'code taken', code: 'codeTaken', params: {} }) : r;
  });
  app.patch<{ Params: { code: string }; Body: { disabled?: unknown } }>('/api/admin/codes/:code', async (req, reply) => {
    await requireAdmin(req);
    if (typeof req.body?.disabled !== 'boolean') return reply.code(400).send({ error: 'invalid' });
    return (await setDisabled(req.params.code, req.body.disabled)) ? { ok: true } : reply.code(404).send({ error: 'unknown code' });
  });
  app.get<{ Params: { code: string } }>('/api/admin/codes/:code', async (req, reply) => {
    await requireAdmin(req);
    return (await codeDetail(req.params.code)) ?? reply.code(404).send({ error: 'unknown code' });
  });
```
In `userDetail`, add `referral: await referralOf(u.id, u.invitedBy),` to the returned object.

- [ ] **Step 3: Web types + helpers in `web/src/api.ts`**

```ts
export interface AdminCodeRow { code: string; kind: 'promo' | 'gift'; ownerEmail: string | null; days: number | null; maxUses: number | null; uses: number; expiresAt: number | null; disabled: boolean; note: string; createdAt: number }
```
Add to `api`:
```ts
  adminCodes: (kind: 'promo' | 'gift', page: number) => req<Paged<AdminCodeRow>>(`/api/admin/codes?kind=${kind}&page=${page}`),
  adminCreateCode: (b: { code?: string; days: number | null; maxUses?: number | null; expiresAt?: string | null; note?: string }) =>
    req<AdminCodeRow>('/api/admin/codes', { method: 'POST', body: b }),
  adminSetCodeDisabled: (code: string, disabled: boolean) => req<{ ok: true }>(`/api/admin/codes/${encodeURIComponent(code)}`, { method: 'PATCH', body: { disabled } }),
  adminCode: (code: string) => req<{ code: AdminCodeRow; uses: { userId: string; email: string; status: string; at: number }[] }>(`/api/admin/codes/${encodeURIComponent(code)}`),
```
Extend the web `AdminUserDetail` type (wherever `userDetail`'s shape is mirrored; grep `latestExtension` in `web/src/api.ts`) with the `referral` field.

- [ ] **Step 4: Docs + check**

Add the admin endpoints to `docs/api.md`. Run `npm run typecheck`. Then, signed in as admin: `curl -X POST /api/admin/codes -d '{"days":30,"maxUses":2}'` (with the bearer token) → a row with an 8-character code. Redeem it as 2 users → OK, the 3rd → `codeFull`. PATCH `disabled:true` → redeem gives `codeDisabled`.

- [ ] **Step 5: Commit**

```bash
git add server/admin docs/api.md web/src/api.ts
git commit -m "feat(admin): promo and gift codes API, referral info on user detail"
```

---

### Task 6: Web plumbing: `?ref=` capture + api helpers

**Files:**
- Create: `web/src/ref.ts`, `web/src/ref.test.ts`
- Modify: `web/src/api.ts`, `web/src/main.tsx`

**Interfaces:**
- Produces (used by Tasks 7, 8):
  - `REF_KEY = 'sbc-ref'`, `refFromUrl(search: string): string | null`, `shouldOfferRef(ref: string | null, s: { usedInvite: boolean; ownCode: string }): boolean`, `readRef(): string | null`, `saveRef(code: string): void`, `clearRef(): void`
  - `api.referral()`, `api.redeem(code)`, `api.spendPoints(days, gift)`, `api.onboarding(a & { code?: string })`
  - types `ReferralInfo`, `RedeemResult = { kind: 'invite' | 'promo' | 'gift'; days: number | null; pending: boolean; founder: boolean }`

- [ ] **Step 1: Failing test `web/src/ref.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refFromUrl, shouldOfferRef } from './ref.js';

test('refFromUrl', () => {
  assert.equal(refFromUrl('?ref=k7m2qx'), 'K7M2QX');
  assert.equal(refFromUrl('?utm=x&ref=K7M2-QX'), 'K7M2QX');
  assert.equal(refFromUrl('?ref=<script>'), null);
  assert.equal(refFromUrl(''), null);
});

test('shouldOfferRef', () => {
  assert.equal(shouldOfferRef('K7M2QX', { usedInvite: false, ownCode: 'AAAAAA' }), true);
  assert.equal(shouldOfferRef('K7M2QX', { usedInvite: true, ownCode: 'AAAAAA' }), false); // already used one
  assert.equal(shouldOfferRef('K7M2QX', { usedInvite: false, ownCode: 'K7M2QX' }), false); // own link
  assert.equal(shouldOfferRef(null, { usedInvite: false, ownCode: 'AAAAAA' }), false);
});
```
Run: `node --import tsx --test web/src/ref.test.ts`. Expected: FAIL (module missing).

- [ ] **Step 2: `web/src/ref.ts`**

```ts
// An invite link (/?ref=CODE): the code is kept until the signed-in user applies or dismisses it.
export const REF_KEY = 'sbc-ref';

export function refFromUrl(search: string): string | null {
  const raw = new URLSearchParams(search).get('ref');
  if (!raw) return null;
  const c = raw.toUpperCase().replace(/[\s-]/g, '');
  return /^[A-Z0-9]{4,20}$/.test(c) ? c : null;
}

export const shouldOfferRef = (ref: string | null, s: { usedInvite: boolean; ownCode: string }) => !!ref && !s.usedInvite && ref !== s.ownCode;

export function readRef(): string | null {
  try { return localStorage.getItem(REF_KEY); } catch { return null; }
}
export function saveRef(code: string) {
  try { localStorage.setItem(REF_KEY, code); } catch { /* private mode: the link just does not prefill */ }
}
export function clearRef() {
  try { localStorage.removeItem(REF_KEY); } catch { /* same */ }
}
```
In `web/src/main.tsx`, before `createRoot(...)`:
```ts
import { refFromUrl, saveRef } from './ref';
const ref = refFromUrl(location.search);
if (ref) saveRef(ref);
```
Run the test again. Expected: PASS.

- [ ] **Step 3: api helpers in `web/src/api.ts`**

```ts
export interface ReferralInfo {
  code: string; link: string; points: number; invited: number; pendingInvites: number; usedInvite: boolean;
  gifts: { code: string; days: number; usedAt: number | null }[];
  ledger: { delta: number; reason: string; at: number }[];
}
export type RedeemResult = { kind: 'invite' | 'promo' | 'gift'; days: number | null; pending: boolean; founder: boolean };
```
Change `onboarding` and add helpers:
```ts
  onboarding: (a: ({ heardFrom: HeardFrom; futYears: FutYears } | { skip: true }) & { code?: string }) =>
    req<{ ok: true; redeem?: RedeemResult | { error: string } }>('/api/me/onboarding', { method: 'PUT', body: a }),
  referral: () => req<ReferralInfo>('/api/referral'),
  redeem: (code: string) => req<RedeemResult>('/api/redeem', { method: 'POST', body: { code } }),
  spendPoints: (days: 7 | 14 | 30, gift: boolean) =>
    req<{ premiumUntil: number | null } | { giftCode: string }>('/api/points/spend', { method: 'POST', body: { days, gift } }),
```

- [ ] **Step 4: Typecheck + test, commit**

Run: `npm run typecheck && npm test`. Expected: clean / PASS.
```bash
git add web/src/ref.ts web/src/ref.test.ts web/src/main.tsx web/src/api.ts
git commit -m "feat(referrals): capture invite links and web api helpers"
```

---

### Task 7: CodeInput + onboarding field + ref banner

**Files:**
- Create: `web/src/components/CodeInput.tsx`
- Modify: `web/src/components/OnboardingModal.tsx`, `web/src/App.tsx` (onboarding render + banner), `web/src/styles.css`, `web/src/locales/{en,ro,it}.ts`

**Interfaces:**
- Consumes: `api.redeem`, `RedeemResult`, `readRef/clearRef/shouldOfferRef` (Task 6), `api.founders()` if it exists in `api.ts` (grep `founders`), otherwise `fetch('/api/founders')`.
- Produces: `<CodeInput initial?: string; onRedeemed?: (r: RedeemResult) => void />` and `redeemText(r: RedeemResult, t, foundersLeft: number | null): string` (exported from `CodeInput.tsx`, reused by Task 8).

- [ ] **Step 1: i18n keys** (en shown; ro and it below)

```ts
  'code.label': 'Invite or promo code',
  'code.placeholder': 'e.g. K7M2QX',
  'code.apply': 'Apply',
  'code.invitePending': '+7 days of Premium once you link your EA account.',
  'code.invitePendingFounders': '+7 days of Premium once you link your EA account, or Premium for life if you are among the first {limit} ({left} spots left).',
  'code.days_one': '+{count} day of Premium added.',
  'code.days_other': '+{count} days of Premium added.',
  'code.lifetime': 'Premium for life unlocked.',
  'code.founder': "You're one of the first 50: Premium for life (Founder).",
  'code.bannerTitle': 'You have an invite code',
  'code.bannerBody': 'Apply {code} and get 7 days of Premium.',
  'code.dismiss': 'Dismiss',
  'err.codeUnknown': 'That code does not exist.',
  'err.codeDisabled': 'That code is no longer active.',
  'err.codeExpired': 'That code has expired.',
  'err.codeFull': 'That code has been used up.',
  'err.codeOwn': "You can't use your own code.",
  'err.inviteUsed': 'You have already used an invite code.',
  'err.codeUsed': 'You have already used this code.',
```
ro:
```ts
  'code.label': 'Cod de invitație sau promo',
  'code.placeholder': 'ex. K7M2QX',
  'code.apply': 'Aplică',
  'code.invitePending': '+7 zile de Premium după ce îți legi contul EA.',
  'code.invitePendingFounders': '+7 zile de Premium după ce îți legi contul EA, sau Premium pe viață dacă ești printre primii {limit} (mai sunt {left} locuri).',
  'code.days_one': '+{count} zi de Premium adăugată.',
  'code.days_few': '+{count} zile de Premium adăugate.',
  'code.days_other': '+{count} de zile de Premium adăugate.',
  'code.lifetime': 'Ai Premium pe viață.',
  'code.founder': 'Ești printre primii 50: Premium pe viață (Founder).',
  'code.bannerTitle': 'Ai un cod de invitație',
  'code.bannerBody': 'Aplică {code} și primești 7 zile de Premium.',
  'code.dismiss': 'Ascunde',
  'err.codeUnknown': 'Codul nu există.',
  'err.codeDisabled': 'Codul nu mai e activ.',
  'err.codeExpired': 'Codul a expirat.',
  'err.codeFull': 'Codul a fost folosit de prea multe ori.',
  'err.codeOwn': 'Nu poți folosi propriul cod.',
  'err.inviteUsed': 'Ai folosit deja un cod de invitație.',
  'err.codeUsed': 'Ai folosit deja acest cod.',
```
it:
```ts
  'code.label': 'Codice invito o promo',
  'code.placeholder': 'es. K7M2QX',
  'code.apply': 'Applica',
  'code.invitePending': '+7 giorni di Premium quando colleghi il tuo account EA.',
  'code.invitePendingFounders': '+7 giorni di Premium quando colleghi il tuo account EA, o Premium a vita se sei tra i primi {limit} (restano {left} posti).',
  'code.days_one': '+{count} giorno di Premium aggiunto.',
  'code.days_other': '+{count} giorni di Premium aggiunti.',
  'code.lifetime': 'Premium a vita sbloccato.',
  'code.founder': 'Sei tra i primi 50: Premium a vita (Founder).',
  'code.bannerTitle': 'Hai un codice invito',
  'code.bannerBody': 'Applica {code} e ricevi 7 giorni di Premium.',
  'code.dismiss': 'Nascondi',
  'err.codeUnknown': 'Questo codice non esiste.',
  'err.codeDisabled': 'Questo codice non è più attivo.',
  'err.codeExpired': 'Questo codice è scaduto.',
  'err.codeFull': 'Questo codice è esaurito.',
  'err.codeOwn': 'Non puoi usare il tuo codice.',
  'err.inviteUsed': 'Hai già usato un codice invito.',
  'err.codeUsed': 'Hai già usato questo codice.',
```

- [ ] **Step 2: `web/src/components/CodeInput.tsx`**

```tsx
// One field for every kind of code (invite, promo, gift): the server tells which it was.
import { useState } from 'react';
import { CheckCircle, WarningCircle } from '@phosphor-icons/react';
import { api, type RedeemResult } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../messages';

type T = ReturnType<typeof useI18n>['t'];

/** What a redeemed code gave; a founder always reads as lifetime, never as days. */
export function redeemText(r: RedeemResult, t: T, founders: { limit: number; left: number } | null): string {
  if (r.founder) return t('code.founder');
  if (r.kind === 'invite' && r.pending)
    return founders && founders.left > 0 ? t('code.invitePendingFounders', { limit: founders.limit, left: founders.left }) : t('code.invitePending');
  return r.days === null ? t('code.lifetime') : t('code.days', { count: r.days });
}

export function CodeInput({ initial = '', onRedeemed, founders }: { initial?: string; onRedeemed?: (r: RedeemResult) => void; founders: { limit: number; left: number } | null }) {
  const { t } = useI18n();
  const [code, setCode] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = async () => {
    setBusy(true);
    try {
      const r = await api.redeem(code);
      setMsg({ ok: true, text: redeemText(r, t, founders) });
      onRedeemed?.(r);
    } catch (e) {
      setMsg({ ok: false, text: errorText(e, t) });
    }
    setBusy(false);
  };

  return (
    <form className="code-input" onSubmit={(e) => { e.preventDefault(); if (code.trim()) void apply(); }}>
      <label>
        <span>{t('code.label')}</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('code.placeholder')} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={24} />
      </label>
      <button type="submit" className="ghost" disabled={busy || !code.trim()}>{t('code.apply')}</button>
      {msg && (
        <p className={`code-msg ${msg.ok ? 'ok' : 'bad'}`} role="status">
          {msg.ok ? <CheckCircle weight="fill" aria-hidden /> : <WarningCircle weight="fill" aria-hidden />} {msg.text}
        </p>
      )}
    </form>
  );
}
```
Look for an existing founders fetch: grep `founders` in `web/src/api.ts` and `web/src/landing`. If `api.founders` is missing, add `founders: () => req<{ limit: number; taken: number; left: number }>('/api/founders')`.

- [ ] **Step 3: Onboarding field**

In `OnboardingModal.tsx`, take a new prop `founders` and keep a `code` state initialised from `readRef() ?? ''`. Render below the two groups:
```tsx
      <label className="onb-code">
        <span>{t('code.label')}</span>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t('code.placeholder')} autoCapitalize="characters" autoComplete="off" spellCheck={false} maxLength={24} />
      </label>
      {result && <p className={`code-msg ${result.ok ? 'ok' : 'bad'}`} role="status">{result.text}</p>}
```
Change `send` so the code goes with the answer (with a skip too: the code still counts). When the response has a `redeem`, show its text and keep the dialog open, with the submit button turned into "Continue" until the user closes it. Clear `sbc-ref` once a code was sent:
```ts
  const send = async (a: { heardFrom: HeardFrom; futYears: FutYears } | { skip: true }) => {
    setBusy(true);
    const c = code.trim();
    const res = await api.onboarding(c ? { ...a, code: c } : a).catch(() => null);
    setBusy(false);
    if (c) clearRef();
    const r = res?.redeem;
    if (r && 'error' in r) return setResult({ ok: false, text: t(`err.${r.error}`) }), setDone(true);
    if (r) return setResult({ ok: true, text: redeemText(r, t, founders) }), setDone(true);
    onDone();
  };
```
(`done` true → the action row shows a single "Continue" button that calls `onDone`.) Pass `founders` from `App.tsx`, and reuse an existing founders state if `App.tsx` has one.

- [ ] **Step 4: Ref banner in `App.tsx`**

After `me` and the onboarding state load: if onboarding is done, fetch `api.referral()` once (lazily, only when `readRef()` is non-null). When `shouldOfferRef(readRef(), { usedInvite, ownCode: code })`, show a dismissible banner above the main content (reuse the `UpdateBanner` styling class) with `t('code.bannerTitle')`, `t('code.bannerBody', { code })`, a primary "Apply" button (→ `api.redeem`, then show `redeemText`, `clearRef()`, `loadMe()`), and "Dismiss" (→ `clearRef()`). When `shouldOfferRef` is false, call `clearRef()`.

- [ ] **Step 5: Styles**

In `web/src/styles.css`, next to the `.onb` rules:
```css
.code-input { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; }
.code-input label, .onb-code { display: grid; gap: 4px; flex: 1 1 180px; }
.code-input input, .onb-code input { font-family: inherit; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 8px; }
.code-msg { flex-basis: 100%; display: flex; gap: 6px; align-items: center; margin: 0; }
.code-msg.ok svg { color: var(--go); }
.code-msg.bad svg { color: var(--bad, oklch(0.7 0.17 25)); }
```
Copy the input colours and padding from the existing form inputs (grep `input[type=` in `styles.css`) so it matches. State is shown by icon + text, never by colour alone.

- [ ] **Step 6: Verify + commit**

Run: `npm run i18n:check && npm run typecheck && npm test`. Browser (dev server): open `http://localhost:5173/?ref=<A's code>` signed out → sign in as a new user → onboarding prefilled → submit → the result text shows. At 390px the field wraps cleanly. An existing user opening `/?ref=` sees the banner once.
```bash
git add web/src
git commit -m "feat(referrals): code field in onboarding, invite link banner"
```

---

### Task 8: Invite friends card, Founder badge, reward notice

**Files:**
- Create: `web/src/components/InviteCard.tsx`
- Modify: `web/src/App.tsx` (Settings `settings-side` ~line 905, `AccountMenu` props ~684, `onLinked` ~228), `web/src/components/PlanCard.tsx`, `web/src/components/AccountMenu.tsx`, `web/src/styles.css`, locales

**Interfaces:**
- Consumes: `api.referral`, `api.spendPoints`, `CodeInput`, `redeemText` (Task 7), `PlanInfo.founder` (Task 3).
- Produces: `<InviteCard plan={PlanInfo} founders={...} onPlanChange={() => void} />`

- [ ] **Step 1: i18n keys** (en; write ro + it the same way, with Romanian `_one/_few/_other` for `invite.points` and `invite.invited`)

```ts
  'invite.title': 'Invite friends',
  'invite.lede': 'A friend who joins with your link gets 7 days of Premium. You get 1 point when they link their EA account.',
  'invite.yourCode': 'Your code',
  'invite.copy': 'Copy link',
  'invite.copied': 'Copied',
  'invite.share': 'Share',
  'invite.shareText': 'Find the cheapest SBC solutions from your own club. Join FC Solver with my code {code} and get 7 days of Premium:',
  'invite.points_one': '{count} point',
  'invite.points_other': '{count} points',
  'invite.invited_one': '{count} friend joined',
  'invite.invited_other': '{count} friends joined',
  'invite.pending_one': '{count} waiting to link EA',
  'invite.pending_other': '{count} waiting to link EA',
  'invite.exchange': 'Use your points',
  'invite.option': '{days} days · {price} points',
  'invite.forMe': 'For me',
  'invite.gift': 'Gift code',
  'invite.lifetimeNote': 'You have Premium for life, so your points become gift codes for friends.',
  'invite.giftMade': 'Gift code {code} for {days} days. Send it to a friend.',
  'invite.gifts': 'Your gift codes',
  'invite.giftUsed': 'used',
  'invite.giftFree': 'not used yet',
  'invite.haveCode': 'Have a code?',
  'err.pointsLow': 'Not enough points.',
  'err.pointsLifetime': 'You have Premium for life. Make a gift code instead.',
  'plan.lifetime': 'Premium for life',
  'plan.founder': 'Founder',
  'notice.founder': "Your EA account is linked and you're one of the first 50: Premium for life (Founder).",
  'notice.invite': 'Your EA account is linked: 7 days of Premium added.',
```

- [ ] **Step 2: `InviteCard.tsx`**

```tsx
// Settings: my invite code + link, points, and spending them on Premium or a gift code.
import { useEffect, useState } from 'react';
import { Copy, Gift, ShareNetwork } from '@phosphor-icons/react';
import { api, type PlanInfo, type ReferralInfo } from '../api';
import { useI18n } from '../i18n';
import { errorText } from '../messages';
import { CodeInput } from './CodeInput';

const OPTIONS = [{ days: 7, price: 2 }, { days: 14, price: 3 }, { days: 30, price: 5 }] as const;

export function InviteCard({ plan, founders, onPlanChange }: { plan: PlanInfo; founders: { limit: number; left: number } | null; onPlanChange: () => void }) {
  const { t } = useI18n();
  const [info, setInfo] = useState<ReferralInfo | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const lifetime = plan.tier === 'premium' && plan.premiumUntil === null;

  const load = () => api.referral().then(setInfo, () => {});
  useEffect(() => void load(), []);
  if (!info) return null;

  const copy = async () => {
    try { await navigator.clipboard.writeText(info.link); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard: the link is visible to select */ }
  };
  const share = () => void navigator.share?.({ text: t('invite.shareText', { code: info.code }), url: info.link }).catch(() => {});
  const spend = async (days: 7 | 14 | 30, gift: boolean) => {
    setBusy(true);
    try {
      const r = await api.spendPoints(days, gift);
      setMsg('giftCode' in r ? t('invite.giftMade', { code: r.giftCode, days }) : t('code.days', { count: days }));
      await load();
      onPlanChange();
    } catch (e) {
      setMsg(errorText(e, t));
    }
    setBusy(false);
  };

  return (
    <section className="settings-card invite-card">
      <h2><Gift weight="fill" aria-hidden /> {t('invite.title')}</h2>
      <p className="muted">{t('invite.lede')}</p>
      <div className="invite-code">
        <span className="muted">{t('invite.yourCode')}</span>
        <b className="code-chip">{info.code}</b>
        <button type="button" className="ghost" onClick={copy}><Copy aria-hidden /> {copied ? t('invite.copied') : t('invite.copy')}</button>
        {'share' in navigator && <button type="button" className="ghost" onClick={share}><ShareNetwork aria-hidden /> {t('invite.share')}</button>}
      </div>
      <p className="invite-stats">
        <b>{t('invite.points', { count: info.points })}</b> · {t('invite.invited', { count: info.invited })}
        {info.pendingInvites > 0 && <> · {t('invite.pending', { count: info.pendingInvites })}</>}
      </p>
      <h3>{t('invite.exchange')}</h3>
      {lifetime && <p className="muted">{t('invite.lifetimeNote')}</p>}
      <ul className="invite-options">
        {OPTIONS.map((o) => (
          <li key={o.days}>
            <span>{t('invite.option', { days: o.days, price: o.price })}</span>
            {!lifetime && <button type="button" className="ghost" disabled={busy || info.points < o.price} onClick={() => void spend(o.days, false)}>{t('invite.forMe')}</button>}
            <button type="button" className="ghost" disabled={busy || info.points < o.price} onClick={() => void spend(o.days, true)}>{t('invite.gift')}</button>
          </li>
        ))}
      </ul>
      {msg && <p role="status">{msg}</p>}
      {info.gifts.length > 0 && (
        <>
          <h3>{t('invite.gifts')}</h3>
          <ul className="invite-gifts">
            {info.gifts.map((g) => (
              <li key={g.code}><b className="code-chip">{g.code}</b> {g.days}d · {g.usedAt ? t('invite.giftUsed') : t('invite.giftFree')}</li>
            ))}
          </ul>
        </>
      )}
      <h3>{t('invite.haveCode')}</h3>
      <CodeInput founders={founders} onRedeemed={() => { void load(); onPlanChange(); }} />
    </section>
  );
}
```
Use `t('invite.giftMade', ...)` and add `_one/_other` only where `count` is used. Check `invite.option` reads well in ro ("{days} zile · {price} puncte"). Since `price` is always 2, 3 or 5, the `_few` form in Romanian is fine without plural keys.

- [ ] **Step 3: Wire it in `App.tsx`**

In `settings-side`, right after `<PlanCard .../>`:
```tsx
                {effectivePlan && <InviteCard plan={effectivePlan} founders={founders} onPlanChange={() => void loadMe()} />}
```

- [ ] **Step 4: Founder in PlanCard + AccountMenu**

`PlanCard.tsx`, in the `<h2>`:
```tsx
        {plan.tier === 'premium' && <Crown weight="fill" aria-hidden="true" />}{' '}
        {plan.tier === 'premium' ? (plan.premiumUntil === null ? t('plan.lifetime') : t('plan.premium')) : t('plan.free')}
        {plan.founder && <span className="founder-badge">{t('plan.founder')}</span>}
```
`AccountMenu.tsx`: add a prop `founder: boolean` and render `<span className="founder-badge">{t('plan.founder')}</span>` next to the email inside the popover. Pass `founder={!!effectivePlan?.founder}` from `App.tsx`. Use the real plan variable; grep `effectivePlan` near the AccountMenu render.
CSS:
```css
.founder-badge { display: inline-flex; align-items: center; margin-inline-start: 8px; padding: 2px 8px; border-radius: 8px; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; border: 1px solid currentColor; color: var(--gold, oklch(0.82 0.12 85)); }
.invite-code { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.code-chip { font-family: 'Barlow Condensed', sans-serif; letter-spacing: 0.12em; padding: 2px 8px; border-radius: 8px; background: var(--surface-2); }
.invite-options { list-style: none; padding: 0; display: grid; gap: 8px; }
.invite-options li { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; justify-content: space-between; }
.invite-gifts { list-style: none; padding: 0; display: grid; gap: 4px; }
```
Use real token names from `:root` in `styles.css` (grep `--surface`, and pick a gold or yellow token that is not `--pos`). Check AA contrast.

- [ ] **Step 5: Reward notice after linking**

In `App.tsx`, keep `const prevPlan = useRef<PlanInfo | null>(null)`. When `loadMe` sets a new plan and a previous one exists: if `!prev.founder && next.founder`, show the notice `t('notice.founder')`. Otherwise, if the previous plan was not Premium-for-days and `next.premiumUntil` grew by about 7 days within a minute of an `onLinked` call, show `t('notice.invite')`. Keep this simple: set a `justLinked` ref in `onLinked`, and decide in the next `loadMe`. Reuse the existing notice/toast component; if none exists, use the `UpdateBanner` styling and a dismiss button.

- [ ] **Step 6: Verify + commit**

`npm run i18n:check && npm run typecheck && npm test && npm run build`. In the browser, Settings at desktop and 390px: the card shows the code, copy works, spend with 0 points gives disabled buttons. Give user A 5 points through SQL: `insert into point_ledger (user_id, delta, reason) values ('<A>', 5, 'admin')`. Then "30 days → For me" → PlanCard date moves +30d and points 0. Again with 2 points → "Gift code" → code listed → redeem it as B → B +7d, and A's list says "used". A founder user sees "Premium for life" + the Founder badge and no "For me" buttons.
```bash
git add web/src
git commit -m "feat(referrals): invite friends card, founder badge, link reward notice"
```

---

### Task 9: Admin Codes tab + user detail referral block

**Files:**
- Create: `web/src/components/admin/CodesTable.tsx`
- Modify: `web/src/route.ts` (`AdminPage`, `ADMIN_TABS`, parse/path for `/dashboard/admin/codes`), `web/src/route.test.ts`, `web/src/App.tsx` (admin page switch), `web/src/components/admin/UserDetail.tsx`, locales

**Interfaces:**
- Consumes: `api.adminCodes/adminCreateCode/adminSetCodeDisabled/adminCode` (Task 5), `DataTable`.

- [ ] **Step 1: Route test first** (`web/src/route.test.ts`, matching the file's existing style)

```ts
test('admin codes route', () => {
  assert.deepEqual(parseRoute('/dashboard/admin/codes', ''), adminRoute('codes'));
  assert.equal(routePath(adminRoute('codes')), '/dashboard/admin/codes');
});
```
(Use the real parse function name from `route.ts`.) Run `npm test`. Expected: FAIL. Then add `'codes'` to `AdminPage`, add `{ page: 'codes', key: 'admin.tab.codes' }` to `ADMIN_TABS`, and add `if (y === 'codes') return adminRoute('codes');` in the admin parse branch. Run again: PASS.

- [ ] **Step 2: `CodesTable.tsx`**

Copy the structure of `UsersTable.tsx` (load with `useLoad`, render `DataTable`, `Pager`). Columns: code, kind, days (`∞` + `t('admin.codes.lifetime')` for null), uses / maxUses, expires, owner email (gift), note, active toggle (a button calling `adminSetCodeDisabled`, label `t('admin.codes.disable')` / `t('admin.codes.enable')`). Put a `promo | gift` segmented switch above it. Add a create form (a `<details>` with `<summary>{t('admin.codes.new')}</summary>`) with fields: code (optional), days (number, plus a "lifetime" checkbox that sends `null`), max uses (optional), expires (date input → ISO), note; submit → `adminCreateCode`, then reload; errors through `errorText` (`err.codeTaken`, `err.invalid`). Clicking a row expands the `adminCode(code).uses` list (email, status, date).

Keys (en + ro + it): `admin.tab.codes`, `admin.codes.new`, `admin.codes.code`, `admin.codes.kind`, `admin.codes.days`, `admin.codes.lifetime`, `admin.codes.uses`, `admin.codes.expires`, `admin.codes.owner`, `admin.codes.note`, `admin.codes.disable`, `admin.codes.enable`, `admin.codes.create`, `admin.codes.promo`, `admin.codes.gift`, `admin.codes.usedBy`, `admin.codes.pending`, `admin.codes.granted`, `err.codeTaken` ("That code already exists."), `err.invalid` ("Check the fields."). Admin text is translated too (the panel already uses `t()`).

- [ ] **Step 3: Admin page switch + UserDetail**

In `App.tsx`, where the admin page renders `UsersTable` / `AccountsTable`, add `page === 'codes' && <CodesTable />`. In `UserDetail.tsx`, add a small block: `t('admin.user.points')`: n · `t('admin.user.invitedBy')`: email link (→ `adminRoute('user', { userId })`) or "—" · `t('admin.user.invited')`: n · invite code.

- [ ] **Step 4: Verify + commit**

`npm run i18n:check && npm run typecheck && npm test && npm run build`. In the browser as admin: create a promo (30 days, max 2), see it listed, disable and enable it, open its users list after redeeming. At 390px the table scrolls inside its container, not the page.
```bash
git add web/src
git commit -m "feat(admin): codes tab and referral info on user detail"
```

---

### Task 10: Landing FAQ line, PlanCard line, docs wrap-up

**Files:**
- Modify: `web/src/landing/*` (FAQ list: grep `faq` in `web/src/landing`), `web/src/components/PlanCard.tsx`, locales, `docs/architecture.md` (one paragraph), `CLAUDE.md` (Layout line: `referrals.ts`, `db/referrals.ts`, `admin/codes.ts`)

- [ ] **Step 1: Copy**

FAQ item, en: Q `'landing.faq.invite.q': 'Can I get Premium for free?'`, A `'landing.faq.invite.a': 'Yes. Every account has an invite link: a friend who joins with it gets 7 days of Premium (or Premium for life while Founding 50 spots last), and you earn a point when they link their EA account. 2 points buy 7 days, 3 buy 14, 5 buy 30, or turn them into a gift code.'` Write ro + it.
PlanCard, under the free plan text: `<p className="muted">{t('plan.inviteHint')}</p>` with `'plan.inviteHint': 'Invite friends to earn Premium days. See "Invite friends" below.'` (ro + it).
Add the FAQ entry to the landing FAQ array the same way the existing Gallery/Premium entry was added (see commit `675d4fe`).

- [ ] **Step 2: Docs**

`docs/architecture.md`: a "Referrals" paragraph. Cover the three tables, the invite going pending → granted on the `/api/hello` link right after Founding 50, one point per persona, and the points ledger. `CLAUDE.md` Layout: add `referrals.ts` pure invite/points rules, `db/referrals.ts` codes + points transactions, and `admin/codes.ts`.

- [ ] **Step 3: Full verification**

Run: `npm run i18n:check && npm run typecheck && npm test && npm run build`. Expected: all clean. Paste the summary lines into the final report.
Browser pass at 1280px and 390px: landing FAQ, onboarding with `?ref=`, Settings card, admin Codes tab. Check that `prefers-reduced-motion` adds no new animation and that the console has no `[csp]` warnings (no new origins were added).

- [ ] **Step 4: Commit**

```bash
git add web/src docs CLAUDE.md
git commit -m "docs(referrals): FAQ, plan hint, architecture notes"
```

Then use superpowers:finishing-a-development-branch. Ask before pushing.
