// Challenges are the same for everyone; only status, timesCompleted, and submittedScore are per account. A set
// this account never touched can take its challenges from the shared copy instead of asking EA.
import { createHash } from 'node:crypto';
import type { Challenge, SbcSet } from './ea.js';

export type SeedSet = Pick<SbcSet, 'setId' | 'challengesCount' | 'challengesCompletedCount' | 'timesCompleted'>;

/** This account's copy of the set's challenges, or null when it must ask EA itself. */
export function seedChallenges(set: SeedSet, shared: Challenge[] | null): Challenge[] | null {
  if (!shared?.length || shared.length !== set.challengesCount) return null;
  if (set.challengesCompletedCount !== 0 || set.timesCompleted !== 0) return null;
  if (shared.some((c) => c.setId !== set.setId)) return null;
  const prio = (c: Challenge) => (c as Challenge & { priority?: number }).priority ?? 0;
  return [...shared]
    .sort((a, b) => prio(a) - prio(b) || a.challengeId - b.challengeId)
    .map((c) => ({ ...c, status: 'NOT_STARTED', timesCompleted: 0, ...(c.submittedScore !== undefined && { submittedScore: 0 }) }));
}

// ---- who may write the shared copy ------------------------------------------------------
// The shared `challenges` rows seed other accounts and gate brick reports, so one account must not
// decide them alone (a forged relay would reach every user). A relay always fills its own account's
// cache; the shared rows take it once a trusted account sent it, or once AGREE_PERSONAS distinct
// accounts sent the very same content. Agreement (not trusted-only) keeps seeding working for sets no
// trusted account opened, and a forger needs several EA accounts proved with a real session instead of one.

/** Distinct accounts that must relay the same challenge list before it is shared (trusted: one is enough). */
export const AGREE_PERSONAS = 2;

/** JSON with sorted object keys, so equal content always serializes equally. */
function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

/** Fields that differ per account; everything else EA sends is the same for everyone. */
const PER_ACCOUNT = new Set(['status', 'timesCompleted', 'submittedScore']);

/**
 * Fingerprint of a set's challenges as every account sees them: the whole rows (so the shared copy
 * is exactly what agreeing accounts sent, text and awards included) minus per-account progress.
 */
export function challengesFingerprint(setId: number, list: Challenge[]): string {
  const rows = [...list]
    .sort((a, b) => a.challengeId - b.challengeId)
    .map((c) => Object.fromEntries(Object.entries(c).filter(([k]) => !PER_ACCOUNT.has(k))));
  return createHash('sha256').update(stable({ setId, rows })).digest('hex');
}

/** A relayed list fit to share at all: 1 to 50 rows, each a challenge of this very set. */
export const shareableList = (setId: number, list: unknown): list is Challenge[] =>
  Array.isArray(list) && list.length > 0 && list.length <= 50 &&
  list.every((c) => !!c && typeof c === 'object' && Number.isInteger((c as Challenge).challengeId) && (c as Challenge).setId === setId);

/** 'share': write the shared rows; 'hold': keep it in the relaying account's cache only. */
export function shareDecision(trusted: boolean, agreeing: number): 'share' | 'hold' {
  return trusted || agreeing >= AGREE_PERSONAS ? 'share' : 'hold';
}

// ---- the public copy of a set ------------------------------------------------------------
// `sbc_sets` name / description / raw take whatever any account relays (the app's own data). The
// public SBC pages read only `public_snapshot`, which follows the same rule as the shared challenges:
// a trusted account, or AGREE_PERSONAS accounts that relayed the very same public fields.

/** The fields of a set that the public pages show; nothing per account. */
export interface SetSnapshot {
  name: string;
  description: string;
  categoryId: number | null;
  repeatabilityMode: string | null;
  endTime: number | null;
  raw: {
    releaseTime: number | null;
    hidden: boolean | null;
    awards: unknown[];
    repeats: number | null;
    repeatRefreshInterval: number | null;
    challengesCount: number | null;
  };
}

const numOr = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strOr = (v: unknown, d: string | null) => (typeof v === 'string' ? v : d);

/** A relayed set fit to snapshot at all: an object with a positive integer setId. */
export const shareableSet = (s: unknown): s is SbcSet =>
  !!s && typeof s === 'object' && !Array.isArray(s) && Number.isInteger((s as SbcSet).setId) && (s as SbcSet).setId > 0;

/** The public fields of a relayed set, normalized (wrong types become null, so they fail closed later). */
export function setSnapshot(s: SbcSet): SetSnapshot {
  const r = s as unknown as Record<string, unknown>;
  return {
    name: strOr(r.name, '') ?? '',
    description: strOr(r.description, '') ?? '',
    categoryId: numOr(r.categoryId),
    repeatabilityMode: strOr(r.repeatabilityMode, null),
    endTime: numOr(r.endTime),
    raw: {
      releaseTime: numOr(r.releaseTime),
      hidden: typeof r.hidden === 'boolean' ? r.hidden : null,
      awards: Array.isArray(r.awards) ? r.awards : [],
      repeats: numOr(r.repeats),
      repeatRefreshInterval: numOr(r.repeatRefreshInterval),
      challengesCount: numOr(r.challengesCount),
    },
  };
}

/** Fingerprint of a set's public fields; the `set:` prefix keeps it apart from challenge fingerprints in challenge_sightings. */
export const setFingerprint = (setId: number, snap: SetSnapshot): string =>
  `set:${createHash('sha256').update(stable({ setId, snap })).digest('hex')}`;
