// Shared, account-independent data. Per-account data (club, squad, progress) stays in data/accounts/.
import { bigint, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
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
