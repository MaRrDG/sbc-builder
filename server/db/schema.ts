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
