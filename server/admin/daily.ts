// Admin Daily views: one day's answer, summary and games, and the full leaderboard (hidden users included).
// The only place besides a finished game that shows an answer; never reachable without requireAdmin.
import { anonDay, anonGuessCounts, answerDays, signedGamesOf } from '../db/daily.js';
import { leaderboardSource } from '../db/dailyProfile.js';
import { rankLeaderboard } from '../daily/leaderboard.js';
import { currentDay, todayGame } from '../daily/service.js';
import { loadPlayers, playerById } from '../daily/store.js';
import { daySummary, topGuessed } from '../daily/summary.js';

export async function adminDay(dayParam: unknown) {
  await loadPlayers();
  await todayGame().catch(() => null); // make sure today's answer exists even if nobody opened /daily since the drop
  const days = await answerDays();
  const want = Number(dayParam);
  const cur = days.find((d) => d.day === want) ?? days[0];
  const list = days.map((d) => ({ day: d.day, date: d.date }));
  if (!cur) return { days: list, day: 0, date: '', answer: null, summary: daySummary([], null), topGuessed: [], games: [] };
  const a = playerById(cur.assetId);
  const signed = await signedGamesOf(cur.day);
  const name = (id: number) => playerById(id)?.name ?? String(id);
  return {
    days: list, day: cur.day, date: cur.date,
    answer: a ? { id: a.assetId, name: a.name, fullName: a.fullName, rating: a.rating, position: a.position, club: a.club, league: a.league, nation: a.nation, rareflag: a.rareflag, cardType: a.cardType } : null,
    summary: daySummary(signed.filter((g) => g.finishedAt !== null), await anonDay(cur.day)),
    topGuessed: topGuessed(signed, await anonGuessCounts(cur.day)).map((t) => ({ id: t.assetId, name: name(t.assetId), count: t.count })),
    games: signed
      .map((g) => ({ userId: g.userId, email: g.email, username: g.username, guesses: g.guesses.map((id) => ({ id, name: name(id) })), won: g.won, used: g.guesses.length, finishedAt: g.finishedAt }))
      .sort((x, y) => (y.finishedAt ?? -1) - (x.finishedAt ?? -1)),
  };
}

export async function adminLeaderboard() {
  const src = await leaderboardSource(true);
  const by = new Map(src.map((s) => [s.userId, s]));
  const day = await currentDay();
  const rows = rankLeaderboard(src.map((s) => ({ userId: s.userId, username: s.username ?? s.email, plays: s.plays })), day);
  return {
    rows: rows.map((r) => {
      const s = by.get(r.userId)!;
      return { ...r, email: s.email, hidden: !s.leaderboard || !s.username, username: s.username };
    }),
  };
}
