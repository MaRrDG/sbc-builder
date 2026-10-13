// What changed in FC Solver, for users: the /changelog page (en / ro / it) and the bot's 📝・changelog posts (English).
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
    id: '2026-10-13',
    date: '2026-10-13',
    items: {
      en: [
        'Faster dashboard: your SBCs and club show up at once when you open FC Solver, and syncs show their progress live in the new activity panel without blocking the page',
        'Extension 1.0.3: syncs start right away',
        'A new 404 page: a wrong link now opens a pack instead of a blank screen',
        'Settings → Your data: download everything FC Solver keeps about you, or delete your account (you have 7 days to change your mind)',
        'Daily: if you lose while signed out, the answer is revealed after the next drop (yesterday\'s player is shown on the Daily page). A win in 1 guess still keeps your streak, but pays no points and doesn\'t count on the leaderboard',
      ],
      ro: [
        'Dashboard mai rapid: SBC-urile și clubul apar imediat ce deschizi FC Solver, iar sincronizările își arată progresul în timp real în noul panou de activitate, fără să blocheze pagina',
        'Extensia 1.0.3: sincronizările pornesc pe loc',
        'Pagină 404 nouă: un link greșit deschide acum un pachet, nu un ecran gol',
        'Setări → Datele tale: descarci tot ce păstrează FC Solver despre tine sau îți ștergi contul (ai 7 zile să te răzgândești)',
        'Daily: dacă pierzi jucând fără cont, răspunsul apare după următorul drop (jucătorul de ieri e afișat pe pagina Daily). O victorie din prima încercare îți păstrează seria, dar nu aduce puncte și nu contează în clasament',
      ],
      it: [
        'Dashboard più veloce: SBC e club compaiono subito quando apri FC Solver, e le sincronizzazioni mostrano i progressi in tempo reale nel nuovo pannello attività, senza bloccare la pagina',
        'Estensione 1.0.3: le sincronizzazioni partono subito',
        'Nuova pagina 404: un link sbagliato ora apre un pacchetto invece di una schermata vuota',
        'Impostazioni → I tuoi dati: scarica tutto ciò che FC Solver conserva su di te, oppure elimina il tuo account (hai 7 giorni per ripensarci)',
        'Daily: se perdi giocando senza accedere, la risposta viene svelata dopo il prossimo drop (il giocatore di ieri è sulla pagina Daily). Una vittoria al primo tentativo mantiene la serie, ma non dà punti e non conta in classifica',
      ],
    },
  },
  {
    id: '2026-10-12',
    date: '2026-10-12',
    items: {
      en: [
        'FC Solver v1: the cheapest squad from your own club for every SBC, on a pitch that looks like the web app',
        'Your Club, Evolutions, the FUT Gallery planner and Objectives squads, all from what the web app already loads',
        'FC Solver Daily: guess the EA FC player of the day, with streaks and a leaderboard',
        'Our Discord server, with /sbc, /stats and /daily straight from the bot',
        'This changelog: every update is listed here and posted in 📝・changelog on Discord',
        'Premium as a subscription: 5 € a month or 36 € a year, paid securely through Paddle, cancel anytime in Settings',
        'Changed your mind? A full refund within 14 days of any payment, see the new refund policy',
        'FC Solver installs as an app on your phone: add it to your home screen from the menu. Syncing with EA still runs on your PC',
        'Extension 1.0.2: pause and resume syncing from the extension popup. While paused, FC Solver asks EA for nothing',
      ],
      ro: [
        'FC Solver v1: cel mai ieftin lot din clubul tău pentru fiecare SBC, pe un teren ca în web app',
        'Clubul, Evolutions, planificatorul FUT Gallery și loturile pentru Objectives, toate din ce încarcă deja web app-ul',
        'FC Solver Daily: ghicești jucătorul EA FC al zilei, cu serii și clasament',
        'Serverul nostru de Discord, cu /sbc, /stats și /daily direct din bot',
        'Acest changelog: fiecare update apare aici și în 📝・changelog pe Discord',
        'Premium ca abonament: 5 € pe lună sau 36 € pe an, cu plata sigură prin Paddle, și îl anulezi oricând din Setări',
        'Te-ai răzgândit? Îți dăm banii înapoi integral în 14 zile de la orice plată, vezi noua politică de rambursare',
        'FC Solver se instalează ca aplicație pe telefon: o adaugi pe ecranul principal din meniu. Sincronizarea cu EA rulează în continuare pe PC-ul tău',
        'Extensia 1.0.2: oprești și pornești sincronizarea din popup-ul extensiei. Cât e pe pauză, FC Solver nu cere nimic de la EA',
      ],
      it: [
        'FC Solver v1: la rosa più economica del tuo club per ogni SBC, su un campo identico a quello della web app',
        'Il tuo Club, le Evoluzioni, il planner della FUT Gallery e le rose per gli Obiettivi, tutto da ciò che la web app carica già',
        'FC Solver Daily: indovina il giocatore EA FC del giorno, con serie e classifica',
        'Il nostro server Discord, con /sbc, /stats e /daily direttamente dal bot',
        'Questo changelog: ogni aggiornamento è elencato qui e pubblicato in 📝・changelog su Discord',
        'Premium in abbonamento: 5 € al mese o 36 € all’anno, pagamento sicuro tramite Paddle, disdici quando vuoi dalle Impostazioni',
        'Hai cambiato idea? Rimborso completo entro 14 giorni da ogni pagamento: trovi tutto nella nuova politica di rimborso',
        'FC Solver si installa come app sul telefono: aggiungila alla schermata Home dal menu. La sincronizzazione con EA continua a girare sul tuo PC',
        'Estensione 1.0.2: metti in pausa e riprendi la sincronizzazione dal popup dell’estensione. In pausa, FC Solver non chiede nulla a EA',
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
