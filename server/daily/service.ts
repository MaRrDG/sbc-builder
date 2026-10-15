// server/daily/service.ts
// Today's answer (picked at the drop, or lazily on the first request after it) and the three game
// flows: signed in (state in daily_plays, points), signed out (signed state token), Practice (encrypted
// answer + signed state). The answer never leaves the server before its game is finished.
import { randomBytes, randomInt } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SessionError } from '../ea.js';
import { DATA_DIR } from '../store.js';
import { lastSbcDrop } from '../sync.js';
import { logDailyWin, logPoints } from '../db/events.js';
import { answerFor, answersBetween, answersSince, dayTotals, firstAnswer, guessDaily, insertAnswer, lowestPersonaOf, playOf, playsOf, recordAnonGuess } from '../db/daily.js';
import { leaderboardSource, profileOf } from '../db/dailyProfile.js';
import { dayFor, dropDate, nextDropAfter, staleDay } from './day.js';
import { applyGuess, gameView, progressOf, toPublic, type GameView, type GuessRow, type Silhouette, type Answer } from './game.js';
import { RECENT_DAYS, pickPool, poolOf } from './pool.js';
import { rankLeaderboard, type LbRow } from './leaderboard.js';
import { buildHistory, historyPage, withMine, type HistoryDay } from './history.js';
import { loadPlayers, namesList, playerById, playerRows } from './store.js';
import { statsOf, type Stats } from './streak.js';
import { openPractice, sealPractice, signState, verifyState } from './tokens.js';
import type { PlayerRow } from './types.js';

const TZ = process.env.SBC_DROP_TZ ?? 'Europe/Bucharest';
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);
const POOL = {
  minRating: num(process.env.DAILY_MIN_RATING, 82), // tuned in Task 7
  minPool: num(process.env.DAILY_MIN_POOL, 150),
  floor: num(process.env.DAILY_RATING_FLOOR, 75),
};
/** Below this many players there is no game at all (a fresh players table would repeat the same few). */
const HARD_MIN_POOL = num(process.env.DAILY_HARD_MIN_POOL, 30);
/** The women's answer pool (top women's leagues), picked with chance DAILY_WOMEN_SHARE when it has DAILY_WOMEN_HARD_MIN players. */
const WOMEN_POOL = {
  minRating: num(process.env.DAILY_WOMEN_MIN_RATING, 82),
  minPool: num(process.env.DAILY_WOMEN_MIN_POOL, 30),
  floor: num(process.env.DAILY_WOMEN_RATING_FLOOR, 75),
};
/** The Icon answer pool (every Icon, both genders; all are 88+, so no threshold by default), picked with
 *  chance ICON_SHARE when it has ICON_HARD_MIN players. Shares are clamped and capped in pool.ts `shares`. */
const ICON_POOL = { minRating: num(process.env.DAILY_ICON_MIN_RATING, 0), minPool: 0, floor: 0 };
const PICK = {
  womenShare: num(process.env.DAILY_WOMEN_SHARE, 0.15),
  iconShare: num(process.env.DAILY_ICON_SHARE, 0.2),
  womenHardMin: num(process.env.DAILY_WOMEN_HARD_MIN, 10),
  iconHardMin: num(process.env.DAILY_ICON_HARD_MIN, 10),
};
const ROLL = 1_000_000;

/** The pool one answer is drawn from; `dailyNoPool` while the men's pool is under HARD_MIN_POOL. */
function answerPool(recent: ReadonlySet<number>, now: number): PlayerRow[] {
  const rows = [...playerRows()];
  const men = poolOf(rows, { ...POOL, recent, now }).players;
  if (men.length < HARD_MIN_POOL) throw err('dailyNoPool', 503, 'The daily game is not ready yet.');
  const women = poolOf(rows, { ...WOMEN_POOL, recent, now, side: 'women' }).players;
  const icons = poolOf(rows, { ...ICON_POOL, recent, now, side: 'icons' }).players;
  return pickPool({ men, women, icons }, randomInt(ROLL) / ROLL, PICK);
}
const SECRET_MIN = 32; // characters, for DAILY_SECRET and data/daily-secret alike
const PRACTICE_TTL = 24 * 3_600_000;

let secret: Promise<string> | null = null;
export function dailySecret(): Promise<string> {
  if (secret) return secret;
  const p = (async () => {
    const env = process.env.DAILY_SECRET;
    if (env && env.length >= SECRET_MIN) return env;
    if (env) console.warn(`[daily] DAILY_SECRET is shorter than ${SECRET_MIN} characters, using data/daily-secret`);
    const file = join(DATA_DIR, 'daily-secret');
    const have = (await readFile(file, 'utf8').catch(() => '')).trim();
    if (have.length >= SECRET_MIN) return have;
    const fresh = randomBytes(32).toString('hex');
    await writeFile(file, fresh, { mode: 0o600 });
    return fresh;
  })();
  secret = p;
  p.catch(() => { if (secret === p) secret = null; }); // a failed read/write is retried next request
  return p;
}

const known = (id: number) => playerById(id) !== undefined;
const err = (code: string, status: number, msg: string) => new SessionError(msg, status, code);

export interface Today { day: number; date: string; nextAt: number; answer: PlayerRow }
let today: { drop: number; p: Promise<Today> } | null = null;

/** Today's game; picks and stores the answer once per drop (single flight per process). */
export function todayGame(now = Date.now()): Promise<Today> {
  const drop = lastSbcDrop(new Date(now));
  if (today?.drop === drop) return today.p;
  const p = pick(drop, now);
  today = { drop, p };
  p.catch(() => { if (today?.p === p) today = null; }); // a failed pick (empty pool) is retried next request
  return p;
}

/** Today's day number without picking an answer or needing a pool (same computation as pick). */
export async function currentDay(now = Date.now()): Promise<number> {
  return dayFor(lastSbcDrop(new Date(now)), await firstAnswer());
}

async function pick(drop: number, now: number): Promise<Today> {
  await loadPlayers();
  const day = dayFor(drop, await firstAnswer());
  let row = await answerFor(day);
  if (!row) {
    const recent = new Set(await answersSince(day - RECENT_DAYS));
    const players = answerPool(recent, now);
    await insertAnswer({ day, date: dropDate(drop, TZ), dropAt: drop, assetId: players[randomInt(players.length)].assetId });
    row = await answerFor(day); // another process may have won the insert: the stored one counts
  }
  const answer = row && playerById(row.assetId);
  if (!row || !answer) throw err('dailyNoPool', 503, 'The daily game is not ready yet.');
  return { day, date: row.date, nextAt: nextDropAfter((d) => lastSbcDrop(d), now), answer };
}

/** Picks the next answer right after each drop, so the first visitor does not wait. */
export function scheduleDaily() {
  const arm = () => {
    const wait = Math.max(5_000, nextDropAfter((d) => lastSbcDrop(d), Date.now()) - Date.now() + 5_000);
    setTimeout(() => { todayGame().catch((e) => console.warn('[daily] pick failed:', (e as Error).message)).finally(arm); }, Math.min(wait, 2 ** 31 - 1)).unref();
  };
  arm();
}

export interface GuessResult { row: GuessRow; finished: boolean; won: boolean; silhouette?: Silhouette; answer?: Answer | null; state?: string; stats?: Stats; points?: { added: number; streak: number } }

const result = (view: GameView, extra: Partial<GuessResult> = {}): GuessResult => ({
  row: view.rows[view.rows.length - 1], finished: view.finished, won: view.won,
  ...(view.silhouette ? { silhouette: view.silhouette } : {}), ...(view.answer !== undefined ? { answer: view.answer } : {}), ...extra,
});

const answerOf = (r: PlayerRow): Answer => ({ ...toPublic(r), fullName: r.fullName, rareflag: r.rareflag });
let prevCache: { day: number; p: Promise<{ day: number; answer: Answer } | null> } | null = null;

/** Yesterday's answer, for everyone: signed-out games hide today's answer until the drop reveals it here. */
function previousAnswer(day: number): Promise<{ day: number; answer: Answer } | null> {
  if (prevCache?.day === day) return prevCache.p;
  const p = answerFor(day - 1).then((r) => {
    const a = r && playerById(r.assetId);
    return a ? { day: day - 1, answer: answerOf(a) } : null;
  });
  prevCache = { day, p };
  p.catch(() => { if (prevCache?.p === p) prevCache = null; });
  return p;
}

export async function dailyInfo(userId: string | null) {
  const t = await todayGame();
  await loadPlayers();
  const base = {
    day: t.day, date: t.date, nextAt: t.nextAt, maxGuesses: 5 as const, signedIn: !!userId, players: namesList().players.length,
    previous: await previousAnswer(t.day).catch(() => null),
  };
  if (!userId) return base;
  const guesses = await playOf(userId, t.day);
  const view = gameView(progressOf(guesses, t.answer.assetId), t.answer, playerById);
  // eaLinked: streak points need an EA account the user owns (server/db/daily.ts guessDaily)
  return { ...base, me: await profileOf(userId), eaLinked: (await lowestPersonaOf(userId)) !== null, game: { ...view, stats: statsOf(await playsOf(userId), t.day) } };
}

let historyCache: { day: number; at: number; p: Promise<HistoryDay<Answer>[]> } | null = null;

async function historyDays(until: number, from: number): Promise<HistoryDay<Answer>[]> {
  await loadPlayers();
  const [answers, totals] = await Promise.all([answersBetween(from, until - 1), dayTotals(from, until - 1)]);
  return buildHistory(until, answers, totals, (id) => { const r = playerById(id); return r ? answerOf(r) : null; });
}

/**
 * 30 past days (never today) ending before `before` (first page without it), for everyone; signed in adds the
 * user's own result per day. Only the first page is cached (60 s); older pages are rare and change little.
 */
export async function dailyHistory(userId: string | null, before?: unknown): Promise<{ days: HistoryDay<Answer>[]; more: boolean }> {
  const today = await currentDay();
  const { until, from, more } = historyPage(today, before);
  let days: HistoryDay<Answer>[];
  if (until === today) {
    if (!historyCache || historyCache.day !== today || Date.now() - historyCache.at > 60_000) {
      const p = historyDays(until, from);
      historyCache = { day: today, at: Date.now(), p };
      p.catch(() => { if (historyCache?.p === p) historyCache = null; });
    }
    days = await historyCache.p;
  } else days = await historyDays(until, from);
  return { days: userId ? withMine(days, await playsOf(userId)) : days, more };
}

let lbCache: { at: number; rows: LbRow[] } | null = null;
let lbGen = 0; // bumped on invalidation so an in-flight refill cannot overwrite it with stale rows
export const invalidateLeaderboard = () => { lbGen++; lbCache = null; };

export async function publicLeaderboard(userId: string | null) {
  const day = await currentDay();
  let rows: LbRow[];
  if (lbCache && Date.now() - lbCache.at <= 60_000) rows = lbCache.rows;
  else {
    const gen = lbGen;
    rows = rankLeaderboard((await leaderboardSource(false)).map((s) => ({ userId: s.userId, username: s.username!, plays: s.plays })), day);
    if (gen === lbGen) lbCache = { at: Date.now(), rows };
  }
  const pub = (r: LbRow) => ({ rank: r.rank, username: r.username, wins: r.wins, played: r.played, winPct: r.winPct, avgGuesses: r.avgGuesses, streak: r.streak, oneGuessWins: r.oneGuessWins });
  const mine = userId ? rows.find((r) => r.userId === userId) : undefined;
  return { rows: rows.slice(0, 50).map(pub), me: mine ? { ...pub(mine), inTop: mine.rank <= 50 } : null, total: rows.length };
}

/** `ipHash` (server/ip-hash.ts) goes only into the admin event log of a signed-in win. */
export async function guessToday(userId: string | null, assetId: number, state: unknown, day?: unknown, ipHash: string | null = null): Promise<GuessResult> {
  const t = await todayGame();
  // a page left open across the drop must not have its guess counted toward the new day
  if (staleDay(day, t.day)) throw err('dailyExpired', 409, 'This game has expired.');
  const a = t.answer.assetId;
  if (userId) {
    const r = await guessDaily(userId, t.day, a, assetId, known);
    if ('error' in r) throw guessError(r.error);
    if (r.progress.won) {
      logDailyWin(userId, r.progress.guesses.length, ipHash);
      if (r.points && r.points.added > 0) logPoints(userId, { delta: r.points.added, reason: 'daily_streak', ref: String(t.day) }, ipHash);
    }
    const view = gameView(r.progress, t.answer, playerById);
    return result(view, {
      ...(r.progress.finished ? { stats: statsOf(await playsOf(userId), t.day) } : {}),
      ...(r.points ? { points: r.points } : {}),
    });
  }
  const k = `d${t.day}`;
  const s = state === undefined || state === null ? { k, g: [] } : verifyState(await dailySecret(), state, k);
  if (!s) throw err('dailyExpired', 409, 'This game has expired.');
  const p = applyGuess(s.g, assetId, a, known);
  if ('error' in p) throw guessError(p.error);
  // a counter failure never fails the guess
  await recordAnonGuess(t.day, assetId, p.finished ? { won: p.won, guesses: p.guesses.length } : null)
    .catch((e) => console.warn('[daily] anon count failed:', (e as Error).message));
  // signed out: a lost game's answer stays hidden until the next drop (see game.ts); Practice below still shows it
  return result(gameView(p, t.answer, playerById, { hideAnswer: true }), { state: signState(await dailySecret(), { k, g: p.guesses }) });
}

export async function newPractice(now = Date.now()): Promise<{ token: string }> {
  await loadPlayers();
  const players = answerPool(new Set(), now);
  const a = players[randomInt(players.length)].assetId;
  return { token: sealPractice(await dailySecret(), { id: randomBytes(9).toString('base64url'), a, exp: now + PRACTICE_TTL }) };
}

export async function guessPractice(token: unknown, assetId: number, state: unknown, now = Date.now()): Promise<GuessResult> {
  await loadPlayers(); // a fresh process must know the players before it judges the token or the guess
  const sec = await dailySecret();
  const pr = openPractice(sec, token, now);
  const answer = pr && playerById(pr.a);
  if (!pr || !answer) throw err('dailyExpired', 409, 'This game has expired.');
  const k = `p${pr.id}`;
  const s = state === undefined || state === null ? { k, g: [] } : verifyState(sec, state, k);
  if (!s) throw err('dailyExpired', 409, 'This game has expired.');
  const p = applyGuess(s.g, assetId, pr.a, known);
  if ('error' in p) throw guessError(p.error);
  return result(gameView(p, answer, playerById), { state: signState(sec, { k, g: p.guesses }) });
}

function guessError(code: 'dailyFinished' | 'dailyRepeat' | 'dailyUnknownPlayer') {
  if (code === 'dailyUnknownPlayer') return err(code, 400, 'Pick a player from the list.');
  return err(code, 409, code === 'dailyRepeat' ? 'You already guessed that player.' : 'This game is over.');
}
