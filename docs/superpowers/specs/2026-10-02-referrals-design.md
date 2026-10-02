# Invites, points and codes: design

Goal: more traffic. Every user gets an invite code and a link. A user who comes in through an invite gets Premium for 7 days. The user who invited them earns points, which they can turn into Premium or into gift codes for someone else. Admins can create promo codes. Nothing here touches EA.

## What exists already

- Premium comes from `users.plan` + `premiumUntil` (null = no end). See `server/plan.ts` `effectivePlan`.
- Founding 50 (`server/founders.ts`, `claimFounderSpot` in `server/db/users.ts`): the first 50 users to link an EA persona get lifetime Premium (`plan='premium'`, `premiumUntil=null`). A persona earns at most one spot. This runs on link, in `grantFounderSpot` (`server/index.ts:376`).
- Onboarding: `OnboardingModal.tsx` + `server/onboarding.ts` + `POST /api/onboarding`.
- There are no payments. Premium is granted only by admins and by Founding 50.

## Rules

### Codes
There are three kinds, all in one `codes` table. Every code uses the same alphabet: uppercase, no `0 O 1 I`.
- **invite**: one per user, 6 characters, created on first request. Its link is `/?ref=CODE`.
- **promo**: created by an admin. The code text is custom or generated. It grants `days` days, or lifetime when `days` is null. It has an optional `maxUses`, an optional `expiresAt`, and a `disabled` flag. A user can use each promo code once.
- **gift**: created by a user from points. It grants 7, 14 or 30 days, can be used once, and never expires. The owner cannot use their own gift code.

A single "Code" input, in onboarding and in Settings, accepts any kind. The server works out which kind it is.

### Invites
- A user can enter **one invite code for the lifetime of their account**. After that, any other invite code is refused (`err.code.inviteUsed`). There is no time window: users who signed up before this feature can also enter one.
- A user cannot use their own invite code.
- The invitee's reward is **+7 days Premium**, granted when the invitee has a linked EA persona:
  - persona already linked when they enter the code: the 7 days are granted right away;
  - no persona yet: the redemption is stored as `pending`, and the 7 days are granted on the first link.
- The inviter's reward is **+1 point**, granted at the same moment as the invitee's 7 days. Only one point is ever awarded per EA persona (`point_ledger` unique on `personaId` for the reason `invite`), so a persona linked by several Clerk accounts still earns a single point.
- Founding 50 always comes first. On link, `grantFounderSpot` runs, then the invite grant. A founder already has lifetime Premium, so the 7 days add nothing, but the inviter still gets the point.
- **Founders are shown as lifetime, never as 7 days.** Wherever the site shows the invitee's reward, a founder sees **"Premium for life · Founder"** instead of "+7 days":
  - the redeem result (onboarding and Settings): when the user is already a founder, the result is `{ founder: true }` and the text says "You're one of the first 50: Premium for life (Founder)". When the user has no persona yet, the text says "+7 days Premium once you link your EA account, or Premium for life if you're among the first 50", and shows how many spots are left (`/api/founders`);
  - after linking: if the link made the user a founder, the existing link success state shows "Premium for life · Founder";
  - `PlanCard`: a founder sees "Premium for life" + a "Founder" badge (Crown icon, not `--go`), with no end date;
  - the account menu shows the same "Founder" badge next to Premium;
  - the Settings "Invite friends" card hides "For me" and keeps only "Gift code" (already covered by the lifetime rule below).
  This needs `founder: boolean` on `PlanInfo` (`server/plans.ts`, from `users.founderAt`), returned by `/api/me`.

### Adding days
`grant(days)`: if the user has lifetime Premium (plan `premium` with `premiumUntil` null, or is a founder), nothing changes. Otherwise `plan='premium'` and `premiumUntil = max(now, premiumUntil) + days`. A promo code with lifetime sets `plan='premium'`, `premiumUntil=null`.

### Points
- Prices: **7 days = 2 points, 14 days = 3, 30 days = 5**.
- **For myself**: extends my own Premium with `grant`. This option is disabled while I have lifetime Premium.
- **Gift code**: the same price creates a `gift` code for that many days. This option is always available.
- The balance is the sum of `point_ledger.delta`. Spending runs in a transaction with an advisory lock per user, so a double click cannot spend twice. Spending fails when the balance is too low.

## Data (Drizzle, migration via `npm run db:generate`)

```
codes          code text PK, kind text ('invite'|'promo'|'gift'), ownerId text null (invite, gift),
               days int null (null = lifetime, promo only), maxUses int null, uses int default 0,
               expiresAt timestamptz null, disabled bool default false, note text default '',
               createdAt timestamptz default now()
               unique index on ownerId where kind='invite'
redemptions    id serial, code text → codes, userId text → users, status text ('pending'|'granted'),
               at timestamptz, grantedAt timestamptz null
               unique (code, userId); unique (userId) where kind='invite' (kind copied onto the row)
point_ledger   id serial, userId text, delta int, reason text ('invite'|'spend'|'gift'|'admin'),
               ref text (the invitee's userId / days / gift code), personaId bigint null, at timestamptz
               unique (personaId) where reason='invite'
users          + invitedBy text null
```

## Server

- `server/referrals.ts` (pure, tested): `codeKind`, `generateCode`, `validateRedeem(code, user, now)` → ok or msgCode, `extendPremium(row, days, now)`, `PRICES`, `canSpend(balance, days)`.
- `server/db/referrals.ts`: queries and transactions (`redeem`, `grantPendingInvite(userId, personaId)`, `spend`, `balance`, admin listing).
- Link hook: in `server/index.ts`, after `grantFounderSpot`, call `grantPendingInvite`. Like the founders grant, it never throws.
- `POST /api/redeem` gets its own limit per IP in `server/limits.ts` (e.g. 10/min), so codes cannot be guessed by trying many of them.

### API (added to `docs/api.md`)
```
GET  /api/referral              → { code, link, points, invited, pendingInvites, usedInvite, gifts: [{code, days, usedAt|null}], ledger: last 20 }
POST /api/referral/code         → { code }  (creates the user's own invite code if it does not exist)
POST /api/redeem    { code }    → { kind, days | null, pending, founder }  | 4xx { msgCode }
POST /api/points/spend { days: 7|14|30, gift: boolean } → { premiumUntil } | { giftCode }
POST /api/onboarding            + optional `code` (same as /api/redeem; a bad code does not block the survey answer)
GET  /api/admin/codes           (promo + gift, paged)
POST /api/admin/codes           { code?, days|null, maxUses?, expiresAt?, note? }
PATCH /api/admin/codes/:code    { disabled }
GET  /api/admin/codes/:code     → who used it, when, status
```
msgCodes: `err.code.unknown`, `err.code.expired`, `err.code.disabled`, `err.code.full`, `err.code.own`, `err.code.inviteUsed`, `err.code.alreadyUsed`, `err.points.low`, `err.points.lifetime`.

## Web

- **`?ref=CODE`**: `route.ts`/landing writes the code to `localStorage` (`sbc-ref`, inside try/catch). After sign-in it fills the onboarding field. If the user has already onboarded and has not used an invite code, a small banner offers to apply it. Once the code is applied or refused, the key is cleared.
- **Onboarding**: an optional "Invite or promo code" field below the two questions, with an inline result ("+7 days Premium once you link your EA account" or the error).
- **Settings, "Invite friends" card**: my code + link (copy, plus native `navigator.share` on phones), points, how many I invited and how many are pending, 3 exchange options (7d/2p, 14d/3p, 30d/5p) each with "For me" / "Gift code", my gift codes with their state, and a "Have a code?" input.
- **PlanCard / landing FAQ**: one line about the invite program. PlanCard and the account menu show the Founder badge (see Invites).
- **Admin, "Codes" tab**: a `DataTable` of codes, a create form and a disable toggle. A code's detail lists its redemptions. `UserDetail` shows points, who invited the user and how many they invited.
- All text goes through `t()` in en / ro / it (Romanian `_one/_few/_other`). `npm run i18n:check`. Check at 390px. `--go` is used only on the primary action.

## Testing

Unit tests (`npm test`) for `server/referrals.ts`: code alphabet/format, kind detection, every refusal reason, the invite-once rule, `extendPremium` (free, timed, lifetime, expired), prices and the balance check. Then typecheck + build, and a manual run in the browser against the local DB: invite → link → point, spend for me, gift code redeemed by a second user, admin promo with maxUses.

## Out of scope
Payments, expiring points, leaderboards, emails about invites, admin UI for editing point balances (the `admin` ledger reason exists for manual fixes in the DB only).
