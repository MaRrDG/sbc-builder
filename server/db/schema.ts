// Shared, account-independent data. Per-account data (club, squad, progress) stays in data/accounts/.
import { bigint, boolean, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { BrickSlot } from '../layout.js';

const seen = () => ({
  firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
  lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
});

/** Every SBC set ever seen: latest definition as EA sent it. */
export const sbcSets = pgTable('sbc_sets', {
  setId: integer('set_id').primaryKey(),
  name: text('name').notNull().default(''),
  description: text('description').notNull().default(''),
  categoryId: integer('category_id'),
  repeatabilityMode: text('repeatability_mode'),
  endTime: bigint('end_time', { mode: 'number' }), // unix seconds
  raw: jsonb('raw').notNull(),
  ...seen(),
});

/** Every challenge ever seen: latest definition as EA sent it. */
export const challenges = pgTable('challenges', {
  challengeId: integer('challenge_id').primaryKey(),
  setId: integer('set_id').notNull().references(() => sbcSets.setId),
  name: text('name').notNull().default(''),
  type: text('type'),
  formation: text('formation'),
  elgOperation: text('elg_operation'),
  elgReq: jsonb('elg_req').notNull(),
  raw: jsonb('raw').notNull(),
  ...seen(),
});

/** One row per account and distinct layout it reported for a brick challenge. */
export const brickReports = pgTable(
  'brick_reports',
  {
    id: serial('id').primaryKey(),
    challengeId: integer('challenge_id').notNull().references(() => challenges.challengeId),
    personaId: bigint('persona_id', { mode: 'number' }).notNull(),
    layout: jsonb('layout').$type<BrickSlot[]>().notNull(),
    layoutHash: text('layout_hash').notNull(),
    capturedAt: timestamp('captured_at', { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex('brick_reports_unique').on(t.challengeId, t.personaId, t.layoutHash),
    index('brick_reports_challenge').on(t.challengeId),
  ],
);

/** Accounts whose report wins outright. Managed with `npm run db:trust`. */
export const trustedAccounts = pgTable('trusted_accounts', {
  personaId: bigint('persona_id', { mode: 'number' }).primaryKey(),
  note: text('note').notNull().default(''),
  addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
});

/** FC Solver users, keyed by their Clerk user id; `plan` + the weekly solve quota (server/plan.ts). */
export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  plan: text('plan').notNull().default('free'), // 'free' | 'premium'
  premiumUntil: timestamp('premium_until', { withTimezone: true }), // null: no end
  quotaStart: timestamp('quota_start', { withTimezone: true }), // null: no open window
  quotaUsed: integer('quota_used').notNull().default(0),
  // Founding 50: when this user got lifetime Premium for being among the first to link an EA
  // account, and which persona earned it (one persona earns one spot, however often it moves)
  founderAt: timestamp('founder_at', { withTimezone: true }),
  founderPersona: bigint('founder_persona', { mode: 'number' }),
  lang: text('lang').notNull().default('en'), // 'en' | 'ro' | 'it', for emails; the site saves it on change
  evoEmails: boolean('evo_emails').notNull().default(true), // evolution training emails (Premium)
  // onboarding survey (server/onboarding.ts); onboardedAt is set on answer or skip, answers stay null on a skip
  heardFrom: text('heard_from'),
  futYears: text('fut_years'),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  invitedBy: text('invited_by'), // userId whose invite code this user used (once per account)
  // last link refused because the EA account already had PERSONA_USER_LIMIT accounts; cleared on a link
  linkBlockedAt: timestamp('link_blocked_at', { withTimezone: true }),
}, (t) => [uniqueIndex('users_founder_persona').on(t.founderPersona)]); // one spot per EA account, even without the lock

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
    reason: text('reason').notNull(), // 'invite' | 'spend' | 'gift' | 'admin' | 'daily_streak'
    ref: text('ref').notNull().default(''), // invitee userId / days / gift code
    personaId: bigint('persona_id', { mode: 'number' }),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('point_ledger_user').on(t.userId), uniqueIndex('point_ledger_invite_persona').on(t.personaId).where(sql`reason = 'invite'`),
    uniqueIndex('point_ledger_daily').on(t.userId, t.ref).where(sql`reason = 'daily_streak'`),
  ],
);

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

/** Every FC Solver user an EA persona was ever linked to (server/auth-rules.ts PERSONA_USER_LIMIT). */
export const personaLinks = pgTable(
  'persona_links',
  {
    personaId: bigint('persona_id', { mode: 'number' }).notNull(),
    userId: text('user_id').notNull(),
    linkedAt: timestamp('linked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.personaId, t.userId] })],
);

/** Short-lived, single-use tokens the signed-in site hands the extension. Only the hash is kept. */
export const linkTokens = pgTable('link_tokens', {
  tokenHash: text('token_hash').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

/** Admin history: solves, syncs, EA throttles and per-day EA request counts (server/db/events.ts). */
export const events = pgTable(
  'events',
  {
    id: serial('id').primaryKey(),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
    type: text('type').notNull(), // 'solve' | 'sync' | 'ea_error' | 'ea_day'
    userId: text('user_id'),
    personaId: bigint('persona_id', { mode: 'number' }),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [index('events_type_at').on(t.type, t.at), index('events_user_at').on(t.userId, t.at)],
);

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

/** Daily game: every player seen in any cached EA item (server/daily/players.ts merges them). */
export const players = pgTable(
  'players',
  {
    assetId: integer('asset_id').primaryKey(),
    name: text('name').notNull(),
    fullName: text('full_name').notNull(),
    nation: integer('nation').notNull(),
    league: integer('league').notNull(),
    club: integer('club').notNull(),
    position: text('position').notNull(),
    rating: integer('rating').notNull(),
    rareflag: integer('rareflag').notNull(),
    cardType: text('card_type').notNull(), // 'normal' | 'icon' | 'hero'
    baseClubs: jsonb('base_clubs').$type<{ club: number; league: number; lastSeen: number }[]>().notNull().default([]),
    firstSeen: timestamp('first_seen', { withTimezone: true }).notNull(),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull(),
  },
  (t) => [index('players_league_rating').on(t.league, t.rating)],
);

/** Daily game: one secret player per drop; day 1 = the first row. */
export const dailyAnswers = pgTable(
  'daily_answers',
  {
    day: integer('day').primaryKey(),
    date: text('date').notNull(), // YYYY-MM-DD in the drop time zone
    dropAt: timestamp('drop_at', { withTimezone: true }).notNull(),
    assetId: integer('asset_id').notNull(),
    pickedAt: timestamp('picked_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('daily_answers_drop').on(t.dropAt)],
);

/** Daily game: a signed-in user's game of one day (guesses = asset ids in order). */
export const dailyPlays = pgTable(
  'daily_plays',
  {
    userId: text('user_id').notNull(),
    day: integer('day').notNull(),
    guesses: jsonb('guesses').$type<number[]>().notNull().default([]),
    won: boolean('won').notNull().default(false),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day] })],
);
