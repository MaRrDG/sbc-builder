// What changed in FC Solver, for users: the /changelog page (en / ro / it) and the bot's 📝・changelog posts (English).
// One entry per deploy day with user-visible changes, newest first. Each language is written for its readers, not
// machine-translated. A second entry on the same day gets the id `YYYY-MM-DD-2`. `npm test` checks the list.

export type ChangelogLang = 'en' | 'ro' | 'it';
export const CHANGELOG_LANGS: readonly ChangelogLang[] = ['en', 'ro', 'it'];

export interface ChangelogEntry {
  /** The date, or `YYYY-MM-DD-N` for a later entry the same day. */
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** Semver of the release this entry shipped in; entries before 2026-10-16 have none. */
  version?: string;
  items: Record<ChangelogLang, string[]>;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-10-16-2',
    date: '2026-10-16',
    version: '1.1.0',
    items: {
      en: [
        'Installed the extension first? FC Solver now opens right after the install and tells you the one step left: sign in with the FC27 web app open. The extension popup shows "Almost done" with a "Sign in to FC Solver" button until your EA account is linked, and a small notice in the FC27 web app says one step is left',
        'Setup now puts the Chrome Web Store first (the zip is still there), and if the extension is already installed, signed-in users see "Extension found — open the FC27 web app in this browser" instead of the install steps',
        'The changelog now shows a version for each release',
      ],
      ro: [
        'Ai instalat extensia prima? FC Solver se deschide acum imediat după instalare și îți spune ce pas a mai rămas: conectează-te cu aplicația web FC27 deschisă. Fereastra extensiei arată „Aproape gata” cu un buton „Conectează-te la FC Solver” până când contul tău EA e legat, iar în aplicația web FC27 apare un mic anunț că mai ai un pas',
        'Configurarea pune acum Chrome Web Store pe primul loc (zip-ul rămâne disponibil), iar dacă extensia e deja instalată, utilizatorii conectați văd „Extensie găsită — deschide aplicația web FC27 în acest browser” în loc de pașii de instalare',
        'Istoricul modificărilor arată acum o versiune pentru fiecare lansare',
      ],
      it: [
        'Hai installato prima l\'estensione? FC Solver ora si apre subito dopo l\'installazione e ti dice qual è l\'ultimo passo: accedi con la web app FC27 aperta. Il popup dell\'estensione mostra «Quasi fatto» con un pulsante «Accedi a FC Solver» finché il tuo account EA non è collegato, e un piccolo avviso nella web app FC27 ricorda che manca un passo',
        'La configurazione ora mette il Chrome Web Store al primo posto (lo zip c\'è ancora), e se l\'estensione è già installata, chi ha effettuato l\'accesso vede «Estensione trovata — apri la web app FC27 in questo browser» al posto dei passaggi di installazione',
        'Il changelog ora mostra una versione per ogni rilascio',
      ],
    },
  },
  {
    id: '2026-10-16',
    date: '2026-10-16',
    version: '1.0.0',
    items: {
      en: ['New public SBC pages: every live SBC with its requirements, rewards and how many FC Solver players solved it, at fc-solver.app/sbcs. Open one and solve it with your own club in one click'],
      ro: ['Pagini publice pentru SBC-uri: fiecare SBC activ cu cerințele, recompensele și câți jucători FC Solver l-au rezolvat, la fc-solver.app/sbcs. Deschide unul și rezolvă-l cu clubul tău dintr-un clic'],
      it: ['Nuove pagine pubbliche per gli SBC: ogni SBC attivo con requisiti, premi e quanti giocatori FC Solver l\'hanno risolto, su fc-solver.app/sbcs. Aprine uno e risolvilo con il tuo club in un clic'],
    },
  },
  {
    id: '2026-10-15',
    date: '2026-10-15',
    items: {
      en: ['Daily: a new History button shows the past days (30 at a time, older ones a click away), with each day\'s player, your result and how many players guessed it. Open to everyone, signed in or not', 'Extension from the Chrome Web Store (1.0.7+): the update notice no longer offers a zip. Chrome updates it by itself, and the notice shows how to get it right away'],
      ro: ['Daily: noul buton Istoric arată zilele trecute (câte 30, iar pe cele mai vechi le încarci cu un clic), cu jucătorul fiecărei zile, rezultatul tău și câți l-au ghicit. E deschis pentru toți, cu sau fără cont', 'Extensia din Chrome Web Store (1.0.7+): anunțul de actualizare nu mai oferă un zip. Chrome o actualizează singur, iar anunțul arată cum o iei imediat'],
      it: ['Daily: il nuovo pulsante Storico mostra i giorni passati (30 alla volta, i più vecchi a un clic), con il giocatore di ogni giorno, il tuo risultato e quanti l\'hanno indovinato. Aperto a tutti, con o senza account', 'Estensione dal Chrome Web Store (1.0.7+): l\'avviso di aggiornamento non propone più uno zip. Chrome la aggiorna da solo, e l\'avviso spiega come averla subito'],
    },
  },
  {
    id: '2026-10-14',
    date: '2026-10-14',
    items: {
      en: [
        'Cheaper SBC squads: Solve now prices every card at EA\'s AVG and picks the squad with the lowest total. Untradeables still go first (they count at half their AVG), but a much cheaper tradeable now wins. Under the pitch you see the squad\'s AVG and "How it\'s calculated"',
        'Daily leaderboard: a win in 1 guess now shows as a win (and in your win %), with its own "1st guess" column. It still doesn\'t move you up the leaderboard',
        'My Squads: evolved players now show as in the game, with their upgraded rating, card and positions, and each card shows the position of the slot it plays in. The squad rating counts the subs too, like EA\'s'],
      ro: [
        'Echipe SBC mai ieftine: Rezolvă calculează acum fiecare card la AVG-ul de la EA și alege echipa cu totalul cel mai mic. Netranzacționabilii sunt tot primii (contează la jumătate din AVG), dar un tranzacționabil mult mai ieftin câștigă acum. Sub teren vezi AVG-ul echipei și „Cum se calculează”',
        'Clasamentul Daily: o victorie din prima încercare apare acum ca victorie (și în procentul de victorii), cu coloana ei, „Din prima”. Tot nu te urcă în clasament',
        'Echipele mele: jucătorii evoluați apar acum ca în joc, cu ratingul, cardul și pozițiile de după evoluție, iar fiecare card arată poziția pe care joacă. Ratingul echipei ține cont și de rezerve, ca la EA'],
      it: [
        'Rose SBC più economiche: Risolvi ora valuta ogni carta all\'AVG di EA e sceglie la rosa con il totale più basso. Le non scambiabili vanno ancora per prime (contano metà del loro AVG), ma una scambiabile molto più economica ora vince. Sotto il campo vedi l\'AVG della rosa e «Come si calcola»',
        'Classifica Daily: una vittoria al primo tentativo ora conta come vittoria (anche nella percentuale), con una colonna tutta sua, «Al primo». Non ti fa comunque salire in classifica',
        'Le mie rose: i giocatori evoluti ora appaiono come nel gioco, con valutazione, carta e ruoli dopo l\'evoluzione, e ogni carta mostra il ruolo in cui gioca. La valutazione della rosa conta anche le riserve, come fa EA'],
    },
  },
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
        'Gift codes: you can redeem up to 2 every 30 days, and a gift from another FC Solver account on your own EA account no longer works. Daily streak points now need an EA account linked to FC Solver (once a day per EA account); without one, your streak still counts',
        'Daily usernames: names that look like staff (admin, support, FC Solver...) are no longer allowed, and you can change your username once every 7 days',
        'Extensions older than 1.0.0 now show an update notice you can\'t hide: download the new version to keep syncing',
        'My Squads (Premium): every squad you saved in the web app with what it\'s worth at EA\'s market average, for the whole squad, starters and bench, with the AVG price under each card. Each squad is a tile with its starters on a small pitch. Press Calculate and the web app reads your squads (needs extension 1.0.5)',
      ],
      ro: [
        'Dashboard mai rapid: SBC-urile și clubul apar imediat ce deschizi FC Solver, iar sincronizările își arată progresul în timp real în noul panou de activitate, fără să blocheze pagina',
        'Extensia 1.0.3: sincronizările pornesc pe loc',
        'Pagină 404 nouă: un link greșit deschide acum un pachet, nu un ecran gol',
        'Setări → Datele tale: descarci tot ce păstrează FC Solver despre tine sau îți ștergi contul (ai 7 zile să te răzgândești)',
        'Daily: dacă pierzi jucând fără cont, răspunsul apare după următorul drop (jucătorul de ieri e afișat pe pagina Daily). O victorie din prima încercare îți păstrează seria, dar nu aduce puncte și nu contează în clasament',
        'Coduri cadou: poți folosi cel mult 2 la 30 de zile, iar un cadou de la un cont legat de același cont EA ca al tău nu mai merge. Punctele pentru seriile din Daily cer acum un cont EA legat de FC Solver (o dată pe zi pentru fiecare cont EA); fără el, seria ta contează în continuare',
        'Username-uri în Daily: numele care sună a staff (admin, support, FC Solver...) nu mai sunt permise, iar username-ul se poate schimba o dată la 7 zile',
        'Extensiile mai vechi de 1.0.0 primesc acum un anunț de actualizare care nu se poate ascunde: descarcă noua versiune ca sincronizarea să meargă mai departe',
        'Echipele mele (Premium): fiecare echipă salvată în web app și cât valorează la media de piață EA, pe toată echipa, pe titulari și pe rezerve, cu prețul AVG sub fiecare card. Fiecare echipă apare ca o cutie cu titularii pe un teren mic. Apeși Calculează și web app-ul îți citește echipele (cere extensia 1.0.5)',
      ],
      it: [
        'Dashboard più veloce: SBC e club compaiono subito quando apri FC Solver, e le sincronizzazioni mostrano i progressi in tempo reale nel nuovo pannello attività, senza bloccare la pagina',
        'Estensione 1.0.3: le sincronizzazioni partono subito',
        'Nuova pagina 404: un link sbagliato ora apre un pacchetto invece di una schermata vuota',
        'Impostazioni → I tuoi dati: scarica tutto ciò che FC Solver conserva su di te, oppure elimina il tuo account (hai 7 giorni per ripensarci)',
        'Daily: se perdi giocando senza accedere, la risposta viene svelata dopo il prossimo drop (il giocatore di ieri è sulla pagina Daily). Una vittoria al primo tentativo mantiene la serie, ma non dà punti e non conta in classifica',
        'Codici regalo: puoi riscattarne al massimo 2 ogni 30 giorni, e un regalo da un account collegato al tuo stesso account EA non funziona più. I punti serie del Daily ora richiedono un account EA collegato a FC Solver (una volta al giorno per ogni account EA); senza, la tua serie conta comunque',
        'Username del Daily: i nomi che sembrano dello staff (admin, support, FC Solver...) non sono più permessi, e puoi cambiare username una volta ogni 7 giorni',
        'Le estensioni precedenti alla 1.0.0 ora mostrano un avviso di aggiornamento che non si può nascondere: scarica la nuova versione per continuare a sincronizzare',
        'Le mie rose (Premium): ogni rosa salvata nella web app con il suo valore alla media di mercato EA, per la rosa intera, i titolari e la panchina, con il prezzo AVG sotto ogni carta. Ogni rosa è un riquadro con i titolari su un piccolo campo. Premi Calcola e la web app legge le tue rose (serve l’estensione 1.0.5)',
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

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] - pb[i];
  return 0;
}

/** The product version: the newest changelog entry's. Semver since v1 shipped (2026-10-16). */
export const APP_VERSION = CHANGELOG.find((e) => e.version)?.version ?? '1.0.0';

/** The newest `n` entries with their English items: what the Discord bot posts. */
export const latestEnglish = (entries: ChangelogEntry[], n: number) =>
  entries.slice(0, n).map((e) => ({ id: e.id, date: e.date, ...(e.version ? { version: e.version } : {}), items: e.items.en }));

/** True when the newest entry is not the last one the user saw. */
export const hasUnread = (entries: ChangelogEntry[], seen: string | null) => entries.length > 0 && entries[0].id !== seen;
