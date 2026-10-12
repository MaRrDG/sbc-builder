// What changed in FC Solver, for users: the /changelog page (en / ro / it) and the bot's 📜・changelog posts (English).
// One entry per deploy day with user-visible changes, newest first. Each language is written for its readers, not
// machine-translated. A second entry on the same day gets the id `YYYY-MM-DD-2`. `npm test` checks the list.

/** The product version. Stays "1" until the public launch. */
export const APP_VERSION = '1';

export type ChangelogLang = 'en' | 'ro' | 'it';
export const CHANGELOG_LANGS: readonly ChangelogLang[] = ['en', 'ro', 'it'];

export interface ChangelogEntry {
  /** The date, or `YYYY-MM-DD-N` for a later entry the same day. */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  items: Record<ChangelogLang, string[]>;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-10-12',
    date: '2026-10-12',
    items: {
      en: [
        'FC Solver v1: the cheapest squad from your own club for every SBC, on a pitch that looks like the web app',
        'Your Club, Evolutions, the FUT Gallery planner and Objectives squads, all from what the web app already loads',
        'FC Solver Daily: guess the EA FC player of the day, with streaks and a leaderboard',
        'Our Discord server, with /sbc, /stats and /daily straight from the bot',
        'This changelog: every update is listed here and posted in 📜・changelog on Discord',
      ],
      ro: [
        'FC Solver v1: cel mai ieftin lot din clubul tău pentru fiecare SBC, pe un teren ca în web app',
        'Clubul, Evolutions, planificatorul FUT Gallery și loturile pentru Objectives, toate din ce încarcă deja web app-ul',
        'FC Solver Daily: ghicești jucătorul EA FC al zilei, cu serii și clasament',
        'Serverul nostru de Discord, cu /sbc, /stats și /daily direct din bot',
        'Acest changelog: fiecare update apare aici și în 📜・changelog pe Discord',
      ],
      it: [
        'FC Solver v1: la rosa più economica del tuo club per ogni SBC, su un campo identico a quello della web app',
        'Il tuo Club, le Evoluzioni, il planner della FUT Gallery e le rose per gli Obiettivi, tutto da ciò che la web app carica già',
        'FC Solver Daily: indovina il giocatore EA FC del giorno, con serie e classifica',
        'Il nostro server Discord, con /sbc, /stats e /daily direttamente dal bot',
        'Questo changelog: ogni aggiornamento è elencato qui e pubblicato in 📜・changelog su Discord',
      ],
    },
  },
];

const ID = /^(\d{4}-\d{2}-\d{2})(?:-(\d+))?$/;
const seq = (id: string) => Number(ID.exec(id)?.[2] ?? 1);
/** a is newer than b: later date, or the same date with a higher `-N`. */
const newer = (a: ChangelogEntry, b: ChangelogEntry) => a.date > b.date || (a.date === b.date && seq(a.id) > seq(b.id));

/** Problems with the list (empty = fine): every language, same item count, no empty text, unique ids, newest first. */
export function checkEntries(entries: ChangelogEntry[]): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  entries.forEach((e, i) => {
    const m = ID.exec(e.id);
    if (!m || m[1] !== e.date) out.push(`${e.id}: id must be the date (YYYY-MM-DD or YYYY-MM-DD-N)`);
    if (ids.has(e.id)) out.push(`${e.id}: duplicate id`);
    ids.add(e.id);
    const counts = CHANGELOG_LANGS.map((l) => e.items[l]?.length ?? -1);
    for (const l of CHANGELOG_LANGS) if (!e.items[l]) out.push(`${e.id}: missing ${l}`);
    if (counts.some((c) => c >= 0 && c !== counts[0]))
      out.push(`${e.id}: item counts differ (${CHANGELOG_LANGS.map((l, j) => `${l} ${counts[j]}`).join(', ')})`);
    if (counts[0] === 0) out.push(`${e.id}: no items`);
    if (CHANGELOG_LANGS.some((l) => e.items[l]?.some((s) => !s.trim()))) out.push(`${e.id}: empty item`);
    if (i > 0 && entries[i - 1].id !== e.id && !newer(entries[i - 1], e)) out.push(`${e.id}: not older than ${entries[i - 1].id} (newest first)`);
  });
  return out;
}

/** The newest `n` entries with their English items: what the Discord bot posts. */
export const latestEnglish = (entries: ChangelogEntry[], n: number) =>
  entries.slice(0, n).map((e) => ({ id: e.id, date: e.date, items: e.items.en }));

/** True when the newest entry is not the last one the user saw. */
export const hasUnread = (entries: ChangelogEntry[], seen: string | null) => entries.length > 0 && entries[0].id !== seen;
